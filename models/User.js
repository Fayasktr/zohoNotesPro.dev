const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String }, // Optional for Google users
    googleId: { type: String, unique: true, sparse: true },
    avatar: String,
    isGoogleAuth: { type: Boolean, default: false },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    isBlocked: { type: Boolean, default: false },
    apiKey: { type: String, unique: true, sparse: true, index: true },
    apiKeyCreatedAt: { type: Date },
    apiKeyExpiresAt: { type: Date },
    apiKeyLastUsedAt: { type: Date },
    mcpUsage: {
        dailyCount: { type: Number, default: 0 },
        lastResetDate: { type: String, default: () => new Date().toISOString().slice(0, 10) }
    },
    lastLogin: Date,
    lastLogout: Date,
    lastActivity: Date,
    settings: {
        defaultLanguage: { type: String, default: 'javascript' }
    },
    // Game Progress
    points: { type: Number, default: 0 },
    completedQuests: { type: [String], default: [] },
    skipCredits: { type: Number, default: 0 },
    correctAnswersCount: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
