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
const Note = require('./models/Note');
const TrashedCell = require('./models/TrashedCell');
const AntigravityEngine = require('./engine/AntigravityEngine');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const helmet = require('helmet');
const csrf = require('csurf');
const rateLimit = require('express-rate-limit');

// Models
const User = require('./models/User');

// Routes
const adminRoutes = require('./routes/adminRoutes');

// Handlebars Helpers
hbs.registerHelper('substring', function (str, start, len) {
    if (!str) return "";
    return str.substring(start, len);
});

hbs.registerHelper('formatDate', function (date) {
    if (!date) return "";
    return new Date(date).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
});

// MongoDB Connection
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zoho';
mongoose.connect(mongoURI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

const app = express();
const PORT = process.env.PORT || 3000;

// Security Headers
app.use(helmet({
    contentSecurityPolicy: false, // Disabled for simplicity with CDN resources
}));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Prevent caching for all routes
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

// CSRF Protection
const csrfProtection = csrf({ cookie: false });

// Global CSRF Token Middleware
app.use((req, res, next) => {
    // Skip CSRF for non-mutating methods if desired, 
    // but csurf does this by default (GET, HEAD, OPTIONS are ignored)
    next();
});

// Middleware: Sync User Data & Check Block Status
app.use(async (req, res, next) => {
    if (req.session.userId) {
        try {
            const user = await User.findById(req.session.userId);
            if (!user || user.isBlocked) {
                const message = user && user.isBlocked ? 'Blocked by Admin' : 'Account deleted';
                return req.session.destroy(() => {
                    res.clearCookie('connect.sid');
                    // Add a query param to tell login why they were kicked
                    res.redirect(`/login?error=${encodeURIComponent(message)}`);
                });
            }
            res.locals.currentUser = user;
            res.locals.username = user.username; // Priority over session data
        } catch (err) {
            console.error('User sync error:', err);
        }
    }
    next();
});

// Rate Limiting for Auth Routes
const authLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minutes
    max: 100, // Limit each IP to 100 requests per window
    message: 'Too many requests from this IP, please try again after 1 minutes. This is to prevent abuse.',
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/login', authLimiter);
app.use('/signup', authLimiter);
app.use('/forgot-password', authLimiter);

// Apply CSRF Protection to all routes after session is initialized
app.use(csrfProtection);

// Pass CSRF token to all views
app.use((req, res, next) => {
    res.locals.csrfToken = req.csrfToken();
    next();
});

// CSRF Error Handler
app.use((err, req, res, next) => {
    if (err.code !== 'EBADCSRFTOKEN') return next(err);
    res.status(403).render('error', {
        title: 'Security Error',
        message: 'Invalid or missing CSRF token. Please refresh and try again.'
    });
});

// Middleware: Check Authentication
const isAuthenticated = (req, res, next) => {
    if (req.session.userId) {
        return next();
    }
    res.redirect('/login');
};

// --- ROUTES ---

// Admin Routes (MVC)
app.use('/admin', adminRoutes);

// Auth Routes
app.get('/signup', (req, res) => {
    if (req.session.userId) return res.redirect('/');
    res.render('signup', { title: 'Signup - Zoho Notes' });
});

app.post('/signup', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, email, password: hashedPassword, role: 'user' });
        await user.save();
        req.session.userId = user._id;
        req.session.username = user.username;
        req.session.role = user.role;
        res.redirect('/');
    } catch (err) {
        res.render('signup', { error: 'Email already exists' });
    }
});

