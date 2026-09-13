const mongoose = require('mongoose');

const trashedCellSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['code', 'markdown'],
        default: 'code'
    },
    title: {
        type: String,
        default: ''
    },
    content: {
        type: String,
        default: ''
    },
    language: {
        type: String,
        default: 'javascript'
    },
    output: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    isStarred: {
        type: Boolean,
        default: false
    },
    originalNotebookId: {
        type: String,
        required: true,
        index: true
    },
    originalNotebookTitle: {
        type: String,
        default: 'Unknown Notebook'
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    deletedAt: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    collection: 'trashed_cells',
    timestamps: true
});

trashedCellSchema.index({ owner: 1, deletedAt: -1 });

module.exports = mongoose.model('TrashedCell', trashedCellSchema);
