const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { encrypt, maskApiKey } = require('../services/encryptionService');
const { streamGeminiChat } = require('../services/geminiAgentService');

/**
 * Authentication Gate: Requires logged-in active user.
 * Each user brings their own Gemini API Key (BYOK) and only accesses their own scoped notes
 * (while Admin / Fayas KP retain full admin tools).
 */
const requireAuthenticatedUser = async (req, res, next) => {
    const userId = (req.session && req.session.userId) || (req.user && req.user._id);
    if (!userId) {
        return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    try {
        const user = await User.findById(userId).lean();
        if (!user) {
            return res.status(401).json({ error: 'User not found.' });
        }
        if (user.isBlocked) {
            return res.status(403).json({ error: 'Your account has been restricted.' });
        }

        req.user = user;
        next();
    } catch (err) {
        return res.status(500).json({ error: 'Internal authorization error' });
    }
};

router.use(requireAuthenticatedUser);

/**
 * GET /api/ai/status
 * Check user's AI Copilot toggle state and whether they have added their own Gemini API key
 */
router.get('/status', (req, res) => {
    const user = req.user;
    const hasKey = Boolean(user.geminiApiKey && user.geminiApiKey.encrypted);
    const enabled = Boolean(user.settings && user.settings.aiCopilotEnabled);
    const masked = hasKey ? (user.geminiKeyMasked || '••••••••') : null;

    res.json({
        enabled,
        hasKey,
        maskedKey: masked,
        model: 'gemini-3.5-flash (BYOK)',
        updatedAt: user.geminiKeyUpdatedAt || null
    });
});

/**
 * POST /api/ai/toggle
 * Turn the AI Copilot UI button ON or OFF in User Settings
 */
router.post('/toggle', async (req, res) => {
    const enabled = Boolean(req.body.enabled);
    try {
        await User.updateOne(
            { _id: req.user._id },
            { $set: { 'settings.aiCopilotEnabled': enabled } }
        );
        const hasKey = Boolean(req.user.geminiApiKey && req.user.geminiApiKey.encrypted);
        res.json({
            success: true,
            enabled,
            hasKey,
            message: enabled
                ? (hasKey ? 'AI Copilot enabled in workspace.' : 'AI Copilot enabled. Please add your Gemini API key to start chatting.')
                : 'AI Copilot hidden from workspace.'
        });
    } catch (err) {
        res.status(500).json({ error: `Failed to update setting: ${err.message}` });
    }
});

/**
 * POST /api/ai/key
 * Securely encrypt and save user's personal Gemini API key (BYOK)
 */
router.post('/key', async (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 15) {
        return res.status(400).json({ error: 'Please provide a valid Google Gemini API key.' });
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
                    geminiKeyUpdatedAt: new Date(),
                    'settings.aiCopilotEnabled': true
                }
            }
        );

        res.json({
            success: true,
            enabled: true,
            hasKey: true,
            message: 'Your Gemini API key has been encrypted and saved! Gemini Chat is now active.',
            maskedKey: masked
        });
    } catch (err) {
        res.status(500).json({ error: `Failed to save API key: ${err.message}` });
    }
});

/**
 * DELETE /api/ai/key
 * Remove user's saved Gemini API key
 */
router.delete('/key', async (req, res) => {
    try {
        await User.updateOne(
            { _id: req.user._id },
            {
                $unset: {
                    geminiApiKey: 1,
                    geminiKeyMasked: 1,
                    geminiKeyUpdatedAt: 1
                }
            }
        );
        res.json({
            success: true,
            hasKey: false,
            maskedKey: null,
            message: 'Gemini API key removed.'
        });
    } catch (err) {
        res.status(500).json({ error: `Failed to remove API key: ${err.message}` });
    }
});

/**
 * POST /api/ai/chat
 * Live Server-Sent Events (SSE) streaming chat endpoint.
 * Strictly works ONLY when the user has added their own API key.
 */
router.post('/chat', async (req, res) => {
    const { message, history } = req.body;

    // Strict BYOK Check: User MUST have added their own Gemini API Key
    const hasOwnKey = Boolean(req.user.geminiApiKey && req.user.geminiApiKey.encrypted);
    if (!hasOwnKey) {
        return res.status(403).json({
            error: 'Please add your own Gemini API key in Settings to use Gemini Chat.',
            code: 'API_KEY_REQUIRED'
        });
    }

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
        sendEvent('error', { error: err.message, code: err.code || 'STREAM_ERROR' });
        res.end();
    }
});

module.exports = router;
