const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const env = require('../config/env');

class AuthService {
    /**
     * Generate standard JWT Token
     */
    generateToken(user) {
        return jwt.sign(
            {
                id: String(user._id || user.id),
                email: user.email,
                role: user.role
            },
            env.JWT_SECRET,
            { expiresIn: env.JWT_EXPIRES_IN }
        );
    }

    /**
     * Register a new user
     */
    async register({ username, email, password }) {
        const normalizedEmail = email.toLowerCase().trim();
        const existing = await User.findOne({ email: normalizedEmail });
        if (existing) {
            const err = new Error('Email is already registered');
            err.statusCode = 409;
            throw err;
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create({
            username: username.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            role: 'user'
        });

        const token = this.generateToken(user);
        return { user, token };
    }

    /**
     * Login user with credentials
     */
    async login({ email, password }) {
        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail }).select('+password');

        if (!user) {
            const err = new Error('Invalid email or password');
            err.statusCode = 401;
            throw err;
        }

        if (user.isBlocked) {
            const err = new Error('Your account has been blocked by an administrator');
            err.statusCode = 403;
            throw err;
        }

        if (!user.password && user.isGoogleAuth) {
            const err = new Error('This account was created with Google Sign-In. Please sign in with Google.');
            err.statusCode = 400;
            throw err;
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            const err = new Error('Invalid email or password');
            err.statusCode = 401;
            throw err;
        }

        user.lastLogin = new Date();
        await user.save();

        const token = this.generateToken(user);
        return { user, token };
    }

    /**
     * Google OAuth Login / Account Merge
     */
    async handleGoogleAuth({ profile }) {
        const email = profile.emails?.[0]?.value?.toLowerCase().trim();
        if (!email) throw new Error('No email found in Google profile');

        let user = await User.findOne({ googleId: profile.id });

        if (!user) {
            // Check if user exists by email
            user = await User.findOne({ email });
            if (user) {
                user.googleId = profile.id;
                user.avatar = profile.photos?.[0]?.value || user.avatar;
                user.isGoogleAuth = true;
                await user.save();
            } else {
                user = await User.create({
                    username: profile.displayName || email.split('@')[0],
                    email,
                    googleId: profile.id,
                    avatar: profile.photos?.[0]?.value || '',
                    isGoogleAuth: true
                });
            }
        }

        if (user.isBlocked) {
            const err = new Error('Account blocked');
            err.statusCode = 403;
            throw err;
        }

        user.lastLogin = new Date();
        await user.save();

        const token = this.generateToken(user);
        return { user, token };
    }

    /**
     * Request Password Reset Token
     */
    async forgotPassword(email) {
        if (!email) {
            const err = new Error('Email is required');
            err.statusCode = 400;
            throw err;
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            // Return success anyway for security timing attack prevention
            return { message: 'If an account exists, a reset link has been dispatched.' };
        }

        if (user.isGoogleAuth && !user.password) {
            const err = new Error('This account uses Google Login. Password change is not available.');
            err.statusCode = 400;
            throw err;
        }

        const token = crypto.randomBytes(24).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        return { user, token };
    }

    /**
     * Reset Password using Token
     */
    async resetPassword(token, newPassword) {
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        }).select('+resetPasswordToken +resetPasswordExpires');

        if (!user) {
            const err = new Error('Password reset token is invalid or has expired');
            err.statusCode = 400;
            throw err;
        }

        user.password = await bcrypt.hash(newPassword, 10);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        return { message: 'Password updated successfully. You can now login.' };
    }

    /**
     * Update user preferences / settings
     */
    async updateSettings(userId, settingsData) {
        const user = await User.findByIdAndUpdate(
            userId,
            { $set: { settings: settingsData } },
            { new: true }
        );
        return user;
    }

    /**
     * Track user activity
     */
    async trackActivity(userId) {
        if (!userId) return;
        try {
            await User.findByIdAndUpdate(userId, { lastActivity: new Date() });
        } catch (e) {
            // Ignore background activity errors
        }
    }
}

module.exports = new AuthService();
