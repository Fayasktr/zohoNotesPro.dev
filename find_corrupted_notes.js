const mongoose = require('mongoose');
const Note = require('./models/Note');
const User = require('./models/User');
require('dotenv').config();

const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zoho';

async function findCorruptedNotes() {
    try {
        await mongoose.connect(mongoURI);
        console.log('Connected to MongoDB');

        // Find all notes with collaborators
        const notes = await Note.find({
            'collaborators.0': { $exists: true }
        }).populate('owner', 'username email').populate('collaborators.user', 'username email');

        console.log(`Found ${notes.length} notes with collaborators.`);

        notes.forEach(n => {
            console.log(`---`);
            console.log(`ID: ${n.id}`);
            console.log(`Title: ${n.title}`);
            console.log(`Current Owner: ${n.owner ? n.owner.username : 'Unknown'} (${n.owner ? n.owner.email : 'N/A'}, ID: ${n.owner ? n.owner._id : 'N/A'})`);
            console.log(`Collaborators:`);
            n.collaborators.forEach(c => {
                const user = c.user;
                console.log(`  - ${user ? user.username : 'Unknown'} (${c.email}, ID: ${user ? user._id : 'N/A'}, Status: ${c.status})`);
            });
        });

    } catch (err) {
        console.error('Error finding corrupted notes:', err);
    } finally {
        await mongoose.connection.close();
    }
}

findCorruptedNotes();
