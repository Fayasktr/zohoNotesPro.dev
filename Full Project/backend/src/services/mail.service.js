const nodemailer = require('nodemailer');
const env = require('../config/env');

class MailService {
    constructor() {
        this.transporter = null;
        this._initTransporter();
    }

    _initTransporter() {
        const { HOST, PORT, USER, PASS } = env.EMAIL;
        const isPlaceholder = (val) => !val || val.includes('your-email') || val.includes('your-password');

        if (USER && PASS && !isPlaceholder(USER) && !isPlaceholder(PASS)) {
            this.transporter = nodemailer.createTransport({
                host: HOST,
                port: PORT,
                secure: PORT === 465,
                auth: { user: USER, pass: PASS }
            });
        }
    }

    /**
     * Send password reset email
     */
    async sendPasswordResetEmail(toEmail, username, resetToken, host) {
        const resetUrl = `${env.CLIENT_URL}/reset-password?token=${resetToken}`;

        if (!this.transporter) {
            console.log(`[MailService] SMTP not configured. Password reset link: ${resetUrl}`);
            return { sent: false, previewUrl: resetUrl };
        }

        const mailOptions = {
            from: env.EMAIL.FROM,
            to: toEmail,
            subject: '🔒 Reset Your Zoho Notes Pro Password',
            text: `Hello ${username},\n\nYou requested a password reset. Click the following link:\n${resetUrl}\n\nIf you did not make this request, please ignore this email.`,
            html: `
                <div style="font-family: Arial, sans-serif; background-color: #0f172a; padding: 30px; color: #f8fafc;">
                    <div style="max-width: 500px; margin: 0 auto; background-color: #1e293b; border-radius: 12px; padding: 24px; border: 1px solid #334155;">
                        <h2 style="color: #6366f1; margin-top: 0;">Password Reset Request</h2>
                        <p style="color: #cbd5e1; font-size: 15px;">Hello <b>${username}</b>,</p>
                        <p style="color: #94a3b8; font-size: 14px; line-height: 1.5;">
                            We received a request to reset your password. Click the button below to set a new password. This link is valid for 1 hour.
                        </p>
                        <div style="text-align: center; margin: 28px 0;">
                            <a href="${resetUrl}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Reset Password</a>
                        </div>
                        <p style="color: #64748b; font-size: 12px; margin-bottom: 0;">
                            If you did not request this, please ignore this email. Your password will remain unchanged.
                        </p>
                    </div>
                </div>
            `
        };

        try {
            await this.transporter.sendMail(mailOptions);
            return { sent: true };
        } catch (err) {
            console.error('[MailService] Failed to send email:', err.message);
            return { sent: false, error: err.message };
        }
    }
}

module.exports = new MailService();
