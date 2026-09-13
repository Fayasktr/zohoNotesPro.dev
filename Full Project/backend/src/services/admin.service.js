const User = require('../models/User');
const Note = require('../models/Note');
const Feedback = require('../models/Feedback');
const SystemLog = require('../models/SystemLog');
const SystemConfig = require('../models/SystemConfig');

class AdminService {
    /**
     * Get aggregate statistics for the admin dashboard
     */
    async getDashboardStats() {
        const totalUsers = await User.countDocuments({ role: { $ne: 'admin' } });
        const totalNotes = await Note.countDocuments();
        const totalFeedbacks = await Feedback.countDocuments();
        const unreadFeedbacks = await Feedback.countDocuments({ isRead: false });

        // Active in last 15 minutes
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
        const activeUsersCount = await User.countDocuments({
            lastActivity: { $gte: fifteenMinutesAgo }
        });

        const mem = process.memoryUsage();
        const memoryStats = {
            rssMb: (mem.rss / 1024 / 1024).toFixed(2),
            heapUsedMb: (mem.heapUsed / 1024 / 1024).toFixed(2),
            heapTotalMb: (mem.heapTotal / 1024 / 1024).toFixed(2)
        };

        return {
            totalUsers,
            activeUsersCount,
            totalNotes,
            totalFeedbacks,
            unreadFeedbacks,
            memoryStats,
            serverUptimeSec: process.uptime()
        };
    }

    /**
     * Get paginated user list
     */
    async getUsers({ page = 1, limit = 20, search = '' }) {
        const query = { role: { $ne: 'admin' } };
        if (search) {
            query.$or = [
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (page - 1) * limit;
        const [users, total] = await Promise.all([
            User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            User.countDocuments(query)
        ]);

        return {
            users,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Toggle user blocked state
     */
    async toggleUserBlock(userId) {
        const user = await User.findById(userId);
        if (!user) {
            const err = new Error('User not found');
            err.statusCode = 404;
            throw err;
        }

        user.isBlocked = !user.isBlocked;
        await user.save();

        await SystemLog.create({
            type: user.isBlocked ? 'warning' : 'info',
            message: `User ${user.email} was ${user.isBlocked ? 'blocked' : 'unblocked'} by admin`
        });

        return { isBlocked: user.isBlocked, user };
    }

    /**
     * Delete a user and cascade trash their notes
     */
    async deleteUser(userId) {
        const user = await User.findByIdAndDelete(userId);
        if (!user) {
            const err = new Error('User not found');
            err.statusCode = 404;
            throw err;
        }

        // Delete user's notes
        await Note.deleteMany({ owner: userId });

        await SystemLog.create({
            type: 'warning',
            message: `User ${user.email} and all associated notes were deleted by admin`
        });

        return { success: true };
    }

    /**
     * Get system audit logs
     */
    async getSystemLogs(limit = 50) {
        return await SystemLog.find().sort({ timestamp: -1 }).limit(limit).lean();
    }

    /**
     * Clear system audit logs
     */
    async clearSystemLogs() {
        await SystemLog.deleteMany({});
        return { success: true };
    }

    /**
     * List user feedback
     */
    async getFeedbacks() {
        return await Feedback.find().populate('user', 'username email avatar').sort({ createdAt: -1 }).lean();
    }

    /**
     * Mark feedback item as read
     */
    async markFeedbackRead(feedbackId) {
        return await Feedback.findByIdAndUpdate(feedbackId, { isRead: true }, { new: true });
    }

    /**
     * Toggle dynamic system config flags (e.g. isLoggingPaused)
     */
    async toggleConfig(key, value) {
        return await SystemConfig.findOneAndUpdate(
            { key },
            { $set: { value } },
            { upsert: true, new: true }
        );
    }
}

module.exports = new AdminService();
