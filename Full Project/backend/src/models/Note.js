const mongoose = require('mongoose');

const collaboratorSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    email: {
        type: String,
        lowercase: true,
        trim: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'declined'],
        default: 'pending'
    },
    joinedAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

const noteSchema = new mongoose.Schema({
    id: {
        type: String,
        required: [true, 'Notebook ID is required'],
        unique: true,
        index: true
    },
    title: {
        type: String,
        default: 'Untitled Notebook',
        trim: true
    },
    isStarred: {
        type: Boolean,
        default: false,
        index: true
    },
    isTrashed: {
        type: Boolean,
        default: false,
        index: true
    },
    folder: {
        type: String,
        default: 'root',
        trim: true,
        index: true
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    content: {
        type: mongoose.Schema.Types.Mixed,
        default: () => ({ cells: [], tags: [] })
    },
    collaborators: [collaboratorSchema],
    trashedAt: {
        type: Date,
        default: null
    },
    _version: {
        type: Number,
        default: 1,
        index: true
    },
    updatedAt: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    collection: 'notes',
    timestamps: true
});

// Compound indexes for high-frequency queries
noteSchema.index({ owner: 1, isTrashed: 1, updatedAt: -1 });
noteSchema.index({ 'collaborators.user': 1, 'collaborators.status': 1 });
noteSchema.index({ owner: 1, folder: 1 });

module.exports = mongoose.model('Note', noteSchema);
