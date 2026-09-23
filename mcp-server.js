#!/usr/bin/env node
/**
 * Zoho Notes MCP Server - Local stdio entry point
 * 
 * Used by Antigravity, Claude Desktop, Cursor, and other local MCP clients.
 * In stdio mode, process.stdout is reserved strictly for JSON-RPC messages.
 * Any logging MUST go to stderr (console.error).
 */

require('dotenv').config();
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { createZohoNotesMcpServer } = require('./mcp/zohoNotesMcp');

async function main() {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/zoho';
    console.error(`[Zoho Notes MCP] Starting stdio server...`);
    console.error(`[Zoho Notes MCP] Target MongoDB: ${mongoUri.replace(/:([^@]+)@/, ':****@')}`);

    const { server, connectToDatabase } = createZohoNotesMcpServer({
        mongoUri: mongoUri
    });

    try {
        await connectToDatabase(mongoUri);
        console.error('[Zoho Notes MCP] Connected to MongoDB.');
    } catch (dbErr) {
        console.error('[Zoho Notes MCP] MongoDB connection warning:', dbErr.message);
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[Zoho Notes MCP] Server ready on stdio transport.');
}

main().catch((err) => {
    console.error('[Zoho Notes MCP] Fatal startup error:', err);
    process.exit(1);
});
