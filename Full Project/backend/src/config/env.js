require('dotenv').config();

const env = {
    PORT: parseInt(process.env.PORT, 10) || 5000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zoho_notes_pro',
    JWT_SECRET: process.env.JWT_SECRET || 'zoho_notes_pro_default_dev_secret_key_change_in_prod',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
    EMAIL: {
        HOST: process.env.EMAIL_HOST || 'smtp.gmail.com',
        PORT: parseInt(process.env.EMAIL_PORT, 10) || 587,
        USER: process.env.EMAIL_USER || '',
        PASS: process.env.EMAIL_PASS || '',
        FROM: process.env.EMAIL_FROM || '"Zoho Notes Pro" <no-reply@zohonotes.dev>'
    },
    LIMITS: {
        EXECUTION_TIMEOUT_MS: parseInt(process.env.EXECUTION_TIMEOUT_MS, 10) || 8000,
        WS_INTERACTIVE_TIMEOUT_MS: parseInt(process.env.WS_INTERACTIVE_TIMEOUT_MS, 10) || 30000,
        BODY_LIMIT: '50mb'
    },
    isProduction: process.env.NODE_ENV === 'production',
    isTest: process.env.NODE_ENV === 'test'
};

module.exports = env;
