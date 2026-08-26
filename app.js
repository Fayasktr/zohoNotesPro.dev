require('dotenv').config();
const express = require('express');
const hbs = require('hbs');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const http = require('http');
const { WebSocketServer } = require('ws');
const { spawn: spawnProcess } = require('child_process');
const mongoose = require('mongoose');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const bcrypt = require('bcryptjs');
const Note = require('./models/Note');
const TrashedCell = require('./models/TrashedCell');
const Feedback = require('./models/Feedback');
const engine = require('./engine/AntigravityEngine');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const helmet = require('helmet');
const csrf = require('csurf');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// Models
const User = require('./models/User');
const SystemLog = require('./models/SystemLog');
const SystemConfig = require('./models/SystemConfig');


// Routes
const adminRoutes = require('./routes/adminRoutes');
const gameRoutes = require('./routes/gameRoutes');
const syncRoutes = require('./routes/syncRoutes');
const cronService = require('./services/cronService');

// Start Cron Jobs
cronService.start();

// Handlebars Helpers
hbs.registerHelper('substring', function (str, start, len) {
    if (!str) return "";
    return str.substring(start, len);
});

hbs.registerHelper('formatDate', function (date) {
    if (!date) return "";
    return new Date(date).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
});

hbs.registerHelper('eq', function (a, b) {
    return a === b;
});

hbs.registerHelper('add', function (a, b) {
    return (a || 0) + b;
});

hbs.registerHelper('contains', function (arr, val) {
    if (!Array.isArray(arr)) return false;
    return arr.includes(String(val));
});

hbs.registerHelper('even', function (index) {
    return index % 2 === 0;
});

// MongoDB Connection
// MongoDB Connection
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zoho';

// Debug Log (Masked)
const maskedURI = mongoURI.replace(/:([^:@]+)@/, ':****@');
console.log(`[Startup] Attempting to connect to MongoDB at: ${maskedURI}`);

if (process.env.NODE_ENV === 'production' && !process.env.MONGODB_URI) {
    console.warn('[WARNING] NODE_ENV is production but MONGODB_URI is not set! Defaulting to localhost (likely to fail on Render).');
}

mongoose.connect(mongoURI)
    .then(() => console.log('[Startup] Connected to MongoDB Successfully'))
    .catch(err => {
        console.error('[Startup] MongoDB connection error:', err);
        process.exit(1); // Fail fast so Render knows
    });

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

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
hbs.registerPartials(path.join(__dirname, 'views/partials'));

// Prevent caching for all routes
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

// Session Configuration
app.set('trust proxy', 1); // Trust first proxy (required for Render/Heroku)


app.use(session({
    secret: process.env.SESSION_SECRET || 'zoho-secret-key-123',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: mongoURI }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 1 day
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    }
}));

// Passport Middleware
app.use(passport.initialize());
app.use(passport.session());

// Passport Serialization
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id).lean();
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

