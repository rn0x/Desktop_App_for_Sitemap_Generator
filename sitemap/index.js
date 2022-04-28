const fs = require('fs');
const http = require('http');
const path = require('path');
const parseURL = require('url-parse');
const cpFile = require('cp-file');
const normalizeUrl = require('normalize-url');
const eachSeries = require('async/eachSeries');
const mitt = require('mitt');
const puppeteer = require('puppeteer');
const createCrawler = require('./createCrawler');
const SitemapRotator = require('./SitemapRotator');
const createSitemapIndex = require('./createSitemapIndex');
const extendFilename = require('./helpers/extendFilename');
const validChangeFreq = require('./helpers/validChangeFreq');
const getLangCodeMap = require('./helpers/getLangCodeMap');
const isValidURL = require('./helpers/isValidURL');
const msg = require('./helpers/msg-helper');
const getCurrentDateTime = require('./helpers/getCurrentDateTime');

module.exports = function SitemapGenerator(uri, opts) {
  let browser = null;
  const defaultOpts = {
    stripQuerystring: true,
    maxEntriesPerFile: 50000,
    filterByDomain: true,
    ignoreWWWDomain: true,
    maxDepth: 0,
    maxConcurrency: 10,
    filepath: path.join(process.cwd(), 'sitemap.xml'),
    userAgent: 'Node/SitemapGenerator',
    respectRobotsTxt: true,
    ignoreInvalidSSL: true,
    recommendAlternatives: false,
    timeout: 120000,
    decodeResponses: true,
    changeFreq: '',
    priorityMap: [],
    forcedURLs: []
  };
  if (!uri) {
    throw new Error('Requires a valid URL.');
  }

  const options = Object.assign({}, defaultOpts, opts);

  let realCrawlingDepth = 0;
  let savedOnDiskSitemapPaths = [];

  let crawler = null;

  const stats = {
    add: 0,
    ignore: 0,
    error: 0
  };
  const getQueueReadyItems = () => {
    const items = crawler.queue.filter((item) => {
      return item.visited && item.isDiscoveryProcessDone && item.fetched === true;
    });
    return items;
  };
  const mergeQueueItems = (from, to, deep) => {
    to.depth = to.depth > from.depth ? from.depth : to.depth;
    to.lastMod = to.lastMod === '' ? from.lastMod : to.lastMod;

    if (!deep) {
      return;
    }
    for (const fromAlter of from.alternatives) {
      const similarLangAlternatives = to.alternatives.filter((item) => {
        return item.lang === fromAlter.lang;
      });
      const similarURLAlternatives = to.alternatives.filter((item) => {
        return item.urlNormalized === fromAlter.urlNormalized;
      });

      if (!similarLangAlternatives.length && !similarURLAlternatives.length) {
        to.alternatives.push(fromAlter);
      } else if (similarURLAlternatives.length && !similarLangAlternatives.length) {
        //en and en-US. In this case the more specific lang should be used en-US
        similarURLAlternatives[0].lang = similarURLAlternatives[0].lang.length > fromAlter.lang.length ? similarURLAlternatives[0].lang : fromAlter.lang;
      } else if (similarLangAlternatives.length && !similarURLAlternatives.length) {
        //Same langs detected but diffrent URLs, In this case will always prefer the from's one
        similarLangAlternatives[0].url = fromAlter.url;
        similarLangAlternatives[0].urlNormalized = normalizeUrl(fromAlter.url, {
          removeTrailingSlash: false,
          forceHttps: true
        });
      }
    }
  };
  const getStats = () => {
    let queuedItems = getQueueReadyItems();
    queuedItems = queuedItems.map((item) => {
      return {
        url: item.url,
        lastMod: item.lastMod,
        canonical: item.canonical,
        lang: item.lang,
        referrer: item.referrer,
        depth: item.depth,
        protocol: item.protocol,
        path: item.path,
        uriPath: item.uriPath,
        port: item.port,
        host: item.host,
      };
    });
    const results = {
      added: stats.add || 0,
      ignored: stats.ignore || 0,
      errored: stats.error || 0,
      urls: queuedItems,
      realCrawlingDepth: realCrawlingDepth
    };
    return results;
  };
  const getPaths = () => {
    return savedOnDiskSitemapPaths;
  };

  // if changeFreq option was passed, check to see if the value is valid
  if (opts && opts.changeFreq) {
    options.changeFreq = validChangeFreq(opts.changeFreq);
  }

  const emitter = mitt();

  const parsedUrl = parseURL(
    normalizeUrl(uri, {
      stripWWW: false,
      removeTrailingSlash: false
    })
  );
  const sitemapPath = path.resolve(options.filepath);

  // we don't care about invalid certs
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const start = () => {
    crawler.start();
  };

  const stop = () => {
    if (!crawler.running) {
      msg.error('CRAWLER ALREADY STOPPED');
      return;
    }

    crawler.stop();
    setTimeout(() => {
      onCrawlerComplete();
      msg.error('STOPPING THE CRAWLER');
    }, 60000);
  };

  const queueURL = (url, referrer, force) => {
    const result = crawler.queueURL(url, referrer, force);
    if (result) {
      msg.info('NEW ITEM ADDED TO THE QUEUE MANUALLY: ' + url);
    }
  };
  // create sitemap stream
  const sitemap = SitemapRotator(options);
  const isEmittedBefore = {};
  const emitError = (code, url) => {
    isEmittedBefore[code] = isEmittedBefore[code] ? isEmittedBefore[code] : {};
    if (isEmittedBefore[code][url]) {
      return;
    }
    isEmittedBefore[code][url] = true;
    emitter.emit('error', {
      code,
      message: http.STATUS_CODES[code],
      url
    });
  };

  const onCrawlerComplete = () => {
    let queuedItems = getQueueReadyItems();
    msg.green('CRAWLER HAS ' + queuedItems.length + ' ITEMS IN THE QUEUE');
    const addBaseURLsToQueue = () => {
      msg.info('ADDING BASE URLS TO THE GENERATED SITEMAP');
      for (const url of options.forcedURLs) {
        const item = {
          depth: 100,
          lastMod: '',
          url: url.value,
          urlNormalized: normalizeUrl(url.value, {
            removeTrailingSlash: false,
            forceHttps: true
          })
        };
        item.alternatives = url.alternatives.map((alter) => {
          alter.url = alter.value;
          alter.urlNormalized = normalizeUrl(alter.url, {
            removeTrailingSlash: false,
            forceHttps: true
          });
          return alter;
        });
        const existingItem = queuedItems.filter((queueItem) => {
          return item.url === queueItem.url;
        })[0];
        if (existingItem) {
          mergeQueueItems(item, existingItem, true);
        } else {
          queuedItems.push(item);
        }
      }
    };
    const getLangFreeURL = (queueItem) => {
      const langs = getLangCodeMap(queueItem.lang);
      let pureURL = queueItem.url;
      for (const lang of langs) {
        pureURL = pureURL.replace('/' + lang, '');
      }
      return pureURL;
    };
    const recommendAlternatives = () => {
      msg.info('RECOMMENDING ALTERNATIVES');
      for (let queueItem of queuedItems) {
        const pureURL = getLangFreeURL(queueItem);
        for (let otherQueueItem of queuedItems) {
          const otherPureURL = getLangFreeURL(otherQueueItem);
          if (queueItem.url === otherQueueItem.url || pureURL !== otherPureURL) {
            continue;
          }

          let isAlternativeAddedBefore = queueItem.alternatives.filter(function(alter) {
            return (alter.urlNormalized === otherQueueItem.urlNormalized) || alter.lang === otherQueueItem.lang;
          }).length;

          if (isAlternativeAddedBefore) {
            continue;
          }
          queueItem.alternatives.push({
            url: otherQueueItem.url,
            urlNormalized: normalizeUrl(otherQueueItem.url, {
              removeTrailingSlash: false,
              forceHttps: true
            }),
            flushed: false,
            lang: otherQueueItem.lang
          });
        }

        let isSelfRefrencingAlternativeAddedBefore = queueItem.alternatives.filter(function(alter) {
          //IF THE URL WAS ADDED BEFORE OR THERE IS ANOTHER ONE FOR THIS LANG
          return (alter.urlNormalized === queueItem.urlNormalized) || alter.lang === queueItem.lang;
        }).length;
        if (queueItem.alternatives.length === 0 || isSelfRefrencingAlternativeAddedBefore) {
          continue;
        }

        queueItem.alternatives.push({
          url: queueItem.url,
          urlNormalized: normalizeUrl(queueItem.url, {
            removeTrailingSlash: false,
            forceHttps: true
          }),
          flushed: false,
          lang: queueItem.lang
        });
      }
    };

    const handleCanonicals = () => {
      msg.info('HANDLING CANONICAL URLS');
      for (let queueItem of queuedItems) {
        //CHECK IF CANONICAL ALREADY IN THE QUEUE
        const canonicalItem = queuedItems.filter((item) => {
          return queueItem.canonical === item.url && queueItem.id !== item.id;
        })[0];
        if (canonicalItem) {
          mergeQueueItems(queueItem, canonicalItem, true);
          queueItem.shouldBeDelete = true;
        }
      }
    };
    const handleUppercaseLettersURLs = () => {
      msg.info('HANDLING SIMILAR URLS BUT WITH DIFFERENT CASE LETTERS');
      for (let queueItem of queuedItems) {
        //CHECK IF CANONICAL ALREADY IN THE QUEUE
        const otherQueueItem = queuedItems.filter((item) => {
          return queueItem.url.toLowerCase() === item.url.toLowerCase() &&
            queueItem.id !== item.id;
        })[0];

        //THERE IS AN UPPER CASE LETTER
        if (otherQueueItem && (otherQueueItem.url.toLowerCase() !== otherQueueItem.url)) {
          mergeQueueItems(queueItem, otherQueueItem, true);
          queueItem.shouldBeDelete = true;
        } else if (otherQueueItem) {
          mergeQueueItems(otherQueueItem, queueItem, true);
          otherQueueItem.shouldBeDelete = true;
        }
      }
    };
    const init = () => {
      msg.green('CRAWLER COMPLETE CRAWLING THE WEBSITE');
      const finish = () => {
        sitemap.finish();

        const sitemaps = sitemap.getPaths();
        msg.info(sitemaps);
        const cb = () => emitter.emit('done', getStats());

        // move files
        if (sitemaps && sitemaps.length > 1) {
          // multiple sitemaps
          let count = 1;
          eachSeries(
            sitemaps,
            (tmpPath, done) => {
              const newPath = extendFilename(sitemapPath, `_part${count}`);
              savedOnDiskSitemapPaths.push(newPath);
              // copy and remove tmp file
              (async () => {
                await cpFile(tmpPath, newPath);
                fs.unlink(tmpPath, () => {
                  done();
                });
              })();

              count += 1;
            },
            () => {
              const filename = path.basename(sitemapPath);
              savedOnDiskSitemapPaths.push(sitemapPath);
              fs.writeFile(
                sitemapPath,
                createSitemapIndex(parsedUrl.toString(), filename, sitemaps.length),
                cb
              );
            }
          );
        } else if (sitemaps.length) {
          savedOnDiskSitemapPaths.push(sitemapPath);

          (async () => {
            msg.green('SITEMAP GENERATED ON: ' + sitemaps[0]);
            await cpFile(sitemaps[0], sitemapPath);
            msg.green('MOVING SITEMAP TO THE TARGET DIR: ' + sitemapPath);
            fs.unlink(sitemaps[0], cb);
          })();
        } else {
          cb();
        }
      };

      addBaseURLsToQueue();
      handleCanonicals();
      handleUppercaseLettersURLs();

      msg.info('STARTING WITH ITEMS THAT ARE NOT DELETED');
      queuedItems = queuedItems.filter((item) => {
        return !item.shouldBeDelete;
      });
      if (options.recommendAlternatives) {
        recommendAlternatives();
      }

      for (let queueItem of queuedItems) {
        msg.blue('FLUSHING: ' + queueItem.url + ' WITH ' + (queueItem.alternatives ? queueItem.alternatives.length : 0) + ' ALTERNATIVES');
        sitemap.addURL(queueItem);
      }
      sitemap.flush();
      // Wait extra 10 seconds to make sure that sitemaps been saved on disk
      //TODO: Refactor
      setTimeout(finish, 10000);
    };

    // Wait extra 60 seconds to make sure that all pages were handled
    setTimeout(init, 60000);
  };

  const init = async () => {
    if (options.deep) {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--lang=en-US,us']
      });
    }
    crawler = createCrawler(parsedUrl, options, browser);

    crawler.on('fetch404', ({
      url
    }) => emitError(404, url));
    crawler.on('fetchtimeout', ({
      url
    }) => emitError(408, url));
    crawler.on('fetch410', ({
      url
    }) => emitError(410, url));
    crawler.on('invaliddomain', ({
      url
    }) => emitError(403, url));
    crawler.on('fetchprevented', ({
      url
    }) => emitError(403, url));

    crawler.on('queueerror', ({
      url
    }) => emitError(500, url));
    crawler.on('fetchconditionerror', ({
      url
    }) => emitError(500, url));

    crawler.on('fetcherror', (queueItem, response) =>
      emitError(response.statusCode, queueItem.url)
    );

    crawler.on('fetchclienterror', (queueError, errorData) => {
      if (errorData.code === 'ENOTFOUND') {
        emitError(errorData.code, errorData.hostname);
      } else {
        emitError(400, errorData.message);
      }
    });

    crawler.on('fetchdisallowed', ({
      url
    }) => emitter.emit('ignore', url));

    crawler.on('queueduplicate', (queueItem) => {
      const items = crawler.queue.filter((item) => {
        return item.url === queueItem.url;
      });
      mergeQueueItems(queueItem, items[0], false);
    });

    crawler.on('fetchheaders', (queueItem, page) => {
      queueItem.flushed = false;
      queueItem.visited = true;

      let lastMod = queueItem.stateData.headers['last-modified'];
      queueItem.lastMod = getCurrentDateTime(lastMod);

      if (queueItem.depth > realCrawlingDepth) {
        realCrawlingDepth = queueItem.depth;
      }
    });

    crawler.on('fetchcomplete', (queueItem, page) => {
      const {
        url,
        depth
      } = queueItem;
      // msg.info('FETCH COMPLETE FOR ' + url);
      // check if robots noindex is present
      if (/<meta(?=[^>]+noindex).*?>/.test(page)) {
        emitter.emit('ignore', queueItem);
      } else if (isValidURL(url)) {
        msg.yellowBright('ADDING PROCESS FOR: ' + url + ' WAS DONE');
        emitter.emit('add', queueItem);
      } else {
        emitError('404', url);
      }

    });

    crawler.on('discoverycomplete', (queueItem, resources) => {});

    crawler.on('complete', onCrawlerComplete);
    emitter.on('add', (queueItem, page) => {
      stats.add++;
    });
    emitter.on('ignore', (queueItem, page) => {
      stats.ignore++;
    });
    emitter.on('error', (queueItem, page) => {
      stats.error++;
    });
  };
  (async () => {
    await init();
    emitter.emit('ready');
  })();

  return {
    getStats,
    start,
    stop,
    queueURL,
    on: emitter.on,
    off: emitter.off,
    getPaths
  };
};
