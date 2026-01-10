const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    title: { type: String, default: 'Untitled' },
    isStarred: { type: Boolean, default: false },
    isTrashed: { type: Boolean, default: false },
    content: { type: mongoose.Schema.Types.Mixed, default: {} },
    folder: { type: String, default: 'root' },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedAt: { type: Date, default: Date.now }
}, { collection: 'notes' });

module.exports = mongoose.model('Note', noteSchema);
