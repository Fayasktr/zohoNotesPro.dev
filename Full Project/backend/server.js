const http = require('http');
const app = require('./app');
const env = require('./src/config/env');
const { connectDB, disconnectDB } = require('./src/config/db');
const { initTerminalWebSocket } = require('./src/websocket/terminal.ws');
const cronService = require('./src/services/cron.service');

const server = http.createServer(app);

// Configure keep-alive timeouts to prevent idle connection resets from reverse proxies / Vite
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// Initialize Interactive Terminal WebSocket Gateway
initTerminalWebSocket(server);

async function startServer() {
    try {
        // 1. Connect to Database
        await connectDB();

        // 2. Start Scheduled Maintenance Jobs
        cronService.start();

        // 3. Listen on configured port
        server.listen(env.PORT, '0.0.0.0', () => {
            console.log(`====================================================`);
            console.log(`🚀 Zoho Notes Pro Backend (MVCS v2.0) Active`);
            console.log(`📡 HTTP Server: http://localhost:${env.PORT}`);
            console.log(`⚡ WebSocket:   ws://localhost:${env.PORT}/ws/terminal`);
            console.log(`🌐 Environment: ${env.NODE_ENV}`);
            console.log(`====================================================`);
        });
    } catch (err) {
        console.error('Fatal startup error:', err);
        process.exit(1);
    }
}

// Graceful Shutdown Handler
async function handleShutdown(signal) {
    console.log(`\n[Server] Received ${signal}. Initiating graceful shutdown...`);
    cronService.stop();

    server.close(async () => {
        console.log('[Server] HTTP/WS server closed.');
        await disconnectDB();
        console.log('[Server] Graceful shutdown completed.');
        process.exit(0);
    });

    // Force shutdown if hung
    setTimeout(() => {
        console.error('[Server] Forced shutdown after timeout.');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

if (require.main === module) {
    startServer();
}

module.exports = { server, app, startServer };
