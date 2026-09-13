/**
 * User View Presenter
 * Sanitizes and strips sensitive security attributes from user entities.
 */

class UserView {
    static formatUser(user) {
        if (!user) return null;

        return {
            id: String(user._id || user.id),
            username: user.username,
            email: user.email,
            role: user.role || 'user',
            avatar: user.avatar || '',
            isGoogleAuth: !!user.isGoogleAuth,
            isBlocked: !!user.isBlocked,
            settings: user.settings || { defaultLanguage: 'javascript', theme: 'dark' },
            lastLogin: user.lastLogin,
            createdAt: user.createdAt
        };
    }

    static formatAuthResponse(user, token) {
        return {
            user: this.formatUser(user),
            token
        };
    }

    static formatUserList(users) {
        return (users || []).map(u => this.formatUser(u));
    }
}

module.exports = UserView;
