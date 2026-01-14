const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String }, // Optional for Google users
    googleId: { type: String, unique: true, sparse: true },
    avatar: String,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    isBlocked: { type: Boolean, default: false },
    lastLogin: Date,
    lastLogout: Date,
    settings: {
        defaultLanguage: { type: String, default: 'javascript' }
    },
    // Game Progress
    points: { type: Number, default: 0 },
    completedQuests: { type: [String], default: [] },
    skipCredits: { type: Number, default: 0 },
    correctAnswersCount: { type: Number, default: 0 }
});

module.exports = mongoose.model('User', userSchema);
