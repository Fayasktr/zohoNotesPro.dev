const authService = require('../services/auth.service');
const mailService = require('../services/mail.service');
const ResponseView = require('../views/response.view');
const UserView = require('../views/user.view');
const User = require('../models/User');

class AuthController {
    /**
     * POST /api/auth/register
     */
    async register(req, res, next) {
        try {
            const { username, email, password } = req.body;
            if (!username || !email || !password) {
                return ResponseView.badRequest(res, 'Username, email, and password are required');
            }

            const { user, token } = await authService.register({ username, email, password });
            return ResponseView.created(res, UserView.formatAuthResponse(user, token), 'Registration successful');
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/auth/login
     */
    async login(req, res, next) {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return ResponseView.badRequest(res, 'Email and password are required');
            }

            const { user, token } = await authService.login({ email, password });
            return ResponseView.success(res, UserView.formatAuthResponse(user, token), 'Login successful');
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /api/auth/me
     */
    async getProfile(req, res, next) {
        try {
            const user = await User.findById(req.user.id).lean();
            if (!user) return ResponseView.notFound(res, 'User not found');
            return ResponseView.success(res, UserView.formatUser(user));
        } catch (err) {
            next(err);
        }
    }

    /**
     * PUT /api/auth/settings
     */
    async updateSettings(req, res, next) {
        try {
            const user = await authService.updateSettings(req.user.id, req.body);
            return ResponseView.success(res, UserView.formatUser(user), 'Settings updated');
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/auth/forgot-password
     */
    async forgotPassword(req, res, next) {
        try {
            const { email } = req.body;
            if (!email) return ResponseView.badRequest(res, 'Email is required');

            const result = await authService.forgotPassword(email);
            if (result.user && result.token) {
                await mailService.sendPasswordResetEmail(
                    result.user.email,
                    result.user.username,
                    result.token,
                    req.headers.host
                );
            }

            return ResponseView.success(res, null, 'If an account exists, a reset link has been sent');
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/auth/reset-password
     */
    async resetPassword(req, res, next) {
        try {
            const { token, password } = req.body;
            if (!token || !password) {
                return ResponseView.badRequest(res, 'Token and new password are required');
            }

            const result = await authService.resetPassword(token, password);
            return ResponseView.success(res, null, result.message);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new AuthController();
