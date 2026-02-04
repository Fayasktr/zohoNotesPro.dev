require('dotenv').config();
const mongoose = require('mongoose');
const Quest = require('../models/Quest');

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const total = await Quest.countDocuments();
        console.log('Total Quests:', total);

        const breakdown = await Quest.aggregate([
            { $group: { _id: { lang: '$lang', topic: '$topic', difficulty: '$difficulty' }, count: { $sum: 1 } } }
        ]);

        console.log('Breakdown:');
        breakdown.forEach(b => {
            console.log(`- ${b._id.lang} / ${b._id.topic} / ${b._id.difficulty}: ${b.count}`);
        });

        const distinctTopics = await Quest.distinct('topic');
        console.log('Distinct Topics:', distinctTopics);

    } catch (err) {
        console.error('Check failed:', err);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

check();
