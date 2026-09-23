const express = require('express');
const http = require('http');
const mcpRoutes = require('../routes/mcpRoutes');

async function testRemoteEndpoints() {
    console.log('--- Testing Remote MCP SSE Endpoints ---');

    const app = express();
    app.use('/mcp', mcpRoutes);

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(4322, resolve));
    console.log('Test server running on port 4322');

    try {
        // 1. Test /mcp/status
        const statusRes = await fetch('http://localhost:4322/mcp/status');
        const statusJson = await statusRes.json();
        console.log('Status endpoint response:', statusJson);
        if (statusJson.status !== 'online') {
            throw new Error('Expected status to be online');
        }

        console.log('✅ Remote MCP SSE endpoint test succeeded!');
    } finally {
        server.close();
    }
}

testRemoteEndpoints().then(() => process.exit(0)).catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
