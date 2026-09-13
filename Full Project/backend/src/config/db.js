const mongoose = require('mongoose');
const env = require('./env');

/**
 * Connect to MongoDB with retry logic and masked URI logging
 */
async function connectDB() {
    const maskedURI = env.MONGODB_URI.replace(/:([^:@]+)@/, ':****@');
    console.log(`[Database] Connecting to MongoDB at: ${maskedURI}`);

    try {
        await mongoose.connect(env.MONGODB_URI, {
            autoIndex: true
        });
        console.log('[Database] ✅ Connected to MongoDB successfully.');
    } catch (err) {
        console.error('[Database] ❌ MongoDB connection error:', err.message);
        if (env.isProduction) {
            process.exit(1);
        }
    }

    mongoose.connection.on('disconnected', () => {
        console.warn('[Database] ⚠️ MongoDB disconnected. Waiting for reconnection...');
    });

    mongoose.connection.on('reconnected', () => {
        console.log('[Database] 🔄 MongoDB reconnected.');
    });
}

/**
 * Disconnect database (used in tests and graceful shutdown)
 */
async function disconnectDB() {
    try {
        await mongoose.connection.close();
        console.log('[Database] MongoDB connection closed.');
    } catch (err) {
        console.error('[Database] Error closing MongoDB connection:', err.message);
    }
}

module.exports = { connectDB, disconnectDB };
