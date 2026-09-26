const mongoose = require('mongoose');
const crypto = require('crypto');
const User = require('../models/User');

function generateApiKey(prefix = 'zn_live') {
    return `${prefix}_${crypto.randomBytes(20).toString('hex')}`;
}

async function provisionKeys(customUri) {
    const mongoUri = customUri || process.env.MONGODB_URI || 'mongodb://localhost:27017/zoho';
    console.log(`Connecting to MongoDB at: ${mongoUri.replace(/:([^:@]+)@/, ':****@')}`);
    await mongoose.connect(mongoUri);

    console.log('--- Checking & Provisioning MCP API Keys ---');
    const users = await User.find({});
    console.log(`Found ${users.length} total users in database.`);

    let updatedCount = 0;
    for (const user of users) {
        let changed = false;

        // Ensure Fayas KP is Superadmin
        if (user.email && user.email.toLowerCase() === 'fayaskpktr@gmail.com') {
            if (user.role !== 'admin') {
                user.role = 'admin';
                changed = true;
                console.log(`⭐ Designated ${user.email} as Superadmin ('admin' role)`);
            }
        }

        // Generate API key if not present
        if (!user.apiKey) {
            const prefix = user.role === 'admin' ? 'zn_admin' : 'zn_live';
            user.apiKey = generateApiKey(prefix);
            user.apiKeyCreatedAt = new Date();
            changed = true;
            console.log(`🔑 Generated key for ${user.username} (${user.email}) [Role: ${user.role}]: ${user.apiKey}`);
        }

        if (changed) {
            await user.save();
            updatedCount++;
        }
    }

    console.log(`\n✅ Provisioning complete! Updated ${updatedCount} users.`);

    // Summary table
    const allUsers = await User.find({}).select('username email role apiKey').lean();
    console.log('\n=== CURRENT USERS & MCP CREDENTIALS ===');
    allUsers.forEach(u => {
        console.log(`- [${u.role.toUpperCase()}] ${u.username} (${u.email}): ${u.apiKey || 'NO_KEY'}`);
    });

    return allUsers;
}

if (require.main === module) {
    provisionKeys()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Provisioning failed:', err);
            process.exit(1);
        });
}

module.exports = { provisionKeys, generateApiKey };
