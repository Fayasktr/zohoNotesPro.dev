const mongoose = require('mongoose');

const systemLogSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['info', 'success', 'warning', 'error'],
        default: 'info',
        index: true
    },
    message: {
        type: String,
        required: true
    },
    meta: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    isRead: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Auto-expire logs after 30 days
systemLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('SystemLog', systemLogSchema);
