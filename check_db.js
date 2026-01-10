require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const fs = require('fs');

const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zoho';

async function checkUsers() {
    try {
        await mongoose.connect(mongoURI);
        const allUsers = await User.find({});
        const result = {
            total: allUsers.length,
            users: allUsers.map(u => ({
                id: u._id,
                email: u.email,
                role: u.role,
                isBlocked: u.isBlocked,
                hasPassword: !!u.password
            }))
        };
        fs.writeFileSync('db_diagnostic.json', JSON.stringify(result, null, 2));
        console.log('Diagnostic data written to db_diagnostic.json');
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

checkUsers();
