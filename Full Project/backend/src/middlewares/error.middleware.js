const ResponseView = require('../views/response.view');
const env = require('../config/env');

/**
 * Centralized Error Handling Middleware
 */
function errorHandler(err, req, res, next) {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    const code = err.code || (statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST');

    if (!env.isTest && statusCode >= 500) {
        console.error('[Unhandled Error]', err.stack || err);
    }

    const details = env.isProduction ? null : err.details || (statusCode >= 500 ? err.stack : null);

    return ResponseView.error(res, message, statusCode, code, details);
}

/**
 * 404 Route Not Found Middleware
 */
function notFoundHandler(req, res) {
    return ResponseView.notFound(res, `API route not found: ${req.method} ${req.originalUrl}`);
}

module.exports = { errorHandler, notFoundHandler };
