require('dotenv').config();
const express = require('express');
const hbs = require('hbs');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const mongoose = require('mongoose');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const bcrypt = require('bcryptjs');
const engine = require('./engine/AntigravityEngine');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Handlebars Helpers
hbs.registerHelper('substring', function (str, start, len) {
    if (!str) return "";
    return str.substring(start, len);
});

// MongoDB Connection
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zoho';
mongoose.connect(mongoURI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    resetPasswordToken: String,
    resetPasswordExpires: Date
});

const User = mongoose.model('User', userSchema);

// Note Schema (Updated with owner)
const noteSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    title: { type: String, default: 'Untitled' },
    isStarred: { type: Boolean, default: false },
    isTrashed: { type: Boolean, default: false },
    content: { type: mongoose.Schema.Types.Mixed, default: {} },
    folder: { type: String, default: 'root' },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedAt: { type: Date, default: Date.now }
}, { collection: 'notes' });

const Note = mongoose.model('Note', noteSchema);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Prevent caching for all routes (important for logout security)
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

// Session Configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'zoho-secret-key-123',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: mongoURI }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// Middleware: Check Authentication
const isAuthenticated = (req, res, next) => {
    if (req.session.userId) {
        return next();
    }
    res.redirect('/login');
};

// --- AUTH ROUTES ---

app.get('/signup', (req, res) => {
    if (req.session.userId) return res.redirect('/');
    res.render('signup', { title: 'Signup - Zoho Notes' });
});

app.post('/signup', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, email, password: hashedPassword });
        await user.save();
        req.session.userId = user._id;
        req.session.username = user.username;
        res.redirect('/');
    } catch (err) {
        res.render('signup', { error: 'Email already exists' });
    }
});

app.get('/login', (req, res) => {
    if (req.session.userId) return res.redirect('/');
    res.render('login', { title: 'Login - Zoho Notes' });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (user && await bcrypt.compare(password, user.password)) {
            req.session.userId = user._id;
            req.session.username = user.username;
            res.redirect('/');
        } else {
            res.render('login', { error: 'Invalid email or password' });
        }
    } catch (err) {
        res.render('login', { error: 'Something went wrong' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

// --- FORGOT PASSWORD ROUTES ---

app.get('/forgot-password', (req, res) => {
    res.render('forgot', { title: 'Forgot Password - Zoho Notes' });
});

app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            // Security best practice: don't reveal if user exists
            return res.render('forgot', { success: 'If an account exists with that email, a reset link has been sent.' });
        }

        const token = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const mailOptions = {
            to: user.email,
            from: `"Zoho Notes" <${process.env.EMAIL_USER}>`,
            subject: 'Password Reset - Zoho Notes',
            text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n` +
                `Please click on the following link, or paste this into your browser to complete the process:\n\n` +
                `http://${req.headers.host}/reset-password/${token}\n\n` +
                `If you did not request this, please ignore this email and your password will remain unchanged.\n`
        };

        const isPlaceholder = email => !email || email.includes('your-email@') || email.includes('your-password');

        if (process.env.EMAIL_USER && process.env.EMAIL_PASS && !isPlaceholder(process.env.EMAIL_USER) && !isPlaceholder(process.env.EMAIL_PASS)) {
            try {
                await transporter.sendMail(mailOptions);
                await transporter.sendMail(mailOptions);
                console.log(`Password reset email sent to: ${user.email}`);
            } catch (smtpError) {
                console.error('SMTP ERROR detail:', smtpError);
                console.error('SMTP Error Message:', smtpError.message);
                // Fallback to console if SMTP fails
                console.log('--- RESET LINK (SMTP FAILED) ---');
                console.log(`Link: http://${req.headers.host}/reset-password/${token}`);
                console.log('-------------------------------------------');
            }
        } else {
            console.log('--- RESET LINK (Emails not configured or using placeholders) ---');
            console.log(`Link: http://${req.headers.host}/reset-password/${token}`);
            console.log('-------------------------------------------');
        }

        res.render('forgot', { success: 'If an account exists with that email, a reset link has been sent.' });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.render('forgot', { error: 'Something went wrong. Please try again later.' });
    }
});

