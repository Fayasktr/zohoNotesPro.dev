const mongoose = require('mongoose');

const systemLogSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['info', 'success', 'warning', 'error'],
        default: 'info'
    },
    message: {
        type: String,
        required: true
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
    timestamps: true,
    capped: { size: 1024, max: 20 } // Limit to 20 documents, max size 1KB (approximation)
});

// Remove explicit index as capped manages size
// systemLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 604800 });

module.exports = mongoose.model('SystemLog', systemLogSchema);
