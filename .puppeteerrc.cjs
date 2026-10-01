/** @type {import('puppeteer').Configuration} */
module.exports = {
  // PrintingService uses headless: true, which runs Chrome, not the separate shell.
  'chrome-headless-shell': { skipDownload: true },
};
