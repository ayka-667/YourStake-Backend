/**
 * Puppeteer configuration.
 *
 * Chromium is only needed by the credit cashier (scraping a trade URL), which
 * cannot run on Vercel anyway. Skipping the ~170 MB download during a Vercel
 * build keeps deployments fast; it is still downloaded for local development.
 *
 * @see https://pptr.dev/guides/configuration
 */
module.exports = {
  skipDownload:
    process.env.VERCEL === "1" || process.env.PUPPETEER_SKIP_DOWNLOAD === "1",
};
