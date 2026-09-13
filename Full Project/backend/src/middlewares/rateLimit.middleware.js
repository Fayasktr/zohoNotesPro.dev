const rateLimit = require('express-rate-limit');
const ResponseView = require('../views/response.view');

/**
 * Auth rate limiter (prevents brute force login/register attacks)
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per IP
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        return ResponseView.error(
            res,
            'Too many requests from this IP. Please try again after 15 minutes.',
            429,
            'TOO_MANY_REQUESTS'
        );
    }
});

/**
 * Execution rate limiter (prevents code execution DOS)
 */
const executionLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // 30 executions per minute
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        return ResponseView.error(
            res,
            'Code execution rate limit exceeded. Please wait a moment before running more code.',
            429,
            'EXECUTION_RATE_LIMITED'
        );
    }
});

module.exports = { authLimiter, executionLimiter };
