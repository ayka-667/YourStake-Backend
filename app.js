/** @format */

const path = require("path");
const express = require("express");
const hpp = require("hpp");
const cors = require("cors");

// Load local config. On Vercel the variables come from the project settings
// (dotenv simply does nothing when config/config.env is absent).
require("dotenv").config({ path: path.join(__dirname, "config", "config.env") });

const connectDB = require("./database");
const { settingInitDatabase } = require("./utils/setting");

/**
 * Socket.IO cannot run on a serverless platform (no long-lived server).
 * Callbacks mounted over HTTP still work, but they can only update the
 * database: there is nobody to push the live event to. This stub keeps
 * those routes working instead of crashing on `io.of(...)`.
 */
const createNoopIo = () => {
  const namespace = {
    to: () => ({ emit: () => {} }),
    emit: () => {},
  };

  return {
    of: () => namespace,
    to: () => ({ emit: () => {} }),
    emit: () => {},
  };
};

const getFrontendOrigins = () => {
  const origins = (process.env.SERVER_FRONTEND_URL || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : ["http://localhost:8080"];
};

let app = null;
let readyPromise = null;

/**
 * Connect to MongoDB and load the settings document once per process.
 * The promise is cached so concurrent requests share a single connection.
 */
const ensureReady = () => {
  if (!readyPromise) {
    readyPromise = (async () => {
      if (!process.env.DATABASE_URI) {
        throw new Error("DATABASE_URI is not set");
      }

      await connectDB();
      await settingInitDatabase();
    })().catch((err) => {
      readyPromise = null;
      throw err;
    });
  }

  return readyPromise;
};

const createApp = (io = createNoopIo()) => {
  const instance = express();

  // Enable if you are behind a reverse proxy
  instance.set("trust proxy", 1);

  instance.use(express.json({ limit: "2mb" }));
  instance.use(express.urlencoded({ extended: true }));
  instance.use(hpp());
  instance.use(
    cors({
      origin: getFrontendOrigins(),
      credentials: true,
    })
  );

  // Set view engine
  instance.set("view engine", "ejs");
  instance.set("views", path.join(__dirname, "views"));

  // Health check that does not need the database
  instance.get("/health", (req, res) => {
    res.status(200).json({ success: true, uptime: process.uptime() });
  });

  // Make sure the database and settings are ready before any real route runs
  instance.use(async (req, res, next) => {
    try {
      await ensureReady();

      next();
    } catch (err) {
      console.error(`Startup error: ${err.message}`);

      res.status(503).json({
        success: false,
        message: "Service unavailable. Please try again in a few seconds.",
      });
    }
  });

  // Mount routes
  instance.use("/", require("./routes")(io));
  instance.use("/public", express.static(path.join(__dirname, "public")));

  // JSON 404
  instance.use((req, res) => {
    res.status(404).json({ success: false, message: "Not found." });
  });

  // Error handler (body parser errors, hpp, etc.)
  instance.use((err, req, res, next) => {
    console.error(err);

    if (res.headersSent) {
      return next(err);
    }

    res.status(err.status || 500).json({
      success: false,
      message: err.message || "Internal server error.",
    });
  });

  return instance;
};

const getApp = (io) => {
  if (app === null) {
    app = createApp(io);
  }

  return app;
};

module.exports = {
  createApp,
  getApp,
  ensureReady,
  createNoopIo,
  getFrontendOrigins,
};