app.get('/login', (req, res) => {
    if (req.session.userId) {
        return req.session.role === 'admin' ? res.redirect('/admin/dashboard') : res.redirect('/');
    }
    const error = req.query.error;
    res.render('login', { title: 'Login - Zoho Notes', error });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    // Rate Limiting Logic: 3 strikes, 30s cooldown
    const MAX_ATTEMPTS = 3;
    const COOLDOWN_MS = 30000;

    if (req.session.failedAttempts >= MAX_ATTEMPTS) {
        const now = Date.now();
        const elapsed = now - (req.session.lastAttemptTime || 0);

        if (elapsed < COOLDOWN_MS) {
            const waitTime = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
            return res.render('login', { error: `Too many failed attempts. Please wait ${waitTime} seconds.` });
        }
    }

    try {
        const user = await User.findOne({ email });
        if (user && await bcrypt.compare(password, user.password)) {
            if (user.isBlocked) {
                return res.render('login', { error: 'Your account has been blocked by an administrator.' });
            }

            // Clear attempts on success
            req.session.failedAttempts = 0;
            req.session.lastAttemptTime = null;

            req.session.userId = user._id;
            req.session.username = user.username;
            req.session.role = user.role;

            // Update Last Login
            user.lastLogin = new Date();
            await user.save();

            if (user.role === 'admin') {
                res.redirect('/admin/dashboard');
            } else {
                res.redirect('/');
            }
        } else {
            // Track failures
            req.session.failedAttempts = (req.session.failedAttempts || 0) + 1;
            req.session.lastAttemptTime = Date.now();

            let message = 'Invalid email or password';
            if (req.session.failedAttempts >= MAX_ATTEMPTS) {
                message = 'Too many failed attempts. Please wait 30 seconds.';
            }
            res.render('login', { error: message });
        }
    } catch (err) {
        res.render('login', { error: 'Something went wrong' });
    }
});

app.get('/logout', async (req, res) => {
    try {
        if (req.session.userId) {
            await User.findByIdAndUpdate(req.session.userId, { lastLogout: new Date() });
        }
    } catch (err) {
        console.error('Logout log error:', err);
    }
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
            return res.render('forgot', { success: 'If an account exists with that email, a reset link has been sent.' });
        }

        const token = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000;
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
                console.log(`Password reset email sent to: ${user.email}`);
            } catch (smtpError) {
                console.error('SMTP ERROR detail:', smtpError);
                console.log(`Link: http://${req.headers.host}/reset-password/${token}`);
            }
        } else {
            console.log(`Link: http://${req.headers.host}/reset-password/${token}`);
        }

        res.render('forgot', { success: 'If an account exists with that email, a reset link has been sent.' });
    } catch (err) {
        res.render('forgot', { error: 'Something went wrong. Please try again later.' });
    }
});

app.get('/reset-password/:token', async (req, res) => {
    try {
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }
        });
        if (!user) return res.render('forgot', { error: 'Password reset token is invalid or has expired.' });
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
        if (!user) return res.render('forgot', { error: 'Password reset token is invalid or has expired.' });
        user.password = await bcrypt.hash(password, 10);
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
    if (req.session.role === 'admin') return res.redirect('/admin/dashboard');
    res.render('index', {
        title: 'Zoho Notes',
        username: res.locals.username
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
        }, 'id title folder isStarred updatedAt').sort({ updatedAt: -1 });
        res.json(notes);
    } catch (err) {
        res.status(500).json({ error: 'Failed to list notebooks' });
    }
});

