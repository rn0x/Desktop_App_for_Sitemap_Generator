const url = require('url');
const cheerio = require('cheerio');
const superagent = require('superagent-interface-promise');
const normalizeUrl = require('normalize-url');
const cld = require('cld');
const msg = require('./helpers/msg-helper');

let browser = null;
let crawler = null;

const guessItemLanguage = (queueItem) => {
  const $ = queueItem.$;
  const init = (resolve, reject) => {
    let lang = $('html').attr('lang') ? $('html').attr('lang') : '';
    if (lang !== '') {
      resolve(lang);
    } else {
      cld.detect(html, {
        isHTML: true
      }, function(err, result) {
        if (err) {
          reject(err);
        }
        lang = result.languages[0].code;
        resolve(lang);
      });
    }
  };
  let promise = new Promise(init);
  return promise;
};

const discoverWithCheerio = (buffer, queueItem) => {

  queueItem.urlNormalized = normalizeUrl(queueItem.url, {
    removeTrailingSlash: false,
    forceHttps: true
  });
  queueItem.plainHTML = buffer.body ? buffer.body : buffer.toString('utf8');
  queueItem.$ = cheerio.load(queueItem.plainHTML);
  queueItem.canonical = '';
  queueItem.alternatives = [];
  queueItem.isDiscoveryProcessDone = false;

  const $ = queueItem.$;
  const metaRobots = $('meta[name="robots"]');

  if (
    metaRobots &&
    metaRobots.length &&
    /nofollow/i.test(metaRobots.attr('content'))
  ) {
    return [];
  }
  const alternatives = $('head').find('link[rel="alternate"]');
  alternatives.each(function() {
    try {
      let hreflang = $(this).attr('hreflang');
      let type = $(this).attr('type');
      let hreflangUrl = $(this).attr('href').replace('\n', '').trim();

      if (type === 'application/rss+xml') {
        return;
      }

      if (hreflangUrl !== '' && queueItem.urlNormalized === normalizeUrl(hreflangUrl, {
          removeTrailingSlash: false,
          forceHttps: true
        })) {
        // Update the original URL by it's main language
        queueItem.lang = hreflang;
      }
      if (typeof hreflang !== typeof undefined && hreflang !== false && hreflangUrl !== '') {
        queueItem.alternatives.push({
          url: hreflangUrl,
          urlNormalized: normalizeUrl(hreflangUrl, {
            removeTrailingSlash: false,
            forceHttps: true
          }),
          flushed: false,
          lang: hreflang
        });
      }

    } catch (err) {
      msg.error(err);
    }
  });

  const handleAlters = () => {
    guessItemLanguage(queueItem).then(lang => {
      queueItem.lang = queueItem.lang ? queueItem.lang : lang;
      queueItem.isDiscoveryProcessDone = true;
      delete queueItem.$;
      delete queueItem.plainHTML;
    }, (error) => {
      queueItem.isDiscoveryProcessDone = true;
      delete queueItem.$;
      delete queueItem.plainHTML;
    });
  };

  const links = () => {
    const $ = queueItem.$;
    const html = $('a[href], link[rel="canonical"]');

    // TODO: Use the maping function to handle relative URLs for alternatives;
    const links = html.map(function iteratee() {
      let href = $(this).attr('href');
      if (!href || href === '') {
        return null;
      }
      // exclude "mailto:" etc
      if (/^[a-z]+:(?!\/\/)/i.test(href)) {
        return null;
      }

      // exclude rel="nofollow" links
      const rel = $(this).attr('rel');
      if (/nofollow/i.test(rel)) {
        return null;
      } else if (rel === 'canonical') {
        queueItem.canonical = href;
      }

      // remove anchors
      href = href.replace(/(#.*)$/, '');

      // handle "//"
      if (/^\/\//.test(href)) {
        return `${queueItem.protocol}:${href}`;
      }

      // check if link is relative
      // (does not start with "http(s)" or "//")
      if (!/^https?:\/\//.test(href)) {
        const base = $('base').first();
        if (base && base.length) {
          // base tag is set, prepend it
          if (base.attr('href') !== undefined) {
            // base tags sometimes don't define href, they sometimes they only set target="_top", target="_blank"
            href = url.resolve(base.attr('href'), href);
          }
        }

        // handle links such as "./foo", "../foo", "/foo"
        if (/^\.\.?\/.*/.test(href) || /^\/[^/].*/.test(href)) {
          href = url.resolve(queueItem.url, href);
        }
      }
      return href;
    });
    return links;
  };

  (async () => {
    const resume = crawler.wait();
    if (!browser) {
      handleAlters();
      return resume();
    }
    try {
      const data = await getHTMLWithHeadlessBrowser(queueItem.url);
      queueItem.plainHTML = data.body;
      queueItem.$ = cheerio.load(queueItem.plainHTML);
      handleAlters();

      let resources = links().get();
      resources = crawler.cleanExpandResources(resources, queueItem);
      resources.forEach(function(url) {
        if (crawler.maxDepth === 0 || queueItem.depth + 1 <= crawler.maxDepth) {
          crawler.queueURL(url, queueItem);
        }
      });
      resume();
    } catch (ex) {
      msg.error(ex);
      resume();
    }

  })();

  return links().get();
};
const getHTMLWithHeadlessBrowser = async (url) => {
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en'
  });

  const result = {
    url: url,
    body: '',
    endURL: url
  };
  try {
    await page.goto(url, {
      waitLoad: true,
      waitNetworkIdle: true,
      timeout: 3000000
    });
    await page.waitForTimeout(15000);
    result.body = await page.evaluate('new XMLSerializer().serializeToString(document.doctype) + document.documentElement.outerHTML');
    result.endURL = await page.evaluate('window.location.origin');
    await page.close();

  } catch (ex) {
    msg.error(ex);
  }
  return result;
};
const getHTML = async (url) => {
  return superagent.get(url);
};
module.exports = (options) => {
  browser = options.browser;
  crawler = options.crawler;

  return {
    getLinks: discoverWithCheerio,
    getHTML: getHTML,
    getHTMLWithHeadlessBrowser: getHTMLWithHeadlessBrowser
  };
};
