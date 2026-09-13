const ResponseView = require('../views/response.view');

/**
 * Role-Based Access Control (RBAC) Middleware
 * @param {string|string[]} roles Allowed roles
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return ResponseView.unauthorized(res, 'Authentication required');
        }

        if (!roles.includes(req.user.role)) {
            return ResponseView.forbidden(res, `Forbidden: requires [${roles.join(', ')}] role`);
        }

        next();
    };
}

const requireAdmin = requireRole('admin');

module.exports = { requireRole, requireAdmin };
