/** @format */

const mongoose = require("mongoose");

// Set mongoose mode to strict and deactivate auto indexing
mongoose.set("strictQuery", true);
mongoose.set("autoIndex", false);

let connectionPromise = null;

/**
 * Connect to MongoDB.
 *
 * The promise is cached per process: serverless functions are reused between
 * invocations and Mongoose already keeps its own connection pool, so we must
 * not open a new connection for every request. A failed attempt is cleared so
 * the next invocation can retry.
 */
const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (connectionPromise !== null) {
    return connectionPromise;
  }

  connectionPromise = mongoose
    .connect(process.env.DATABASE_URI, {
      useUnifiedTopology: true,
      useNewUrlParser: true,
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 5,
    })
    .then((conn) => {
      console.log(`MongoDB Connected: ${conn.connection.host}`);

      return conn.connection;
    })
    .catch((err) => {
      connectionPromise = null;

      throw err;
    });

  return connectionPromise;
};

module.exports = connectDB;
