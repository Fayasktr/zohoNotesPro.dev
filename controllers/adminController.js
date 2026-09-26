const User = require('../models/User');
const Note = require('../models/Note');
const SystemLog = require('../models/SystemLog');
const Feedback = require('../models/Feedback');
const SystemConfig = require('../models/SystemConfig');
const bcrypt = require('bcryptjs');

exports.getDashboard = async (req, res) => {
    try {
        const users = await User.find({ role: { $ne: 'admin' } }).lean();
        const unreadFeedbackCount = await Feedback.countDocuments({ isRead: false });
        let loggingConfig = await SystemConfig.findOne({ key: 'isLoggingPaused' }).lean();
        if (!loggingConfig) {
            loggingConfig = { value: false };
        }
        const adminUser = await User.findById(req.session.userId).lean();
        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        const adminApiKey = adminUser?.apiKey || null;
        const sseUrl = adminApiKey ? `${baseUrl}/mcp/sse?apiKey=${adminApiKey}` : `${baseUrl}/mcp/sse`;

        const todayStr = new Date().toISOString().slice(0, 10);
        const enrichedUsers = users.map(u => ({
            ...u,
            hasApiKey: !!u.apiKey,
            apiKeyMasked: u.apiKey ? u.apiKey.substring(0, 12) + '••••••••' : null,
            apiKeyExpiresText: u.apiKeyExpiresAt ? new Date(u.apiKeyExpiresAt).toLocaleDateString() : (u.apiKey ? 'Never' : 'None'),
            isApiKeyExpired: u.apiKeyExpiresAt ? (new Date() > new Date(u.apiKeyExpiresAt)) : false,
            mcpDailyCount: (u.mcpUsage && u.mcpUsage.lastResetDate === todayStr) ? (u.mcpUsage.dailyCount || 0) : 0
        }));

        res.render('admin/dashboard', {
            title: 'Admin Dashboard - Zoho Notes',
            metaTitle: 'Admin Dashboard - Zoho Notes',
            metaRobots: 'noindex, nofollow',
            adminName: req.session.username,
            adminUser: adminUser,
            adminApiKey: adminApiKey,
            adminApiKeyExpiresAt: adminUser?.apiKeyExpiresAt || null,
            sseUrl: sseUrl,
            baseUrl: baseUrl,
            users: enrichedUsers,
            unreadFeedbackCount: unreadFeedbackCount,
            isLoggingPaused: loggingConfig.value
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).send('Server Error');
    }
};

exports.getUsers = async (req, res) => {
    try {
        const users = await User.find({ role: { $ne: 'admin' } }).lean();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
};

exports.createUser = async (req, res) => {
    const { username, email, password } = req.body;
    try {
        if (!password) {
            return res.status(400).json({ error: 'Password is required for new users' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({
            username,
            email,
            password: hashedPassword,
            role: 'user'
        });
        await user.save();
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: 'Email already exists' });
    }
};

exports.updateUser = async (req, res) => {
    const { id } = req.params;
    const { username, email, password } = req.body;
    try {
        const updateData = { username, email };
        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }
        await User.findByIdAndUpdate(id, updateData);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: 'Failed to update user' });
    }
};

exports.deleteUser = async (req, res) => {
    const { id } = req.params;
    try {
        await User.findByIdAndDelete(id);
        await Note.deleteMany({ owner: id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
};

exports.toggleBlock = async (req, res) => {
    const { id } = req.params;
    try {
        const user = await User.findById(id);
        user.isBlocked = !user.isBlocked;
        await user.save();
        res.json({ success: true, isBlocked: user.isBlocked });
    } catch (err) {
        res.status(500).json({ error: 'Failed to toggle block status' });
    }
};

exports.setUserRole = async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;
    try {
        if (!['admin', 'user'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role. Must be "admin" or "user".' });
        }
        const user = await User.findById(id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Safety: Do not demote Superadmin Fayas KP
        if (user.email === 'fayaskpktr@gmail.com' && role !== 'admin') {
            return res.status(400).json({ error: 'Cannot remove admin role from primary superadmin (fayaskpktr@gmail.com)' });
        }

        user.role = role;
        await user.save();
        res.json({ success: true, user: { id: user._id, email: user.email, role: user.role } });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update user role' });
    }
};

exports.getUserNotes = async (req, res) => {
    const { id } = req.params;
    try {
        const notes = await Note.find({ owner: id }).lean();
        res.json(notes);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch user notes' });
    }
};

exports.updateUserNote = async (req, res) => {
    const { noteId } = req.params;
    const { title, content } = req.body;
    try {
        await Note.findOneAndUpdate({ id: noteId }, {
            title,
            content,
            updatedAt: new Date()
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update note' });
    }
};

exports.getSystemLogs = async (req, res) => {
    try {
        const logs = await SystemLog.find().sort({ timestamp: -1 }).limit(100).lean();
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
};

exports.clearSystemLogs = async (req, res) => {
    try {
        await SystemLog.deleteMany({});
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to clear logs' });
    }
};

exports.markFeedbackRead = async (req, res) => {
    try {
        await Feedback.updateMany({ isRead: false }, { isRead: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to mark feedback as read' });
    }
};

exports.getActivityStats = async (req, res) => {
    try {
        const threeDaysAgo = new Date(Date.now() - (3 * 24 * 60 * 60 * 1000));
        const activeCount = await User.countDocuments({
            role: { $ne: 'admin' },
            lastActivity: { $gte: threeDaysAgo }
        });
        const totalCount = await User.countDocuments({ role: { $ne: 'admin' } });
        res.json({
            active: activeCount,
            inactive: totalCount - activeCount
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch activity stats' });
    }
};

exports.getActiveUsersList = async (req, res) => {
    try {
        const threeDaysAgo = new Date(Date.now() - (3 * 24 * 60 * 60 * 1000));
        const users = await User.find({
            role: { $ne: 'admin' },
            lastActivity: { $gte: threeDaysAgo }
        })
            .sort({ lastActivity: -1 })
            .lean();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch active users list' });
    }
};

exports.toggleLogging = async (req, res) => {
    try {
        let config = await SystemConfig.findOne({ key: 'isLoggingPaused' });
        if (!config) {
            config = new SystemConfig({ key: 'isLoggingPaused', value: true });
        } else {
            config.value = !config.value;
        }
        await config.save();
        res.json({ success: true, isLoggingPaused: config.value });
    } catch (err) {
        res.status(500).json({ error: 'Failed to toggle logging' });
    }
};
