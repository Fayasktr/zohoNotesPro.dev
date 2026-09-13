const cron = require('node-cron');
const Note = require('../models/Note');
const TrashedCell = require('../models/TrashedCell');
const User = require('../models/User');
const SystemLog = require('../models/SystemLog');
const SystemConfig = require('../models/SystemConfig');

class CronService {
    constructor() {
        this.jobs = [];
    }

    start() {
        console.log('[CronService] 🕒 Scheduling system maintenance jobs...');

        // 1. Daily Trash Purge at 00:00 (purges items older than 15 days)
        const trashJob = cron.schedule('0 0 * * *', () => this.purgeExpiredTrash(), {
            scheduled: true
        });
        this.jobs.push(trashJob);

        // 2. Token & Expired Session Cleanup (runs every hour)
        const cleanupJob = cron.schedule('0 * * * *', () => this.cleanupExpiredTokens(), {
            scheduled: true
        });
        this.jobs.push(cleanupJob);

        // 3. Heartbeat & Metrics Logger (runs every 30 minutes)
        const heartbeatJob = cron.schedule('*/30 * * * *', () => this.recordHeartbeat(), {
            scheduled: true
        });
        this.jobs.push(heartbeatJob);

        console.log('[CronService] ✅ System maintenance jobs active.');
    }

    stop() {
        for (const job of this.jobs) {
            job.stop();
        }
        this.jobs = [];
        console.log('[CronService] Stopped all cron jobs.');
    }

    /**
     * Delete trash items older than 15 days
     */
    async purgeExpiredTrash() {
        try {
            const fifteenDaysAgo = new Date();
            fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

            const [notesResult, cellsResult] = await Promise.all([
                Note.deleteMany({ isTrashed: true, trashedAt: { $lte: fifteenDaysAgo } }),
                TrashedCell.deleteMany({ deletedAt: { $lte: fifteenDaysAgo } })
            ]);

            if (notesResult.deletedCount > 0 || cellsResult.deletedCount > 0) {
                console.log(`[CronService] Purged ${notesResult.deletedCount} notebooks and ${cellsResult.deletedCount} cells from trash.`);
                await SystemLog.create({
                    type: 'info',
                    message: `Auto-purge: deleted ${notesResult.deletedCount} old notebooks and ${cellsResult.deletedCount} old cells.`
                });
            }
        } catch (err) {
            console.error('[CronService] Error purging expired trash:', err.message);
        }
    }

    /**
     * Clean up expired password reset tokens
     */
    async cleanupExpiredTokens() {
        try {
            const result = await User.updateMany(
                { resetPasswordExpires: { $lt: new Date() } },
                { $unset: { resetPasswordToken: 1, resetPasswordExpires: 1 } }
            );
            if (result.modifiedCount > 0) {
                console.log(`[CronService] Cleaned up ${result.modifiedCount} expired password reset tokens.`);
            }
        } catch (err) {
            console.error('[CronService] Error cleaning expired tokens:', err.message);
        }
    }

    /**
     * Record heartbeat telemetry
     */
    async recordHeartbeat() {
        try {
            const config = await SystemConfig.findOne({ key: 'isLoggingPaused' }).lean();
            if (config && config.value === true) return;

            const [userCount, noteCount] = await Promise.all([
                User.countDocuments({ role: { $ne: 'admin' } }),
                Note.countDocuments({ isTrashed: { $ne: true } })
            ]);

            const mem = process.memoryUsage();
            const memUsage = `${(mem.rss / 1024 / 1024).toFixed(1)}MB RSS`;

            await SystemLog.create({
                type: 'info',
                message: `Heartbeat: System healthy. ${userCount} users, ${noteCount} active notes. Memory: ${memUsage}`
            });
        } catch (err) {
            console.error('[CronService] Heartbeat error:', err.message);
        }
    }
}

module.exports = new CronService();
