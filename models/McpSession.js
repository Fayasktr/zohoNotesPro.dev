const mongoose = require('mongoose');

const mcpSessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userEmail: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], required: true },
    clientInfo: {
        name: { type: String, default: 'ai-client' },
        version: { type: String, default: '1.0' }
    },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    status: { type: String, enum: ['active', 'closed'], default: 'active', index: true },
    createdAt: { type: Date, default: Date.now },
    lastActiveAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Auto-expire sessions after 7 days of inactivity
mcpSessionSchema.index({ lastActiveAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

module.exports = mongoose.model('McpSession', mcpSessionSchema);
