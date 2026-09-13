const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Username is required'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        index: true
    },
    password: {
        type: String,
        select: false // Excluded by default in queries for security
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true
    },
    avatar: {
        type: String,
        default: ''
    },
    isGoogleAuth: {
        type: Boolean,
        default: false
    },
    resetPasswordToken: {
        type: String,
        select: false
    },
    resetPasswordExpires: {
        type: Date,
        select: false
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user',
        index: true
    },
    isBlocked: {
        type: Boolean,
        default: false,
        index: true
    },
    lastLogin: Date,
    lastLogout: Date,
    lastActivity: Date,
    settings: {
        defaultLanguage: { type: String, default: 'javascript' },
        theme: { type: String, default: 'dark' },
        autoSaveIntervalMs: { type: Number, default: 1500 }
    }
}, {
    timestamps: true
});

userSchema.methods.hasRole = function(role) {
    return this.role === role;
};

module.exports = mongoose.model('User', userSchema);
