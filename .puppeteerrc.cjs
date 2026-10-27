/**
 * Puppeteer configuration.
 *
 * Chromium is only used by the credit cashier (scraping a trade URL), which is
 * a heavy optional feature. Downloading the ~170 MB browser on every panel
 * install is slow and often fails on constrained hosts, so it is skipped by
 * default.
 *
 * If you really need it, start the server with PUPPETEER_DOWNLOAD=1, or point
 * CHROME_PATH to an existing Chrome/Chromium binary.
 *
 * @see https://pptr.dev/guides/configuration
 */
module.exports = {
  skipDownload: process.env.PUPPETEER_DOWNLOAD !== "1",
};