app.get('/reset-password/:token', async (req, res) => {
    try {
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.render('forgot', { error: 'Password reset token is invalid or has expired.' });
        }

        res.render('reset', { title: 'Reset Password - Zoho Notes', token: req.params.token });
    } catch (err) {
        res.render('forgot', { error: 'Something went wrong.' });
    }
});

app.post('/reset-password/:token', async (req, res) => {
    const { password, confirm } = req.body;
    if (password !== confirm) {
        return res.render('reset', { error: 'Passwords do not match.', token: req.params.token });
    }

    try {
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.render('forgot', { error: 'Password reset token is invalid or has expired.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.render('login', { success: 'Success! Your password has been changed. You can now login.' });
    } catch (err) {
        res.render('reset', { error: 'Something went wrong.', token: req.params.token });
    }
});

// --- CORE APP ROUTES ---

app.get('/', isAuthenticated, (req, res) => {
    res.render('index', {
        title: 'Zoho Notes',
        username: req.session.username
    });
});

app.post('/api/execute', isAuthenticated, async (req, res) => {
    const { code } = req.body;
    try {
        const result = await engine.execute(code);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/notebooks', isAuthenticated, async (req, res) => {
    try {
        const notes = await Note.find({
            owner: req.session.userId,
            isTrashed: { $ne: true }
        }, 'id title folder isStarred');
        res.json(notes);
    } catch (err) {
        res.status(500).json({ error: 'Failed to list notebooks' });
    }
});

app.get(/^\/api\/notebooks\/(.+)$/, isAuthenticated, async (req, res) => {
    const notebookId = req.params[0];
    try {
        const note = await Note.findOne({ id: notebookId, owner: req.session.userId });
        if (!note) return res.status(404).json({ error: 'Notebook not found' });
        res.json(note.content || note);
    } catch (err) {
        res.status(500).json({ error: 'Failed to read notebook' });
    }
});

app.post('/api/notebooks', isAuthenticated, async (req, res) => {
    const notebookData = req.body;
    if (!notebookData.id) return res.status(400).json({ error: 'No notebook ID provided' });

    try {
        const updateData = {
            id: notebookData.id,
            title: notebookData.title || 'Untitled',
            isStarred: !!notebookData.isStarred,
            content: notebookData,
            folder: notebookData.folder || 'root',
            owner: req.session.userId,
            updatedAt: new Date()
        };

        await Note.findOneAndUpdate(
            { id: notebookData.id, owner: req.session.userId },
            updateData,
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save notebook' });
    }
});

app.get('/api/trash', isAuthenticated, async (req, res) => {
    try {
        const notes = await Note.find({ owner: req.session.userId, isTrashed: true }, 'id title folder updated_at');
        res.json(notes);
    } catch (err) {
        res.status(500).json({ error: 'Failed to list trash' });
    }
});

app.delete(/^\/api\/notebooks\/(.+)$/, isAuthenticated, async (req, res) => {
    const notebookId = req.params[0];
    try {
        const result = await Note.updateOne({ id: notebookId, owner: req.session.userId }, { isTrashed: true });
        if (result.matchedCount === 0) return res.status(404).json({ error: 'Notebook not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to move to trash' });
    }
});

app.post(/^\/api\/trash\/restore\/(.+)$/, isAuthenticated, async (req, res) => {
    const notebookId = req.params[0];
    try {
        const result = await Note.updateOne({ id: notebookId, owner: req.session.userId }, { isTrashed: false });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to restore notebook' });
    }
});

app.delete(/^\/api\/trash\/(.+)$/, isAuthenticated, async (req, res) => {
    const notebookId = req.params[0];
    try {
        const result = await Note.deleteOne({ id: notebookId, owner: req.session.userId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to permanently delete' });
    }
});

app.delete('/api/trash-all', isAuthenticated, async (req, res) => {
    try {
        await Note.deleteMany({ owner: req.session.userId, isTrashed: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to empty trash' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server on http://localhost:${PORT}`);
});
