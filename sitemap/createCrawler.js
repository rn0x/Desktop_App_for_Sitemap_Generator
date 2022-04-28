const Crawler = require('simplecrawler');
const has = require('lodash/has');

const discoverResources = require('./discoverResources');
const stringifyURL = require('./helpers/stringifyURL');
const msg = require('./helpers/msg-helper');

module.exports = (uri, options = {}, browser) => {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;
  // excluded filetypes
  let exlcudeDefaultArray = [
    'gif',
    'jpg',
    'jpeg',
    'png',
    'ico',
    'bmp',
    'ogg',
    'webp',
    'mp4',
    'webm',
    'mp3',
    'ttf',
    'woff',
    'woff2',
    'eot',
    'json',
    'rss',
    'atom',
    'gz',
    'zip',
    'rar',
    '7z',
    'css',
    'js',
    'gzip',
    'exe',
    'svg',
    'xml'
  ];
  let exlcudeURLsArray = ['/wp-json/'];
  const exclude = (options.excludeFileTypes ?
    options.excludeFileTypes :
    exlcudeDefaultArray
  ).join('|');
  const excludeURLs = (options.excludeURLs ?
    options.excludeURLs :
    exlcudeURLsArray
  ).join('|');

  const excludePatterns = (options.excludePatterns ?
    options.excludePatterns :
    []
  ).join('|');

  const extRegex = new RegExp(`\\.(${exclude})$`, 'i');
  const urlRegex = new RegExp(`\\${excludeURLs}`, 'i');
  const patternRegex = new RegExp(`${excludePatterns}`, 'i');

  const crawler = new Crawler(uri.href);

  Object.keys(options).forEach(o => {
    if (has(crawler, o)) {
      crawler[o] = options[o];
    } else if (o === 'crawlerMaxDepth') {
      // eslint-disable-next-line
      msg.warnings('Option "crawlerMaxDepth" is deprecated. Please use "maxDepth".');
      if (!options.maxDepth) {
        crawler.maxDepth = options.crawlerMaxDepth;
      }
    }
  });

  // use custom discoverResources function
  crawler.discoverResources = discoverResources({
    browser: browser,
    crawler: crawler
  }).getLinks;

  // set crawler options
  // see https://github.com/cgiffard/node-simplecrawler#configuration
  crawler.initialPath = uri.pathname !== '' ? uri.pathname : '/';
  crawler.initialProtocol = uri.protocol.replace(':', '');

  const shouldPageBeFetched = (queueItem, referrerQueueItem) => {
    // restrict to subpages if path is provided
    const initialURLRegex = new RegExp(`${uri.pathname}.*`);
    const subPageRestriction = stringifyURL(queueItem).match(initialURLRegex);

    // file type and urls exclusion
    const isExtAllowed = !queueItem.path.match(extRegex) && !queueItem.path.match(urlRegex);
    const isDomainAllowed = options.filterByDomain ? (referrerQueueItem.host === crawler.host) : true;
    const isPatternAllowed = excludePatterns.length ? !queueItem.path.match(patternRegex) : true;

    const freeAngularMarkup = stringifyURL(queueItem).indexOf('{{') === -1 && stringifyURL(queueItem).indexOf('%7B%7B') === -1;
    return subPageRestriction && isExtAllowed && isDomainAllowed && isPatternAllowed && freeAngularMarkup;
  };

  crawler.addFetchCondition((queueItem, referrerQueueItem, done) => {
    done(null, shouldPageBeFetched(queueItem, referrerQueueItem));
  });

  return crawler;
};
