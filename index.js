/** @format */

const http = require("http");
const { Server } = require("socket.io");

const { createApp, ensureReady, getFrontendOrigins } = require("./app");

/**
 * Local / long-running entry point (npm start, npm run dev).
 *
 * This is where Socket.IO, the game loops and the fake players live. They
 * cannot run on Vercel: deploy this file to a persistent host (VPS, Railway,
 * Render, Fly.io...) and keep Vercel for the HTTP API if you need both.
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

  const PORT = process.env.SERVER_PORT || 5001;

  server.listen(PORT, () =>
    console.log(
      `Server running in ${process.env.NODE_ENV || "development"} mode on port ${PORT}`
    )
  );
};

start();
