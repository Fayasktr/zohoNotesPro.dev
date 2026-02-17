const cron = require('node-cron');
const axios = require('axios');
const Note = require('../models/Note');
const TrashedCell = require('../models/TrashedCell');

class CronService {
    constructor() {
        // 1. Trash Cleanup: Daily at midnight (00:00)
        this.trashJob = cron.schedule('0 0 * * *', this.cleanupTrash.bind(this), {
            scheduled: false
        });

        // 2. Birthday Site Ping: Every 14 minutes
        // (Render sleeps after 15 mins of inactivity)
        this.pingJob = cron.schedule('*/14 * * * *', this.pingBirthdaySite.bind(this), {
            scheduled: false
        });

        // 3. AI Quest Seeding: Every 15 minutes
        this.aiSeedJob = cron.schedule('*/15 * * * *', this.seedAIQuest.bind(this), {
            scheduled: false
        });
    }

    start() {
        console.log('[CRON] Trash cleanup service scheduled (Runs Daily at 00:00)');
        this.trashJob.start();

        console.log('[CRON] Birthday Site Keep-Alive scheduled (Runs every 14 mins)');
        this.pingJob.start();

        console.log('[CRON] AI Quest Seeding scheduled (Runs every 15 mins)');
        this.aiSeedJob.start();
    }

    async seedAIQuest() {
        const aiService = require('./aiService');
        try {
            console.log(`[CRON] starting AI seeding... (${new Date().toLocaleTimeString()})`);
            await aiService.seedOneQuestRecord();
        } catch (err) {
            console.error(`[CRON] AI seeding failed: ${err.message}`);
        }
    }

    async pingBirthdaySite() {
        const url = 'https://safeena-birthday.onrender.com/';
        try {
            const response = await axios.get(url, { timeout: 10000 });
            console.log(`[CRON] Birthday Ping Success: ${response.status} (${new Date().toLocaleTimeString()})`);
        } catch (err) {
            console.error(`[CRON] Birthday Ping Failed: ${err.message} (${new Date().toLocaleTimeString()})`);
        }
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