app.get(/^\/api\/notebooks\/(.+)$/, isAuthenticated, async (req, res) => {
    const notebookId = req.params[0];
    try {
        const query = { id: notebookId };
        if (req.session.role !== 'admin') {
            query.owner = req.session.userId;
        }
        const note = await Note.findOne(query);
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
        const notebooks = await Note.find({ owner: req.session.userId, isTrashed: true }, 'id title folder updatedAt');
        const cells = await TrashedCell.find({ owner: req.session.userId }).sort({ deletedAt: -1 });

        res.json({
            notebooks,
            cells
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to list trash' });
    }
});

// Trash individual cell
app.post('/api/cells/trash', isAuthenticated, async (req, res) => {
    const { notebookId, cell } = req.body;
    try {
        const notebook = await Note.findOne({ id: notebookId, owner: req.session.userId });
        if (!notebook) return res.status(404).json({ error: 'Notebook not found' });

        // Save to TrashedCell
        const trashedCell = new TrashedCell({
            ...cell,
            originalNotebookId: notebookId,
            originalNotebookTitle: notebook.title,
            owner: req.session.userId
        });
        await trashedCell.save();

        // Remove from Note content
        await Note.updateOne(
            { id: notebookId, owner: req.session.userId },
            { $pull: { 'content.cells': { id: cell.id } } }
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Trash cell error:', err);
        res.status(500).json({ error: 'Failed to trash cell' });
    }
});

// Restore individual cell
app.post('/api/trash/restore-cell/:id', isAuthenticated, async (req, res) => {
    const cellId = req.params.id;
    try {
        const trashedCell = await TrashedCell.findOne({ id: cellId, owner: req.session.userId });
        if (!trashedCell) return res.status(404).json({ error: 'Trashed cell not found' });

        // Check if notebook exists
        const notebook = await Note.findOne({ id: trashedCell.originalNotebookId, owner: req.session.userId });
        if (!notebook) return res.status(404).json({ error: 'Original notebook no longer exists' });

        // Move back to notebook
        const cellData = trashedCell.toObject();
        delete cellData._id;
        delete cellData.originalNotebookId;
        delete cellData.originalNotebookTitle;
        delete cellData.deletedAt;
        delete cellData.owner;

        await Note.updateOne(
            { id: trashedCell.originalNotebookId, owner: req.session.userId },
            { $push: { 'content.cells': cellData } }
        );

        // Delete from trash
        await TrashedCell.deleteOne({ id: cellId, owner: req.session.userId });

        res.json({ success: true, notebookId: trashedCell.originalNotebookId });
    } catch (err) {
        res.status(500).json({ error: 'Failed to restore cell' });
    }
});

// Permanently delete individual cell
app.delete('/api/trash/cell/:id', isAuthenticated, async (req, res) => {
    const cellId = req.params.id;
    try {
        await TrashedCell.deleteOne({ id: cellId, owner: req.session.userId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete trashed cell' });
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

// Rename Notebook
app.put(/^\/api\/notebooks\/(.+)\/rename$/, isAuthenticated, async (req, res) => {
    const notebookId = req.params[0];
    const { title } = req.body;
    try {
        await Note.updateOne({ id: notebookId, owner: req.session.userId }, { title, updatedAt: new Date() });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to rename notebook' });
    }
});

// Move Cell between Notebooks
app.post('/api/notebooks/move-cell', isAuthenticated, async (req, res) => {
    const { sourceNotebookId, targetNotebookId, cell } = req.body;
    try {
        // 1. Remove from source
        await Note.updateOne(
            { id: sourceNotebookId, owner: req.session.userId },
            { $pull: { 'content.cells': { id: cell.id } } }
        );

        // 2. Add to target
        await Note.updateOne(
            { id: targetNotebookId, owner: req.session.userId },
            { $push: { 'content.cells': cell } }
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Move cell API error:', err);
        res.status(500).json({ error: 'Failed to move cell' });
    }
});

// Folder Management
app.put('/api/folders/rename', isAuthenticated, async (req, res) => {
    const { oldName, newName } = req.body;
    try {
        await Note.updateMany(
            { folder: oldName, owner: req.session.userId },
            { folder: newName, updatedAt: new Date() }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to rename folder' });
    }
});

app.delete(/^\/api\/folders\/(.+)$/, isAuthenticated, async (req, res) => {
    const folderName = req.params[0];
    try {
        await Note.updateMany(
            { folder: folderName, owner: req.session.userId },
            { isTrashed: true, updatedAt: new Date() }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete folder' });
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
        await Note.deleteOne({ id: notebookId, owner: req.session.userId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to permanently delete' });
    }
});

app.delete('/api/trash-all', isAuthenticated, async (req, res) => {
    try {
        await Note.deleteMany({ owner: req.session.userId, isTrashed: true });
        await TrashedCell.deleteMany({ owner: req.session.userId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to empty trash' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server on http://localhost:${PORT}`);
});
