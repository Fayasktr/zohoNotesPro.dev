const mongoose = require('mongoose');
const Note = require('../models/Note');

async function sanitize() {
    await mongoose.connect('mongodb://127.0.0.1:27017/zoho');
    console.log('Sanitizing database notes...');

    // 1. All normal notes (starting with ntbk- or normal-) must NEVER have isLive: true
    const normalUpdate = await Note.updateMany(
        {
            id: { $regex: '^(ntbk-|normal-)' }
        },
        {
            $set: {
                isLive: false,
                'content.isLive': false
            },
            $unset: {
                shareCode: ""
            }
        }
    );
    console.log('Reset normal notes to isLive: false ->', normalUpdate);

    // 2. All live notes (starting with live-) must have isLive: true
    const liveUpdate = await Note.updateMany(
        {
            id: { $regex: '^live-' }
        },
        {
            $set: {
                isLive: true,
                'content.isLive': true
            }
        }
    );
    console.log('Enforced live notes to isLive: true ->', liveUpdate);

    // 3. Print resulting counts
    const normalCount = await Note.countDocuments({ isLive: false });
    const liveCount = await Note.countDocuments({ isLive: true });
    console.log(`Summary: ${normalCount} normal notes, ${liveCount} live notes.`);

    // 4. Verify user fayas kp notes
    const fayasNotes = await Note.find({ id: { $in: ['ntbk-1789962326136', 'live-1790001884339-cdcj'] } }).lean();
    console.log('\nVerified key user notes:');
    fayasNotes.forEach(n => {
        console.log(`- ${n.id}: title="${n.title}", folder="${n.folder}", isLive=${n.isLive}`);
    });

    await mongoose.disconnect();
}

sanitize().catch(console.error);
