const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { encrypt, maskApiKey, decrypt } = require('../services/encryptionService');
const { streamGeminiChat } = require('../services/geminiAgentService');

/**
 * Access Gate: Strictly Admin & Fayas KP only
 */
const isAuthorizedAiUser = async (req, res, next) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    try {
        const user = await User.findById(req.session.userId).lean();
        if (!user) {
            return res.status(401).json({ error: 'User not found.' });
        }

        const isSuper = user.role === 'admin' || (user.email && user.email.toLowerCase() === 'fayaskpktr@gmail.com');
        if (!isSuper) {
            return res.status(403).json({ error: 'Forbidden: Zoho Notes Pro AI is strictly reserved for Admin and Fayas KP.' });
        }

        req.user = user;
        next();
    } catch (err) {
        return res.status(500).json({ error: 'Internal authorization error' });
    }
};

router.use(isAuthorizedAiUser);

/**
 * GET /api/ai/status
 * Check current AI assistant status and configured key
 */
router.get('/status', (req, res) => {
    const user = req.user;
    const hasKey = !!(user.geminiApiKey && user.geminiApiKey.encrypted) || !!process.env.GEMINI_API_KEY;
    const masked = user.geminiKeyMasked || (process.env.GEMINI_API_KEY ? maskApiKey(process.env.GEMINI_API_KEY) : null);

    res.json({
        enabled: true,
        hasKey,
        maskedKey: masked,
        model: 'gemini-flash-latest (1,500 RPD / 15 RPM Free Tier)',
        updatedAt: user.geminiKeyUpdatedAt || null
    });
});

/**
 * POST /api/ai/key
 * Securely encrypt and save user's Gemini API key (BYOK)
 */
router.post('/key', async (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 15) {
        return res.status(400).json({ error: 'Please provide a valid Gemini API key.' });
    }

    try {
        const cleanKey = apiKey.trim();
        const encrypted = encrypt(cleanKey);
        const masked = maskApiKey(cleanKey);

        await User.updateOne(
            { _id: req.user._id },
            {
                $set: {
                    geminiApiKey: encrypted,
                    geminiKeyMasked: masked,
                    geminiKeyUpdatedAt: new Date()
                }
            }
        );

        res.json({
            success: true,
            message: 'Gemini API key encrypted and saved securely.',
            maskedKey: masked
        });
    } catch (err) {
        res.status(500).json({ error: `Failed to save API key: ${err.message}` });
    }
});

/**
 * POST /api/ai/chat
 * Live Server-Sent Events (SSE) streaming chat endpoint
 */
router.post('/chat', async (req, res) => {
    const { message, history } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'Message text is required.' });
    }

    // Set headers for Server-Sent Events
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });

    const sendEvent = (event, payload) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    try {
        const fullOutput = await streamGeminiChat({
            user: req.user,
            message: message.trim(),
            history: Array.isArray(history) ? history : [],
            onToolCall: (call) => {
                sendEvent('tool_start', { name: call.name, args: call.args });
            },
            onToolResult: (toolRes) => {
                sendEvent('tool_end', { name: toolRes.name, summary: toolRes.result?.count !== undefined ? `${toolRes.result.count} items found` : 'Executed' });
            },
            onDelta: (chunk) => {
                sendEvent('delta', { text: chunk });
            }
        });

        sendEvent('done', { fullText: fullOutput });
        res.end();
    } catch (err) {
        console.error('[AI Chat] Error during agent stream:', err);
        sendEvent('error', { error: err.message });
        res.end();
    }
});

module.exports = router;
