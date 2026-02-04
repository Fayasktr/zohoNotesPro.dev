const cron = require('node-cron');
const Note = require('../models/Note');
const TrashedCell = require('../models/TrashedCell');

class CronService {
    constructor() {
        // Run every day at midnight (00:00)
        // Schedule: "0 0 * * *"
        this.job = cron.schedule('0 0 * * *', this.cleanupTrash.bind(this), {
            scheduled: false // Don't start immediately, wait for init()
        });
    }

    start() {
        console.log('[CRON] Trash cleanup service started (Runs Daily at 00:00)');
        this.job.start();
    }

    async cleanupTrash() {
        console.log('[CRON] running auto-delete cleanup...');

        try {
            const fifteenDaysAgo = new Date();
            fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

            // 1. Delete old notebooks
            const noteResult = await Note.deleteMany({
                isTrashed: true,
                trashedAt: { $lte: fifteenDaysAgo }
            });

            if (noteResult.deletedCount > 0) {
                console.log(`[CRON] Deleted ${noteResult.deletedCount} old notebooks.`);
            }

            // 2. Delete old cells
            const cellResult = await TrashedCell.deleteMany({
                deletedAt: { $lte: fifteenDaysAgo }
            });

            if (cellResult.deletedCount > 0) {
                console.log(`[CRON] Deleted ${cellResult.deletedCount} old trashed cells.`);
            }

        } catch (err) {
            console.error('[CRON] Checks failed:', err);
        }
    }
}

module.exports = new CronService();
