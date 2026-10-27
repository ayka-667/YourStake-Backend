/** @format */

const http = require("http");
const mongoose = require("mongoose");
const { Server } = require("socket.io");

const { createApp, ensureReady, getFrontendOrigins } = require("./app");

/**
 * Local / VPS entry point (npm start, npm run dev, PM2, systemd, Docker).
 *
 * Socket.IO, the game loops and the fake players live here. They require a
 * long-running process, so this is the file to run on a VPS.
 */
const start = async () => {
  try {
    await ensureReady();
  } catch (err) {
    console.error(`Startup error: ${err.message}`);
    process.exit(1);
  }

  // Create the HTTP server first so Socket.IO can attach to it, then plug the
  // Express app as its request listener (createApp needs the io instance).
  const server = http.createServer();
  const io = new Server(server, {
    transports: ["websocket"],
    cors: {
      origin: getFrontendOrigins(),
      credentials: true,
    },
  });

  const app = createApp(io);
  server.on("request", app);

  // Mount sockets
  require("./sockets")(io);

  // Fake players (see bots/index.js, BOTS_* in config.env)
  require("./bots")(io);

  // SERVER_PORT for the classic config, PORT for Docker/PaaS/systemd
  const PORT = process.env.SERVER_PORT || process.env.PORT || 5001;
  const HOST = process.env.SERVER_HOST || "0.0.0.0";

  server.listen(PORT, HOST, () =>
    console.log(
      `Server running in ${process.env.NODE_ENV || "development"} mode on http://${HOST}:${PORT}`
    )
  );

  // Graceful shutdown (PM2, systemd, Docker stop)
  let shuttingDown = false;

  const shutdown = (signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`${signal} received, shutting down...`);

    io.close();
    server.close(() => {
      mongoose.connection
        .close(false)
        .catch(() => {})
        .finally(() => process.exit(0));
    });

    // Do not hang forever on open connections
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

start();
