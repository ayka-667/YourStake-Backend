/** @format */

/**
 * PM2 configuration for a VPS deployment.
 *
 *   pm2 start ecosystem.config.js
 *   pm2 logs yourstake-backend
 *   pm2 save && pm2 startup
 *
 * Keep `instances: 1` and `exec_mode: "fork"`: the game loops, the chat state
 * and Socket.IO all live in memory, so a cluster would run several independent
 * (and conflicting) game worlds.
 */
module.exports = {
  apps: [
    {
      name: "yourstake-backend",
      script: "index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      kill_timeout: 10000,
      env: {
        NODE_ENV: "production",
        SERVER_PORT: 5001,
      },
      time: true,
    },
  ],
};
