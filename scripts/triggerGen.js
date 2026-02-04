const mongoose = require('mongoose');
const Quest = require('../models/Quest');
const aiService = require('../services/aiService');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function triggerGen() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27014/zohoNotes');
        console.log('Connected to MongoDB');

        const currentCount = await Quest.countDocuments({ lang: 'javascript', topic: 'fundamentals' });
        console.log(`Current quest count: ${currentCount}`);

        if (currentCount < 50) {
            const needed = 50 - currentCount;
            console.log(`Starting generation of ${needed} quests...`);

            // This might take a minute, we'll run it and the command tool will wait
            const newQuests = await aiService.generateQuestBatch('javascript', 'fundamentals', 'basic', needed, currentCount + 1);

            if (newQuests.length > 0) {
                await Quest.insertMany(newQuests);
                console.log(`Successfully added ${newQuests.length} quests. Total: 50`);
            }
        } else {
            console.log('Target count already reached.');
        }

        process.exit();
    } catch (err) {
        console.error('Trigger Error:', err);
        process.exit(1);
    }
}

triggerGen();