// Passport Google Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback",
    proxy: true,
    passReqToCallback: true
}, async (req, accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails[0].value.toLowerCase().trim().toLowerCase();
        console.log(`[Google Auth] Attempting login for email: ${email}`);

        let user = await User.findOne({ googleId: profile.id });

        if (!user) {
            console.log(`[Google Auth] No user found with googleId: ${profile.id}. Searching by email (case-insensitive)...`);
            // Check if user exists with same email (case-insensitive) but no Google ID
            user = await User.findOne({ email });

            if (user) {
                console.log(`[Google Auth] Existing user found with email: ${email}. Merging accounts...`);
                user.googleId = profile.id;
                user.avatar = profile.photos[0].value;
                user.isGoogleAuth = true;
                await user.save();
                console.log(`[Google Auth] Account successfully merged for: ${email}`);

                // Send notification email
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: process.env.EMAIL_USER,
                        pass: process.env.EMAIL_PASS
                    }
                });

                const mailOptions = {
                    to: user.email,
                    from: `"Zoho Notes Security" <${process.env.EMAIL_USER}>`,
                    subject: '🔒 Google Account Linked - Zoho Notes',
                    text: `Hello ${user.username},\n\n` +
                        `Your Zoho Notes account has been linked to your Google account (${email}).\n\n` +
                        `You can now use "Sign in with Google" to access your account.\n\n` +
                        `If you did not authorize this, please contact support.\n\n` +
                        `Best regards,\nThe Zoho Notes Team`,
                    html: `
                        <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; padding: 40px 20px; color: #f8fafc; text-align: center;">
                            <div style="max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);">
                                <div style="background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); padding: 30px; text-align: center;">
                                    <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">Security Update</h1>
                                </div>
                                <div style="padding: 40px 30px; text-align: left;">
                                    <h2 style="color: #f8fafc; font-size: 20px; font-weight: 700; margin-bottom: 20px;">Hello ${user.username},</h2>
                                    <p style="color: #cbd5e1; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                                        This is a notification to let you know that your Zoho Notes account has been successfully linked to your Google account:
                                    </p>
                                    <div style="background-color: #0f172a; border-radius: 12px; padding: 16px; border: 1px solid #334155; margin-bottom: 30px; display: inline-block; width: 100%; box-sizing: border-box;">
                                        <div style="display: flex; align-items: center;">
                                            <div style="color: #818cf8; font-weight: 600; font-size: 15px;">Google Account:</div>
                                            <div style="color: #f8fafc; margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 14px;">${email}</div>
                                        </div>
                                    </div>
                                    <p style="color: #cbd5e1; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
                                        From now on, you can skip the password and access your notes instantly using the <b>Sign in with Google</b> button.
                                    </p>
                                    <a href="https://${req.headers.host}/login" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 16px; box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.3);">Go to Zoho Notes</a>
                                </div>
                                <div style="padding: 30px; background-color: #0f172a; border-top: 1px solid #334155; text-align: center;">
                                    <p style="color: #64748b; font-size: 14px; margin: 0;">
                                        If you did not authorize this change, please contact our security team immediately.
                                    </p>
                                    <div style="margin-top: 20px; color: #94a3b8; font-size: 13px; font-weight: 600;">
                                        &copy; 2026 Zoho Notes &bull; Advanced Agentic Coding
                                    </div>
                                </div>
                            </div>
                        </div>
                    `
                };

                const isPlaceholder = email => !email || email.includes('your-email@') || email.includes('your-password');
                if (process.env.EMAIL_USER && process.env.EMAIL_PASS && !isPlaceholder(process.env.EMAIL_USER) && !isPlaceholder(process.env.EMAIL_PASS)) {
                    transporter.sendMail(mailOptions).catch(err => console.error('[Google Auth] Email send failed:', err));
                } else {
                    console.log('[Google Auth] Notification email skipped (SMTP not configured).');
                }
            } else {
                console.log(`[Google Auth] No existing user found for: ${email}. Creating new account...`);
                user = await User.create({
                    username: profile.displayName,
                    email: email,
                    googleId: profile.id,
                    avatar: profile.photos[0].value,
                    isGoogleAuth: true
                });
                console.log(`[Google Auth] New account created for: ${email}`);
            }
        } else {
            console.log(`[Google Auth] User found with googleId: ${profile.id}`);
            if (!user.isGoogleAuth) {
                user.isGoogleAuth = true;
                await user.save();
            }
        }
        return done(null, user);
    } catch (err) {
        console.error('[Google Auth] Error in strategy callback:', err);
        return done(err, null);
    }
}));

// Public Ping Endpoint (for keep-alive)
// Defined before CSRF to allow external health checks
app.get('/api/ping', (req, res) => res.status(200).send('pong'));

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
            const user = await User.findById(req.session.userId).lean();
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
    } else if (req.isAuthenticated()) {
        // Sync Passport user to res.locals
        res.locals.currentUser = req.user;
        res.locals.username = req.user.username;
    }
    next();
});

