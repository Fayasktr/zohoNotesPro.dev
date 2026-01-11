const mongoose = require('mongoose');

const trashedCellSchema = new mongoose.Schema({
    id: { type: String, required: true },
    type: { type: String, required: true },
    title: { type: String, default: '' },
    content: { type: String, default: '' },
    output: { type: mongoose.Schema.Types.Mixed, default: null },
    isStarred: { type: Boolean, default: false },
    originalNotebookId: { type: String, required: true },
    originalNotebookTitle: { type: String, default: 'Unknown' },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deletedAt: { type: Date, default: Date.now }
}, { collection: 'trashed_cells' });

module.exports = mongoose.model('TrashedCell', trashedCellSchema);
