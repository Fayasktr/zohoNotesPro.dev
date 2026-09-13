const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    message: {
        type: String,
        required: [true, 'Feedback message cannot be empty'],
        trim: true
    },
    isRead: {
        type: Boolean,
        default: false,
        index: true
    },
    category: {
        type: String,
        enum: ['general', 'bug', 'feature', 'ui'],
        default: 'general'
    }
}, {
    timestamps: true
});

feedbackSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
