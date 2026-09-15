require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zoho_notes';

async function seedAdmin() {
    try {
        await mongoose.connect(mongoURI);
        console.log('Connected to MongoDB');

        const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
        const adminPass = process.env.ADMIN_PASSWORD || 'AdminSecretPass123!';

        const existingAdmin = await User.findOne({ email: adminEmail });
        if (existingAdmin) {
            console.log('Admin user already exists');
        } else {
            const hashedPassword = await bcrypt.hash(adminPass, 10);
            const admin = new User({
                username: 'Administrator',
                email: adminEmail,
                password: hashedPassword,
                role: 'admin'
            });
            await admin.save();
            console.log('Admin account created successfully!');
        }
    } catch (err) {
        console.error('Seed error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

seedAdmin();
