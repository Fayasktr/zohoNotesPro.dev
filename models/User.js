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
    lastLogout: Date
});

module.exports = mongoose.model('User', userSchema);
