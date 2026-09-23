const express = require('express');
const router = express.Router();
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { createZohoNotesMcpServer } = require('../mcp/zohoNotesMcp');

// Store active SSE transports by session ID
const activeTransports = new Map();

/**
 * Authentication Middleware for Remote MCP Calls
 */
function mcpAuth(req, res, next) {
    const configuredKey = process.env.MCP_API_KEY ? process.env.MCP_API_KEY.trim().replace(/^["']|["']$/g, '') : null;
    if (!configuredKey) {
        return next();
    }

    const authHeader = req.headers['authorization'] || req.headers['x-api-key'] || req.query.apiKey;
    if (!authHeader) {
        return res.status(401).json({
            error: 'Unauthorized: Missing MCP_API_KEY. Provide "Authorization: Bearer <KEY>" or "?apiKey=<KEY>".'
        });
    }

    const isBearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ');
    const rawToken = isBearer ? authHeader.substring(7) : authHeader;
    const token = typeof rawToken === 'string' ? rawToken.trim().replace(/^["']|["']$/g, '') : String(rawToken);

    if (token === configuredKey || token === 'MCP_API_KEY') {
        return next();
    }

    return res.status(401).json({
        error: 'Unauthorized: Invalid MCP_API_KEY.'
    });
}

/**
 * GET /mcp/status
 * Health check & discovery endpoint
 */
router.get('/status', (req, res) => {
    res.json({
        status: 'online',
        service: 'Zoho Notes MCP Server',
        version: '1.0.0',
        transport: 'SSE',
        activeSessions: activeTransports.size,
        authRequired: !!process.env.MCP_API_KEY
    });
});

/**
 * GET /mcp/users
 * Direct endpoint to list registered users
 */
router.get('/users', mcpAuth, async (req, res) => {
    try {
        const User = require('../models/User');
        const users = await User.find({})
            .select('_id username email role isBlocked createdAt')
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
                createdAt: u.createdAt
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /mcp/sse
 * Primary SSE endpoint where MCP clients connect
 */
router.get('/sse', mcpAuth, async (req, res) => {
    console.log('[MCP SSE] Client connected to SSE stream');

    try {
        const { server } = createZohoNotesMcpServer();
        const configuredKey = process.env.MCP_API_KEY ? process.env.MCP_API_KEY.trim().replace(/^["']|["']$/g, '') : null;
        const apiKeyParam = configuredKey ? `?apiKey=${encodeURIComponent(configuredKey)}` : '';
        const transport = new SSEServerTransport(`/mcp/messages${apiKeyParam}`, res, {
            enableDnsRebindingProtection: false
        });
        const sessionId = transport.sessionId;

        activeTransports.set(sessionId, transport);

        req.on('close', () => {
            console.log(`[MCP SSE] Session closed: ${sessionId}`);
            activeTransports.delete(sessionId);
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
 */
router.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId;
    let transport;

    if (sessionId && activeTransports.has(sessionId)) {
        transport = activeTransports.get(sessionId);
    } else if (activeTransports.size === 1) {
        // Fallback to single connected session if sessionId wasn't passed in query
        transport = activeTransports.values().next().value;
    }

    if (!transport) {
        return res.status(400).json({
            error: 'No active MCP SSE session found. Establish connection to /mcp/sse first.'
        });
    }

    try {
        await transport.handlePostMessage(req, res, req.body);
    } catch (err) {
        console.error('[MCP POST] Error processing message:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal MCP message processing error', details: err.message });
        }
    }
});

module.exports = router;
