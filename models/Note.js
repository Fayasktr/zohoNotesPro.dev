const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    title: { type: String, default: 'Untitled' },
    isStarred: { type: Boolean, default: false },
    isTrashed: { type: Boolean, default: false },
    content: { type: mongoose.Schema.Types.Mixed, default: {} },
    folder: { type: String, default: 'root' },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    collaborators: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        email: String, // Store email for easier lookup of pending invites
        status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
        joinedAt: { type: Date, default: Date.now }
    }],
    updatedAt: { type: Date, default: Date.now },
    trashedAt: { type: Date } // Date when the note was moved to trash
}, { collection: 'notes' });

module.exports = mongoose.model('Note', noteSchema);
