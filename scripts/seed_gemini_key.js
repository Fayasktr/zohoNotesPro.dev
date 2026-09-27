require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { encrypt, maskApiKey } = require('../services/encryptionService');
const User = require('../models/User');

// Pass key via CLI: node scripts/seed_gemini_key.js <YOUR_KEY>
// Or set GEMINI_API_KEY in .env
const NEW_KEY = process.argv[2] || process.env.GEMINI_API_KEY_TO_SEED;

if (!NEW_KEY) {
    console.error('Usage: node scripts/seed_gemini_key.js <GEMINI_API_KEY>');
    process.exit(1);
}

async function seed() {
    await mongoose.connect(process.env.MONGODB_URI);

    const encrypted = encrypt(NEW_KEY);
    const masked = maskApiKey(NEW_KEY);
    const now = new Date();

    const targets = ['fayaskpktr@gmail.com', 'admin@gmail.com'];
    for (const email of targets) {
        const result = await User.updateOne(
            { email },
            { $set: { geminiApiKey: encrypted, geminiKeyMasked: masked, geminiKeyUpdatedAt: now, 'settings.aiCopilotEnabled': true } }
        );
        console.log(email, '- matched:', result.matchedCount, 'modified:', result.modifiedCount);
    }

    console.log('Masked key stored:', masked);
    await mongoose.disconnect();
    console.log('Done.');
}

seed().catch(err => { console.error(err); process.exit(1); });
