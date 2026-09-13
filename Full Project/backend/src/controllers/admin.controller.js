const adminService = require('../services/admin.service');
const ResponseView = require('../views/response.view');
const UserView = require('../views/user.view');

class AdminController {
    /**
     * GET /api/admin/dashboard
     */
    async getDashboard(req, res, next) {
        try {
            const stats = await adminService.getDashboardStats();
            return ResponseView.success(res, stats);
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /api/admin/users
     */
    async getUsers(req, res, next) {
        try {
            const page = parseInt(req.query.page, 10) || 1;
            const limit = parseInt(req.query.limit, 10) || 20;
            const search = req.query.search || '';

            const { users, pagination } = await adminService.getUsers({ page, limit, search });
            return ResponseView.success(res, {
                users: UserView.formatUserList(users),
                pagination
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/admin/users/:id/toggle-block
     */
    async toggleBlock(req, res, next) {
        try {
            const result = await adminService.toggleUserBlock(req.params.id);
            return ResponseView.success(res, {
                isBlocked: result.isBlocked,
                user: UserView.formatUser(result.user)
            }, `User ${result.isBlocked ? 'blocked' : 'unblocked'} successfully`);
        } catch (err) {
            next(err);
        }
    }

    /**
     * DELETE /api/admin/users/:id
     */
    async deleteUser(req, res, next) {
        try {
            await adminService.deleteUser(req.params.id);
            return ResponseView.success(res, null, 'User and associated notes deleted');
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /api/admin/system-logs
     */
    async getLogs(req, res, next) {
        try {
            const limit = parseInt(req.query.limit, 10) || 50;
            const logs = await adminService.getSystemLogs(limit);
            return ResponseView.success(res, logs);
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/admin/system-logs/clear
     */
    async clearLogs(req, res, next) {
        try {
            await adminService.clearSystemLogs();
            return ResponseView.success(res, null, 'System logs cleared');
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /api/admin/feedback
     */
    async getFeedback(req, res, next) {
        try {
            const feedbacks = await adminService.getFeedbacks();
            return ResponseView.success(res, feedbacks);
        } catch (err) {
            next(err);
        }
    }

    /**
     * PUT /api/admin/feedback/:id/read
     */
    async markFeedbackRead(req, res, next) {
        try {
            const updated = await adminService.markFeedbackRead(req.params.id);
            return ResponseView.success(res, updated, 'Feedback marked as read');
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/admin/toggle-config
     */
    async toggleConfig(req, res, next) {
        try {
            const { key, value } = req.body;
            if (!key) return ResponseView.badRequest(res, 'Config key is required');
            const config = await adminService.toggleConfig(key, value);
            return ResponseView.success(res, config, 'Configuration updated');
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new AdminController();
