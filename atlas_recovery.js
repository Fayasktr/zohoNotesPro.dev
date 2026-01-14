const mongoose = require('mongoose');
const fs = require('fs');

// --- CONFIGURATION ---
// You can set your Atlas URI here or in a .env file
const mongoURI = process.env.MONGODB_URI || 'YOUR_MONGODB_ATLAS_URI_HERE';
const targetUserEmail = 'Fayaskpktr@gmail.com'; // The email of the person who 'lost' the notes
// ---------------------

async function recoverNotes() {
    if (mongoURI.includes('YOUR_MONGODB_ATLAS_URI_HERE')) {
        console.error('ERROR: Please set your MONGODB_URI in the script or .env file');
        return;
    }

    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(mongoURI);
        console.log('Connected successfully.');

        // 1. Find the target user
        const User = mongoose.model('User', new mongoose.Schema({ email: String, username: String }));
        const Note = mongoose.model('Note', new mongoose.Schema({
            id: String,
            title: String,
            owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            collaborators: Array,
            updatedAt: Date
        }, { collection: 'notes' }));

        const user = await User.findOne({ email: new RegExp(targetUserEmail, 'i') });
        if (!user) {
            console.error(`ERROR: User with email ${targetUserEmail} not found in database.`);
            return;
        }
        console.log(`Found target user: ${user.username} (ID: ${user._id})`);

        // 2. Identify ownerless notes
        const ownerless = await Note.find({
            $or: [
                { owner: { $exists: false } },
                { owner: null }
            ]
        });
        console.log(`\n--- OWNERLESS NOTES (${ownerless.length} found) ---`);
        ownerless.forEach(n => console.log(`[${n.id}] "${n.title}" - Last Updated: ${n.updatedAt}`));

        // 3. Identify potentially 'hijacked' notes (where owner is also a collaborator)
        const allNotes = await Note.find({ 'collaborators.0': { $exists: true } }).populate('owner');
        const hijacked = allNotes.filter(n => {
            return n.collaborators.some(c => c.user && n.owner && c.user.toString() === n.owner._id.toString());
        });
        console.log(`\n--- POTENTIALLY HIJACKED NOTES (${hijacked.length} found) ---`);
        hijacked.forEach(n => {
            console.log(`[${n.id}] "${n.title}" - Current Owner: ${n.owner.email}`);
        });

        // 4. Offer to fix
        if (ownerless.length > 0 || hijacked.length > 0) {
            console.log('\n--- HOW TO RECOVER ---');
            console.log('To restore ownership of these notes to you, run this script with --fix flag:');
            console.log('node atlas_recovery.js --fix');

            if (process.argv.includes('--fix')) {
                console.log('\nRestoring ownership...');

                // Fix ownerless
                for (const n of ownerless) {
                    await Note.updateOne({ _id: n._id }, { $set: { owner: user._id } });
                    console.log(`Restored ownerless: ${n.title}`);
                }

                // Fix hijacked (This assumes the hijacked notes belong to the target user)
                // WARNING: Only use if sure. Hijacked notes are ones where the collaborator stole the owner's spot.
                for (const n of hijacked) {
                    await Note.updateOne({ _id: n._id }, { $set: { owner: user._id } });
                    console.log(`Restored hijacked: ${n.title}`);
                }

                console.log('\nRecovery complete! Please restart your application server.');
            }
        } else {
            console.log('\nNo notes found that match the "lost" criteria.');
        }

    } catch (err) {
        console.error('Recovery failed:', err);
    } finally {
        await mongoose.connection.close();
    }
}

recoverNotes();
