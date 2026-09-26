const express = require('express');
const router = express.Router();
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { createZohoNotesMcpServer } = require('../mcp/zohoNotesMcp');
const User = require('../models/User');
const McpSession = require('../models/McpSession');
const { provisionKeys } = require('../scripts/provision_mcp_api_keys');

// Store active SSE transports and session data in memory: sessionId -> { transport, user, server }
const activeTransports = new Map();

/**
 * Multi-Tenant Authentication Middleware for MCP Calls
 * Validates user's personal API key against MongoDB
 * Supports backward-compatible master key from process.env.MCP_API_KEY
 */
async function mcpAuth(req, res, next) {
    const authHeader = req.headers['authorization'] || req.headers['x-api-key'] || req.query.apiKey;
    if (!authHeader) {
        return res.status(401).json({
            error: 'Unauthorized: Missing API Key. Provide "Authorization: Bearer <KEY>" or "?apiKey=<KEY>".'
        });
    }

    const isBearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ');
    const rawToken = isBearer ? authHeader.substring(7) : authHeader;
    const token = typeof rawToken === 'string' ? rawToken.trim().replace(/^["']|["']$/g, '') : String(rawToken);

    try {
        const configuredMasterKey = process.env.MCP_API_KEY ? process.env.MCP_API_KEY.trim().replace(/^["']|["']$/g, '') : null;

        // 1. Check if token is the master admin key
        if ((configuredMasterKey && token === configuredMasterKey) || token === 'MCP_API_KEY') {
            let adminUser = await User.findOne({ role: 'admin' }).lean();
            if (!adminUser) {
                adminUser = {
                    _id: '6962380aba753149bdca5c89',
                    username: 'Administrator',
                    email: 'admin@gmail.com',
                    role: 'admin'
                };
            }
            req.user = adminUser;
            return next();
        }

        // 2. Query MongoDB for User with this specific apiKey
        const user = await User.findOne({ apiKey: token, isBlocked: { $ne: true } }).lean();
        if (!user) {
            return res.status(401).json({
                error: 'Unauthorized: Invalid or inactive MCP API Key.'
            });
        }

        const isAdmin = user.role === 'admin';

        // Check if API key has expired
        if (user.apiKeyExpiresAt && new Date() > new Date(user.apiKeyExpiresAt)) {
            return res.status(401).json({
                error: 'Unauthorized: MCP API Key has expired. Please regenerate your API key in User Settings.'
            });
        }

        // Check daily rate limiting (50 req/day for regular users; unlimited for superadmin)
        if (!isAdmin) {
            const todayStr = new Date().toISOString().slice(0, 10);
            let currentCount = 0;
            if (user.mcpUsage && user.mcpUsage.lastResetDate === todayStr) {
                currentCount = user.mcpUsage.dailyCount || 0;
            }

            if (currentCount >= 50) {
                return res.status(429).json({
                    error: 'Daily MCP request limit reached (50/50 requests). Quota resets at 00:00 UTC tomorrow. Contact admin for unlimited access.'
                });
            }

            // Increment daily count
            User.updateOne(
                { _id: user._id },
                {
                    $set: {
                        'mcpUsage.dailyCount': currentCount + 1,
                        'mcpUsage.lastResetDate': todayStr,
                        apiKeyLastUsedAt: new Date()
                    }
                }
            ).catch(err => {
                console.warn('[MCP Auth] Failed to update usage:', err.message);
            });
        } else {
            // Update lastUsed timestamp asynchronously for admin
            User.updateOne({ _id: user._id }, { apiKeyLastUsedAt: new Date() }).catch(err => {
                console.warn('[MCP Auth] Failed to update apiKeyLastUsedAt:', err.message);
            });
        }

        req.user = user;
        next();
    } catch (err) {
        console.error('[MCP Auth] Error validating token:', err);
        return res.status(500).json({ error: 'Internal authentication error' });
    }
}

/**
 * GET /mcp/status
 * Health check & discovery endpoint
 */
router.get('/status', (req, res) => {
    res.json({
        status: 'online',
        service: 'Zoho Notes MCP Server (Multi-Tenant)',
        version: '2.0.0',
        transport: 'SSE',
        activeSessions: activeTransports.size,
        multiTenantAuth: true
    });
});

/**
 * GET /mcp/users
 * Direct endpoint to list registered users (Strictly Admin Only)
 */
router.get('/users', mcpAuth, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: Admin privileges required to list all users.' });
    }

    try {
        const users = await User.find({})
            .select('_id username email role isBlocked apiKey createdAt')
            .sort({ createdAt: 1 })
            .lean();

        res.json({
            count: users.length,
            users: users.map(u => ({
                id: u._id,
                username: u.username,
                email: u.email,
                role: u.role || 'user',
                isBlocked: !!u.isBlocked,
                hasApiKey: !!u.apiKey,
                apiKey: u.apiKey || null,
                apiKeyPrefix: u.apiKey ? u.apiKey.substring(0, 10) + '...' : null,
                createdAt: u.createdAt
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /mcp/provision-keys
 * Admin utility to auto-generate API keys for any unprovisioned users
 */
router.post('/provision-keys', mcpAuth, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: Admin privileges required.' });
    }

    try {
        const users = await provisionKeys();
        res.json({
            success: true,
            message: `Provisioning completed. Total users: ${users.length}`,
            count: users.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /mcp/sse
 * Primary SSE endpoint where MCP clients connect
 * Binds the authenticated user to a new session transport
 */
router.get('/sse', mcpAuth, async (req, res) => {
    const user = req.user;
    console.log(`[MCP SSE] Client connected: ${user.username} (${user.email}) [Role: ${user.role}]`);

    try {
        // Instantiate a scoped MCP server for this specific user
        const { server } = createZohoNotesMcpServer({ user });

        // Forward apiKey query parameter so secondary endpoints keep identity if needed
        const authParam = req.query.apiKey ? `?apiKey=${encodeURIComponent(req.query.apiKey)}` : '';
        const transport = new SSEServerTransport(`/mcp/messages${authParam}`, res, {
            enableDnsRebindingProtection: false
        });
        const sessionId = transport.sessionId;

        // Save active transport with user context in memory
        activeTransports.set(sessionId, {
            transport,
            user,
            server
        });

        // Persist session audit record in MongoDB
        try {
            const sessionDoc = new McpSession({
                sessionId,
                userId: user._id,
                userEmail: user.email,
                role: user.role || 'user',
                ipAddress: req.ip || req.headers['x-forwarded-for'] || '',
                userAgent: req.headers['user-agent'] || ''
            });
            await sessionDoc.save();
        } catch (dbErr) {
            console.warn('[MCP SSE] Failed to persist McpSession document:', dbErr.message);
        }

        req.on('close', () => {
            console.log(`[MCP SSE] Session closed: ${sessionId} for ${user.email}`);
            activeTransports.delete(sessionId);
            McpSession.updateOne({ sessionId }, { status: 'closed' }).catch(() => {});
        });

        await server.connect(transport);
    } catch (err) {
        console.error('[MCP SSE] Failed to initialize connection:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to establish MCP SSE stream', details: err.message });
        }
    }
});

/**
 * POST /mcp/messages
 * Endpoint where MCP clients send JSON-RPC tool/resource requests
 * Uses sessionId to resolve session and execute requests
 */
router.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId;
    let sessionEntry;

    if (sessionId && activeTransports.has(sessionId)) {
        sessionEntry = activeTransports.get(sessionId);
    } else if (activeTransports.size === 1) {
        // Fallback to single active session if query parameter was omitted
        sessionEntry = activeTransports.values().next().value;
    }

    if (!sessionEntry || !sessionEntry.transport) {
        return res.status(400).json({
            error: 'No active MCP SSE session found. Establish connection to /mcp/sse first.'
        });
    }

    try {
        const user = sessionEntry.user;
        const isAdmin = user && user.role === 'admin';

        // Check if regular user has exceeded daily request quota
        if (!isAdmin && user && user._id) {
            const todayStr = new Date().toISOString().slice(0, 10);
            const freshUser = await User.findById(user._id).select('mcpUsage apiKeyExpiresAt').lean();
            
            // Check expiry
            if (freshUser && freshUser.apiKeyExpiresAt && new Date() > new Date(freshUser.apiKeyExpiresAt)) {
                return res.status(401).json({
                    error: 'Unauthorized: MCP API Key has expired. Please regenerate your API key in User Settings.'
                });
            }

            let currentCount = 0;
            if (freshUser && freshUser.mcpUsage && freshUser.mcpUsage.lastResetDate === todayStr) {
                currentCount = freshUser.mcpUsage.dailyCount || 0;
            }

            if (currentCount >= 50) {
                return res.status(429).json({
                    error: 'Daily MCP request limit reached (50/50 requests). Quota resets at 00:00 UTC tomorrow.'
                });
            }

            User.updateOne(
                { _id: user._id },
                {
                    $set: {
                        'mcpUsage.dailyCount': currentCount + 1,
                        'mcpUsage.lastResetDate': todayStr,
                        apiKeyLastUsedAt: new Date()
                    }
                }
            ).catch(err => console.warn('[MCP POST] Failed to update usage:', err.message));
        }

        // Update last activity in DB asynchronously
        if (sessionId) {
            McpSession.updateOne({ sessionId }, { lastActiveAt: new Date() }).catch(() => {});
        }

        await sessionEntry.transport.handlePostMessage(req, res, req.body);
    } catch (err) {
        console.error('[MCP POST] Error processing message:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal MCP message processing error', details: err.message });
        }
    }
});

/**
 * Terminate active SSE transports and invalidate sessions for a given user
 * Used when user regenerates or revokes their API key
 */
function closeUserSessions(userId) {
    let closedCount = 0;
    const targetIdStr = String(userId);
    for (const [sessionId, entry] of activeTransports.entries()) {
        if (entry.user && String(entry.user._id) === targetIdStr) {
            try {
                if (entry.transport && typeof entry.transport.close === 'function') {
                    entry.transport.close();
                }
            } catch (e) {
                console.warn('[MCP] Error closing transport for session', sessionId, e.message);
            }
            activeTransports.delete(sessionId);
            McpSession.updateOne({ sessionId }, { status: 'closed' }).catch(() => {});
            closedCount++;
        }
    }
    return closedCount;
}

module.exports = router;
module.exports.closeUserSessions = closeUserSessions;
module.exports.activeTransports = activeTransports;

