const mongoose = require('mongoose');
const Note = require('./models/Note');
const User = require('./models/User');
const fs = require('fs');
require('dotenv').config();

const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zoho';

async function dumpData() {
    try {
        await mongoose.connect(mongoURI);
        console.log('Connected to MongoDB');

        const suspectNotes = await Note.find({
            $or: [
                { owner: { $exists: false } },
                { owner: null }
            ]
        });

        console.log(`Found ${suspectNotes.length} ownerless notes.`);

        const results = suspectNotes.map(n => ({
            id: n.id,
            title: n.title,
            updatedAt: n.updatedAt,
            contentSnippet: JSON.stringify(n.content || {}).substring(0, 100)
        }));

        fs.writeFileSync('ownerless_notes_with_times.json', JSON.stringify(results, null, 2));
        console.log('Results written to ownerless_notes_with_times.json');

    } catch (err) {
        console.error('Error dumping data:', err);
    } finally {
        await mongoose.connection.close();
    }
}

dumpData();


let arr = [1, 2, 3];
arr.filter(item=>item%2!=0)