const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ResponseView = require('../views/response.view');
const authService = require('../services/auth.service');

/**
 * Authentication Middleware
 * Supports standard Bearer JWT Tokens (preferred for modern React SPAs)
 */
async function authenticate(req, res, next) {
    try {
        let token = null;

        // 1. Check Authorization header
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }

        // 2. Check query parameter fallback (e.g. for EventSource/WebSocket handshakes)
        if (!token && req.query.token) {
            token = req.query.token;
        }

        if (!token) {
            return ResponseView.unauthorized(res, 'Authorization token missing. Please sign in.');
        }

        const decoded = jwt.verify(token, env.JWT_SECRET);
        req.user = decoded;

        // Background non-blocking activity tracking
        authService.trackActivity(decoded.id);

        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return ResponseView.unauthorized(res, 'Session token expired. Please login again.', 'TOKEN_EXPIRED');
        }
        return ResponseView.unauthorized(res, 'Invalid authorization token.', 'INVALID_TOKEN');
    }
}

module.exports = authenticate;
