/** @format */

/**
 * Vercel entry point.
 *
 * Vercel expects a single handler per function file. The Express app is created
 * once per warm container, and the MongoDB connection is reused between
 * invocations (see `ensureReady` in ../app.js).
 */

const { getApp, ensureReady } = require("../app");

const app = getApp();

module.exports = async (req, res) => {
  try {
    await ensureReady();

    return app(req, res);
  } catch (err) {
    console.error(`Startup error: ${err.message}`);

    if (res.headersSent) {
      return;
    }

    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        success: false,
        message: "Service unavailable. Please try again in a few seconds.",
      })
    );
  }
};
