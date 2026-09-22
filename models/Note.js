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
    shareCode: { type: String, unique: true, sparse: true, index: true },
    authorName: { type: String, default: '' },
    isLive: { type: Boolean, default: false, index: true },
    updatedAt: { type: Date, default: Date.now },
    trashedAt: { type: Date }, // Date when the note was moved to trash
    _version: { type: Number, default: 1 } // Monotonic version vector for multi-device sync
}, { collection: 'notes' });

// Auto-generate unique shareCode if note is marked live and shareCode is missing
noteSchema.pre('save', function (next) {
    const isLive = Boolean(
        this.isLive === true ||
        (this.id && this.id.startsWith('live-')) ||
        (this.content && (this.content.isLive === true || this.content.isLive === 'true'))
    );
    if (isLive) {
        this.isLive = true;
        if (!this.shareCode) {
            const crypto = require('crypto');
            this.shareCode = 'collab-' + crypto.randomBytes(6).toString('hex');
        }
    } else {
        this.isLive = false;
        if (this.shareCode === null || this.shareCode === '') {
            this.shareCode = undefined;
        }
    }
    next();
});

module.exports = mongoose.model('Note', noteSchema);