// Middleware: Track Last Activity
app.use(async (req, res, next) => {
    const userId = req.session?.userId || req.user?._id;
    if (userId) {
        try {
            const now = new Date();
            const lastUpdate = req.session.lastActivityUpdate ? new Date(req.session.lastActivityUpdate) : null;

            if (!lastUpdate || (now - lastUpdate) > 60000) {
                await User.findByIdAndUpdate(userId, { lastActivity: now });
                req.session.lastActivityUpdate = now.toISOString();
            }
        } catch (err) {
            console.error('Activity tracking error:', err);
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

    // Check if it's an AJAX request
    if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
        return res.status(403).json({
            error: 'Invalid or missing CSRF token. Please refresh the page.',
            code: 'CSRF_ERROR'
        });
    }

    res.status(403).render('error', {
        title: 'Security Error',
        message: 'Invalid or missing CSRF token. Please refresh and try again.'
    });
});

// Middleware: Check Authentication
const isAuthenticated = (req, res, next) => {
    if (req.session.userId || req.isAuthenticated()) {
        return next();
    }

    // Check if it's an AJAX request
    if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
        return res.status(401).json({
            error: 'Session expired. Please login again.',
            code: 'AUTH_EXPIRED'
        });
    }

    res.redirect('/login');
};

// --- ROUTES ---

// Admin Routes (MVC)
app.use('/admin', adminRoutes);
app.use('/', gameRoutes);
app.use('/api/sync', isAuthenticated, syncRoutes);
app.use('/api/backup', isAuthenticated, syncRoutes);

// SEO: Dynamic XML Sitemap Route
app.get('/sitemap.xml', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const date = new Date().toISOString().split('T')[0];
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${date}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/login</loc>
    <lastmod>${date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/signup</loc>
    <lastmod>${date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/forgot-password</loc>
    <lastmod>${date}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>${baseUrl}/sharing-notes</loc>
    <lastmod>${date}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${baseUrl}/presentation.html</loc>
    <lastmod>${date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
</urlset>`;
    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
});

// Auth Routes
app.get('/signup', (req, res) => {
    if (req.session.userId) return res.redirect('/');
    res.render('signup', {
        title: 'Sign Up - Zoho Notes',
        metaTitle: 'Sign Up - Zoho Notes',
        metaDescription: 'Create a free Zoho Notes account to write markdown documentation and execute JavaScript, Python, C, C++, and Java code directly in your browser.',
        metaKeywords: 'zoho notes signup, create notebook account, online python compiler signup, code editor registration',
        canonicalUrl: `${req.protocol}://${req.get('host')}/signup`
    });
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
        res.render('signup', {
            title: 'Sign Up - Zoho Notes',
            error: 'Email already exists',
            canonicalUrl: `${req.protocol}://${req.get('host')}/signup`
        });
    }
});

// Google Auth Routes (Directly in app.js for now or separate file)
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
        // Successful authentication
        res.redirect('/');
    }
);

app.get('/login', (req, res) => {
    if (req.session.userId) {
        return req.session.role === 'admin' ? res.redirect('/admin/dashboard') : res.redirect('/');
    }
    const error = req.query.error;
    res.render('login', {
        title: 'Login - Zoho Notes',
        metaTitle: 'Login - Zoho Notes',
        metaDescription: 'Sign in to Zoho Notes to access your interactive polyglot notebooks, run code snippets, and collaborate with your team.',
        metaKeywords: 'zoho notes login, interactive notebook login, python runner login, code editor sign in',
        canonicalUrl: `${req.protocol}://${req.get('host')}/login`,
        error
    });
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
        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });
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
    const normalizedEmail = email.toLowerCase().trim();
    try {
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            return res.render('forgot', { success: 'If an account exists with that email, a reset link has been sent.' });
        }

        if (user.isGoogleAuth) {
            return res.render('forgot', { error: 'This account uses Google Login. Please use Google to sign in.' });
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

        if (user.isGoogleAuth) {
            return res.render('forgot', { error: 'This account uses Google Login. Password change is not possible.' });
        }

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
    res.render('index', {
        title: 'Zoho Notes',
        metaTitle: 'Zoho Notes',
        metaDescription: 'Interactive web-based polyglot notebook application. Write rich Markdown notes and execute JavaScript, Python, Java, C, and C++ directly in Monaco Editor powered notebook cells.',
        metaKeywords: 'zoho notes, online code runner, polyglot compiler, javascript python java compiler, monaco editor notebook, developer documentation',
        canonicalUrl: `${req.protocol}://${req.get('host')}/`,
        username: res.locals.username,
        isAdmin: req.session.role === 'admin' || (req.user && req.user.role === 'admin'),
        defaultLanguage: res.locals.currentUser?.settings?.defaultLanguage || 'javascript'
    });
});

