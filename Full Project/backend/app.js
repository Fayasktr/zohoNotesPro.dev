const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const env = require('./src/config/env');
const apiRoutes = require('./src/routes');
const { errorHandler, notFoundHandler } = require('./src/middlewares/error.middleware');

const app = express();

// 1. Security Headers
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// 2. Cross-Origin Resource Sharing (CORS)
app.use(cors({
    origin: (origin, callback) => {
        // Allow local dev origins or configured client URL
        if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1') || origin === env.CLIENT_URL) {
            callback(null, true);
        } else {
            callback(null, true); // Allow all in dev mode
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// 3. Request Parsers
app.use(express.json({ limit: env.LIMITS.BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: env.LIMITS.BODY_LIMIT }));

// 4. Disable Caching for API Endpoints
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

// 5. Mount API Master Routes
app.use('/api', apiRoutes);

// 6. 404 Handler
app.use(notFoundHandler);

// 7. Centralized Global Error Handler
app.use(errorHandler);

module.exports = app;
