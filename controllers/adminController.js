const User = require('../models/User');
const Note = require('../models/Note');
const SystemLog = require('../models/SystemLog');
const Feedback = require('../models/Feedback');
const bcrypt = require('bcryptjs');

exports.getDashboard = async (req, res) => {
    try {
        const users = await User.find({ role: { $ne: 'admin' } }).lean();
        const unreadFeedbackCount = await Feedback.countDocuments({ isRead: false });
        res.render('admin/dashboard', {
            title: 'Admin Dashboard - Zoho Notes',
            adminName: req.session.username,
            users: users,
            unreadFeedbackCount: unreadFeedbackCount
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