app.post('/api/feedback', isAuthenticated, async (req, res) => {
    const { message } = req.body;
    try {
        const userId = req.session.userId || (req.user ? req.user._id : null);
        const feedback = new Feedback({ user: userId, message });
        await feedback.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send feedback' });
    }
});


app.get('/api/feedback', isAuthenticated, async (req, res) => {
    // Only admin can see feedback
    const userRole = req.session.role || (req.user ? req.user.role : 'user');
    if (userRole !== 'admin') return res.status(403).json({ error: 'Access denied' });

    try {
        const feedbacks = await Feedback.find().populate('user', 'username email').sort({ createdAt: -1 });
        res.json(feedbacks);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch feedback' });
    }
});

// --- MONITORING & KEEP-ALIVE ---

// Health Check Endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.post('/api/user/settings', isAuthenticated, async (req, res) => {
    const { defaultLanguage } = req.body;
    try {
        const userId = req.session.userId || (req.user ? req.user._id : null);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        await User.findByIdAndUpdate(userId, {
            'settings.defaultLanguage': defaultLanguage
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

app.post('/api/execute', isAuthenticated, async (req, res) => {
    const { code, lang, stdin, args } = req.body;
    try {
        const result = await engine.execute(code, lang, { stdin: stdin || '', args: args || [] });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/notebooks', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId || (req.user ? req.user._id : null);

        // Find notebooks owned by the user
        const ownedNotes = await Note.find({
            owner: userId,
            isTrashed: { $ne: true }
        }, 'id title folder isStarred updatedAt').sort({ updatedAt: -1 }).lean();

        // Find notebooks shared with the user (accepted)
        const sharedNotes = await Note.find({
            'collaborators.user': userId,
            'collaborators.status': 'accepted',
            isTrashed: { $ne: true }
        }, 'id title folder isStarred updatedAt owner').populate('owner', 'username').lean();

        // Combine and mark shared ones
        const allNotes = [
            ...ownedNotes.map(n => ({ ...n, isShared: false })),
            ...sharedNotes.map(n => ({ ...n, isShared: true, ownerName: n.owner?.username }))
        ];

        // Sort by updatedAt
        allNotes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        res.json(allNotes);
    } catch (err) {
        console.error('Notebook list error:', err);
        res.status(500).json({ error: 'Failed to list notebooks' });
    }
});

app.get(/^\/api\/notebooks\/(.+)$/, isAuthenticated, async (req, res) => {
    const notebookId = req.params[0];
    const userId = req.session.userId || (req.user ? req.user._id : null);
    try {
        let query;
        if (req.session.role === 'admin') {
            query = { id: notebookId };
        } else {
            query = {
                id: notebookId,
                $or: [
                    { owner: userId },
                    { 'collaborators': { $elemMatch: { user: userId, status: 'accepted' } } }
                ]
            };
        }
        const note = await Note.findOne(query).lean();
        if (!note) return res.status(404).json({ error: 'Notebook not found or access denied' });
        res.json(note.content || note);
    } catch (err) {
        res.status(500).json({ error: 'Failed to read notebook' });
    }
});

app.post('/api/notebooks', isAuthenticated, async (req, res) => {
    const notebookData = req.body;
    if (!notebookData.id) return res.status(400).json({ error: 'No notebook ID provided' });

    try {
        const userId = req.session.userId || (req.user ? req.user._id : null);
        const updateData = {
            id: notebookData.id,
            title: notebookData.title || 'Untitled',
            isStarred: !!notebookData.isStarred,
            content: notebookData,
            folder: notebookData.folder || 'root',
            updatedAt: new Date()
        };

        const query = {
            id: notebookData.id,
            $or: [
                { owner: userId },
                { 'collaborators': { $elemMatch: { user: userId, status: 'accepted' } } }
            ]
        };

        const note = await Note.findOneAndUpdate(
            query,
            {
                $set: updateData,
                $setOnInsert: { owner: userId }
            },
            { upsert: true, new: true, runValidators: true }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save notebook' });
    }
});

app.get('/api/trash', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId || (req.user ? req.user._id : null);
        const notebooks = await Note.find({ owner: userId, isTrashed: true }, 'id title folder updatedAt');
        const cells = await TrashedCell.find({ owner: userId }).sort({ deletedAt: -1 });

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
        const userId = req.session.userId || (req.user ? req.user._id : null);
        const notebook = await Note.findOne({ id: notebookId, owner: userId });
        if (!notebook) return res.status(404).json({ error: 'Notebook not found' });

        // Save to TrashedCell
        const trashedCell = new TrashedCell({
            ...cell,
            originalNotebookId: notebookId,
            originalNotebookTitle: notebook.title,
            owner: userId
        });
        await trashedCell.save();

        // Remove from Note content
        await Note.updateOne(
            { id: notebookId, owner: userId },
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
        const userId = req.session.userId || (req.user ? req.user._id : null);
        const trashedCell = await TrashedCell.findOne({ id: cellId, owner: userId });
        if (!trashedCell) return res.status(404).json({ error: 'Trashed cell not found' });

        // Check if notebook exists
        const notebook = await Note.findOne({ id: trashedCell.originalNotebookId, owner: userId });
        if (!notebook) return res.status(404).json({ error: 'Original notebook no longer exists' });

        // Move back to notebook
        const cellData = trashedCell.toObject();
        delete cellData._id;
        delete cellData.originalNotebookId;
        delete cellData.originalNotebookTitle;
        delete cellData.deletedAt;
        delete cellData.owner;

        await Note.updateOne(
            { id: trashedCell.originalNotebookId, owner: userId },
            { $push: { 'content.cells': cellData } }
        );

        // Delete from trash
        await TrashedCell.deleteOne({ id: cellId, owner: userId });

        res.json({ success: true, notebookId: trashedCell.originalNotebookId });
    } catch (err) {
        res.status(500).json({ error: 'Failed to restore cell' });
    }
});

// Permanently delete individual cell
app.delete('/api/trash/cell/:id', isAuthenticated, async (req, res) => {
    const cellId = req.params.id;
    try {
        const userId = req.session.userId || (req.user ? req.user._id : null);
        await TrashedCell.deleteOne({ id: cellId, owner: userId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete trashed cell' });
    }
});

app.delete(/^\/api\/notebooks\/(.+)$/, isAuthenticated, async (req, res) => {
    const notebookId = req.params[0];
    try {
        const userId = req.session.userId || (req.user ? req.user._id : null);
        const result = await Note.updateOne(
            { id: notebookId, owner: userId },
            { isTrashed: true, trashedAt: new Date() }
        );
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
        const userId = req.session.userId || (req.user ? req.user._id : null);
        await Note.updateOne({ id: notebookId, owner: userId }, { title, updatedAt: new Date() });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to rename notebook' });
    }
});

// Move Cell between Notebooks
app.post('/api/notebooks/move-cell', isAuthenticated, async (req, res) => {
    const { sourceNotebookId, targetNotebookId, cell } = req.body;
    try {
        const userId = req.session.userId || (req.user ? req.user._id : null);
        // 1. Remove from source
        await Note.updateOne(
            { id: sourceNotebookId, owner: userId },
            { $pull: { 'content.cells': { id: cell.id } } }
        );

        // 2. Add to target
        await Note.updateOne(
            { id: targetNotebookId, owner: userId },
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
        const userId = req.session.userId || (req.user ? req.user._id : null);
        const escapeRegex = (str) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const oldNameEscaped = escapeRegex(oldName);
        
        // Find notes that are in the folder or nested subfolders
        const notes = await Note.find({
            owner: userId,
            folder: { $regex: '^' + oldNameEscaped + '(?:/|$)' }
        });

        // Update each note's folder path by replacing the old folder prefix
        for (const note of notes) {
            let updatedFolder = note.folder;
            if (note.folder === oldName) {
                updatedFolder = newName;
            } else if (note.folder.startsWith(oldName + '/')) {
                updatedFolder = newName + note.folder.slice(oldName.length);
            }
            await Note.updateOne(
                { _id: note._id },
                { folder: updatedFolder, updatedAt: new Date() }
            );
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Rename folder error:', err);
        res.status(500).json({ error: 'Failed to rename folder' });
    }
});

app.delete(/^\/api\/folders\/(.+)$/, isAuthenticated, async (req, res) => {
    const folderName = req.params[0];
    try {
        const userId = req.session.userId || (req.user ? req.user._id : null);
        const escapeRegex = (str) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const folderNameEscaped = escapeRegex(folderName);

        // Move all notes in this folder or any nested subfolders to trash
        await Note.updateMany(
            {
                owner: userId,
                folder: { $regex: '^' + folderNameEscaped + '(?:/|$)' }
            },
            { isTrashed: true, trashedAt: new Date(), updatedAt: new Date() }
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Delete folder error:', err);
        res.status(500).json({ error: 'Failed to delete folder' });
    }
});

app.post(/^\/api\/trash\/restore\/(.+)$/, isAuthenticated, async (req, res) => {
    const notebookId = req.params[0];
    try {
        const userId = req.session.userId || (req.user ? req.user._id : null);
        const result = await Note.updateOne(
            { id: notebookId, owner: userId },
            { isTrashed: false, $unset: { trashedAt: "" } }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to restore notebook' });
    }
});

app.delete(/^\/api\/trash\/(.+)$/, isAuthenticated, async (req, res) => {
    const notebookId = req.params[0];
    try {
        const userId = req.session.userId || (req.user ? req.user._id : null);
        await Note.deleteOne({ id: notebookId, owner: userId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to permanently delete' });
    }
});

// --- SHARING ROUTES ---

app.get('/sharing-notes', isAuthenticated, async (req, res) => {
    res.render('sharingNotes', {
        title: 'Collaborative Shared Notebooks - Zoho Notes',
        metaTitle: 'Collaborative Shared Notebooks - Zoho Notes',
        metaDescription: 'Collaborate and share interactive notebooks with team members on Zoho Notes.',
        canonicalUrl: `${req.protocol}://${req.get('host')}/sharing-notes`
    });
});

app.post('/api/share/invite', isAuthenticated, async (req, res) => {
    const { email, notebookId } = req.body;
    const currentUserId = req.session.userId || (req.user ? req.user._id : null);

    try {
        const targetUser = await User.findOne({ email });
        if (!targetUser) return res.status(404).json({ error: 'User not found' });
        if (targetUser._id.equals(currentUserId)) {
            return res.status(400).json({ error: 'You cannot share with yourself' });
        }

        const notebook = await Note.findOne({ id: notebookId, owner: currentUserId });
        if (!notebook) return res.status(404).json({ error: 'Notebook not found or not owned by you' });

        // Check if already shared
        const alreadyShared = notebook.collaborators.find(c => c.user && c.user.equals(targetUser._id));
        if (alreadyShared) {
            return res.status(400).json({ error: 'Notebook already shared with this user' });
        }

        notebook.collaborators.push({
            user: targetUser._id,
            email: targetUser.email,
            status: 'pending'
        });

        await notebook.save();
        res.json({ success: true, message: 'Invite sent successfully!' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send invite' });
    }
});

app.get('/api/share/invites', isAuthenticated, async (req, res) => {
    const currentUserId = req.session.userId || (req.user ? req.user._id : null);
    try {
        // Find notebooks where I am a pending collaborator
        const notebooks = await Note.find({
            'collaborators.user': currentUserId,
            'collaborators.status': 'pending'
        }, 'id title owner').populate('owner', 'username email');

        res.json(notebooks.map(nb => ({
            notebookId: nb.id,
            title: nb.title,
            ownerName: nb.owner?.username,
            ownerEmail: nb.owner?.email
        })));
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch invites' });
    }
});

app.get('/api/share/my-shared', isAuthenticated, async (req, res) => {
    const currentUserId = req.session.userId || (req.user ? req.user._id : null);
    try {
        const notebooks = await Note.find({
            owner: currentUserId,
            'collaborators.0': { $exists: true }
        }, 'id title collaborators');

        res.json(notebooks);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch shared notebooks' });
    }
});

app.post('/api/share/respond', isAuthenticated, async (req, res) => {
    const { notebookId, response } = req.body; // response: 'accepted' or 'declined'
    const currentUserId = req.session.userId || (req.user ? req.user._id : null);

    try {
        const notebook = await Note.findOne({ id: notebookId, 'collaborators.user': currentUserId });
        if (!notebook) return res.status(404).json({ error: 'Invitation not found' });

        if (response === 'accepted') {
            await Note.updateOne(
                { id: notebookId, 'collaborators.user': currentUserId },
                {
                    $set: {
                        'collaborators.$.status': 'accepted',
                        'collaborators.$.joinedAt': new Date()
                    }
                }
            );
        } else {
            await Note.updateOne(
                { id: notebookId },
                { $pull: { collaborators: { user: currentUserId } } }
            );
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to respond to invitation' });
    }
});

app.delete('/api/trash-all', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId || (req.user ? req.user._id : null);
        await Note.deleteMany({ owner: userId, isTrashed: true });
        await TrashedCell.deleteMany({ owner: userId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to empty trash' });
    }
});

// --- BACKGROUND CRON JOBS ---

// Run every 10 minutes
cron.schedule('*/10 * * * *', async () => {
    try {
        // 0. Check if logging is paused
        const config = await SystemConfig.findOne({ key: 'isLoggingPaused' }).lean();
        if (config && config.value === true) {
            console.log('[Cron] System logging is currently paused.');
            return;
        }

        // 1. Cleanup expired password reset tokens
        const result = await User.updateMany(
            { resetPasswordExpires: { $lt: Date.now() } },
            { $unset: { resetPasswordToken: 1, resetPasswordExpires: 1 } }
        );

        let maintenanceMsg = "System maintenance completed.";
        if (result.modifiedCount > 0) {
            maintenanceMsg += ` Cleaned up ${result.modifiedCount} expired reset tokens.`;
        }

        // 2. System Heartbeat
        const userCount = await User.countDocuments({ role: { $ne: 'admin' } });
        const noteCount = await Note.countDocuments();
        const feedbackCount = await Feedback.countDocuments();

        const mem = process.memoryUsage();
        const memMsg = `Memory: RSS=${(mem.rss / 1024 / 1024).toFixed(2)}MB, Heap=${(mem.heapUsed / 1024 / 1024).toFixed(2)}/${(mem.heapTotal / 1024 / 1024).toFixed(2)}MB`;

        await SystemLog.create({
            type: 'info',
            message: `${maintenanceMsg} System Status: ${userCount} Users, ${noteCount} Notes, ${feedbackCount} Feedbacks. ${memMsg}`
        });
        console.log(`[Cron] Maintenance: ${maintenanceMsg} (${memMsg})`);
    } catch (err) {
        console.error('[Cron] Maintenance Error:', err);
        await SystemLog.create({
            type: 'error',
            message: `Background Maintenance Error: ${err.message}`
        });
    }
});

// =====================================================
// WebSocket Interactive Terminal Server
// =====================================================
const wss = new WebSocketServer({ server, path: '/ws/terminal' });

wss.on('connection', (ws) => {
    let child = null;
    let prepared = null;
    let killTimer = null;
    const INTERACTIVE_TIMEOUT = 30000; // 30 seconds max per session

    const resetTimer = () => {
        if (killTimer) clearTimeout(killTimer);
        killTimer = setTimeout(() => {
            if (child) {
                try { child.kill('SIGKILL'); } catch (e) { }
            }
            try {
                ws.send(JSON.stringify({ type: 'stderr', data: '\n[Process timed out after 30 seconds]' }));
                ws.send(JSON.stringify({ type: 'exit', code: -1 }));
            } catch (e) { }
            ws.close();
        }, INTERACTIVE_TIMEOUT);
    };

    ws.on('message', async (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        } catch (e) {
            return;
        }

        if (msg.type === 'start' && !child) {
            const { code, lang } = msg;
            if (!code || !lang) {
                ws.send(JSON.stringify({ type: 'error', data: 'Missing code or lang' }));
                ws.close();
                return;
            }

            // Compile / prepare the binary
            ws.send(JSON.stringify({ type: 'status', data: 'Compiling...' }));
            try {
                prepared = await engine.prepareExecution(code, lang);
            } catch (err) {
                ws.send(JSON.stringify({ type: 'error', data: `Preparation failed: ${err.message}` }));
                ws.close();
                return;
            }

            if (prepared.error) {
                ws.send(JSON.stringify({ type: 'error', data: prepared.error }));
                ws.close();
                return;
            }

            // Spawn the process with stdin pipe open
            resetTimer();
            child = spawnProcess(prepared.binaryPath, prepared.args, {
                windowsHide: true,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            child.stdout.on('data', (data) => {
                try {
                    ws.send(JSON.stringify({ type: 'stdout', data: data.toString() }));
                } catch (e) { }
            });

            child.stderr.on('data', (data) => {
                try {
                    ws.send(JSON.stringify({ type: 'stderr', data: data.toString() }));
                } catch (e) { }
            });

            child.on('error', (err) => {
                if (killTimer) clearTimeout(killTimer);
                try {
                    ws.send(JSON.stringify({ type: 'error', data: err.message }));
                    ws.send(JSON.stringify({ type: 'exit', code: -1 }));
                } catch (e) { }
                engine.cleanupExecution(prepared);
            });

            child.on('close', (exitCode) => {
                if (killTimer) clearTimeout(killTimer);
                try {
                    ws.send(JSON.stringify({ type: 'exit', code: exitCode || 0 }));
                } catch (e) { }
                if (prepared) engine.cleanupExecution(prepared);
                child = null;
            });

            ws.send(JSON.stringify({ type: 'status', data: 'Running...' }));

        } else if (msg.type === 'stdin' && child && child.stdin && !child.stdin.destroyed) {
            // Forward user input to the running process
            resetTimer();
            try {
                child.stdin.write(msg.data + '\n');
            } catch (e) { }

        } else if (msg.type === 'kill' && child) {
            try { child.kill('SIGKILL'); } catch (e) { }
        }
    });

    ws.on('close', () => {
        if (killTimer) clearTimeout(killTimer);
        if (child) {
            try { child.kill('SIGKILL'); } catch (e) { }
        }
        if (prepared) {
            engine.cleanupExecution(prepared);
            prepared = null;
        }
    });

    ws.on('error', () => {
        if (killTimer) clearTimeout(killTimer);
        if (child) {
            try { child.kill('SIGKILL'); } catch (e) { }
        }
        if (prepared) {
            engine.cleanupExecution(prepared);
            prepared = null;
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server on http://localhost:${PORT}`);
});
