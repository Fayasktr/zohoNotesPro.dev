const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function getMasterKey() {
    const secret = process.env.ENCRYPTION_SECRET || process.env.SESSION_SECRET || 'zoho-notes-super-secret-key-32b-secure';
    return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt plain text using AES-256-GCM
 */
function encrypt(plainText) {
    if (!plainText) return null;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, getMasterKey(), iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    return {
        encrypted,
        iv: iv.toString('hex'),
        tag
    };
}

/**
 * Decrypt cipher payload using AES-256-GCM
 */
function decrypt(encryptedObj) {
    if (!encryptedObj || !encryptedObj.encrypted || !encryptedObj.iv || !encryptedObj.tag) {
        return null;
    }
    try {
        const decipher = crypto.createDecipheriv(ALGORITHM, getMasterKey(), Buffer.from(encryptedObj.iv, 'hex'));
        decipher.setAuthTag(Buffer.from(encryptedObj.tag, 'hex'));
        let decrypted = decipher.update(encryptedObj.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        console.error('[EncryptionService] Decryption failed:', err.message);
        return null;
    }
}

/**
 * Mask API key for safe UI display
 */
function maskApiKey(key) {
    if (!key || key.length < 10) return '••••••••';
    return key.substring(0, 8) + '••••••••' + key.substring(key.length - 4);
}

module.exports = {
    encrypt,
    decrypt,
    maskApiKey
};
