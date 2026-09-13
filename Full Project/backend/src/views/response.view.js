/**
 * Standardized API Response View Presenter
 * Enforces uniform contract for all REST API endpoints.
 */

class ResponseView {
    static success(res, data = null, message = 'Success', statusCode = 200, meta = null) {
        const payload = {
            success: true,
            message,
            data
        };
        if (meta) payload.meta = meta;
        return res.status(statusCode).json(payload);
    }

    static created(res, data = null, message = 'Created successfully') {
        return this.success(res, data, message, 201);
    }

    static error(res, message = 'An error occurred', statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
        const payload = {
            success: false,
            error: {
                code,
                message
            }
        };
        if (details) payload.error.details = details;
        return res.status(statusCode).json(payload);
    }

    static unauthorized(res, message = 'Authentication required', code = 'UNAUTHORIZED') {
        return this.error(res, message, 401, code);
    }

    static forbidden(res, message = 'Access denied', code = 'FORBIDDEN') {
        return this.error(res, message, 403, code);
    }

    static notFound(res, message = 'Resource not found', code = 'NOT_FOUND') {
        return this.error(res, message, 404, code);
    }

    static badRequest(res, message = 'Invalid request parameters', details = null) {
        return this.error(res, message, 400, 'BAD_REQUEST', details);
    }
}

module.exports = ResponseView;
