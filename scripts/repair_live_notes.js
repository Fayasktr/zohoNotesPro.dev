const mongoose = require('mongoose');
const Note = require('../models/Note');

async function repair() {
    await mongoose.connect('mongodb://localhost:27017/zoho');
    console.log('Connected to MongoDB for repair...');

    const res = await Note.updateMany(
        {
            $or: [
                { id: /^live-/ },
                { id: /-collab-/ },
                { shareCode: /^collab-/ },
                { 'content.isLive': true }
            ]
        },
        {
            $set: { isLive: true }
        }
    );

    console.log('Sanitized notes to isLive: true ->', res);

    const normalRes = await Note.updateMany(
        {
            id: { $not: /^live-/ },
            id: { $not: /-collab-/ },
            shareCode: { $not: /^collab-/ },
            'content.isLive': { $ne: true },
            isLive: { $ne: true }
        },
        {
            $set: { isLive: false }
        }
    );

    console.log('Sanitized normal notes to isLive: false ->', normalRes);

    await mongoose.disconnect();
}

repair().catch(err => {
    console.error('Repair error:', err);
    process.exit(1);
});
