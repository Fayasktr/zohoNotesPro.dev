const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
const executionService = require('../services/execution.service');
const env = require('../config/env');

/**
 * Initialize Interactive WebSocket Terminal Server
 * @param {import('http').Server} server HTTP server instance
 */
function initTerminalWebSocket(server) {
    const wss = new WebSocketServer({ server, path: '/ws/terminal' });

    wss.on('connection', (ws) => {
        let child = null;
        let prepared = null;
        let killTimer = null;
        const TIMEOUT_MS = env.LIMITS.WS_INTERACTIVE_TIMEOUT_MS;

        const resetTimer = () => {
            if (killTimer) clearTimeout(killTimer);
            killTimer = setTimeout(() => {
                if (child) {
                    try { child.kill('SIGKILL'); } catch (e) { }
                }
                safeSend(ws, { type: 'stderr', data: '\n[Process timed out: maximum interactive session reached]' });
                safeSend(ws, { type: 'exit', code: -1 });
                ws.close();
            }, TIMEOUT_MS);
        };

        const cleanup = () => {
            if (killTimer) clearTimeout(killTimer);
            if (child) {
                try { child.kill('SIGKILL'); } catch (e) { }
                child = null;
            }
            if (prepared) {
                executionService.cleanupExecution(prepared);
                prepared = null;
            }
        };

        ws.on('message', async (raw) => {
            let msg;
            try {
                msg = JSON.parse(raw.toString());
            } catch (e) {
                return;
            }

            // 1. Start execution session
            if (msg.type === 'start' && !child) {
                const { code, lang } = msg;
                if (!code || !lang) {
                    safeSend(ws, { type: 'error', data: 'Missing code or lang parameter' });
                    ws.close();
                    return;
                }

                safeSend(ws, { type: 'status', data: 'Compiling & preparing environment...' });

                try {
                    prepared = await executionService.prepareExecution(code, lang);
                } catch (err) {
                    safeSend(ws, { type: 'error', data: `Preparation error: ${err.message}` });
                    ws.close();
                    return;
                }

                resetTimer();

                try {
                    child = spawn(prepared.binaryPath, prepared.args, {
                        windowsHide: true,
                        stdio: ['pipe', 'pipe', 'pipe']
                    });
                } catch (spawnErr) {
                    safeSend(ws, { type: 'error', data: `Failed to spawn process: ${spawnErr.message}` });
                    cleanup();
                    return;
                }

                child.stdout?.on('data', (data) => {
                    safeSend(ws, { type: 'stdout', data: data.toString() });
                });

                child.stderr?.on('data', (data) => {
                    safeSend(ws, { type: 'stderr', data: data.toString() });
                });

                child.on('error', (err) => {
                    safeSend(ws, { type: 'error', data: `Runtime error: ${err.message}` });
                    cleanup();
                });

                child.on('close', (exitCode) => {
                    safeSend(ws, { type: 'exit', code: exitCode !== null ? exitCode : 0 });
                    cleanup();
                });

                safeSend(ws, { type: 'status', data: 'Running...' });

            // 2. Start general interactive shell session
            } else if (msg.type === 'shell' && !child) {
                const shellCmd = process.platform === 'win32'
                    ? (process.env.COMSPEC || 'powershell.exe')
                    : (process.env.SHELL || 'bash');

                safeSend(ws, { type: 'status', data: `Shell started (${shellCmd})` });
                resetTimer();

                try {
                    child = spawn(shellCmd, [], {
                        windowsHide: true,
                        stdio: ['pipe', 'pipe', 'pipe']
                    });
                } catch (spawnErr) {
                    safeSend(ws, { type: 'error', data: `Failed to spawn shell: ${spawnErr.message}` });
                    cleanup();
                    return;
                }

                child.stdout?.on('data', (data) => {
                    safeSend(ws, { type: 'stdout', data: data.toString() });
                });

                child.stderr?.on('data', (data) => {
                    safeSend(ws, { type: 'stderr', data: data.toString() });
                });

                child.on('error', (err) => {
                    safeSend(ws, { type: 'error', data: `Runtime error: ${err.message}` });
                    cleanup();
                });

                child.on('close', (exitCode) => {
                    safeSend(ws, { type: 'exit', code: exitCode !== null ? exitCode : 0 });
                    cleanup();
                });

            // 3. Raw xterm.js input (keystrokes, navigation, backspace)
            } else if ((msg.type === 'data' || msg.type === 'raw') && child && child.stdin && !child.stdin.destroyed) {
                resetTimer();
                try {
                    child.stdin.write(msg.data);
                } catch (e) { }

            // 4. Line-buffered stdin
            } else if (msg.type === 'stdin' && child && child.stdin && !child.stdin.destroyed) {
                resetTimer();
                try {
                    child.stdin.write(msg.data + '\n');
                } catch (e) { }

            // 5. User requested kill
            } else if (msg.type === 'kill' && child) {
                cleanup();
                safeSend(ws, { type: 'status', data: 'Terminated by user' });
            }
        });

        ws.on('close', () => cleanup());
        ws.on('error', () => cleanup());
    });

    console.log('[WebSocket] ⚡ Interactive terminal gateway listening on /ws/terminal');
    return wss;
}

function safeSend(ws, payload) {
    if (ws && ws.readyState === ws.OPEN) {
        try {
            ws.send(JSON.stringify(payload));
        } catch (e) { }
    }
}

module.exports = { initTerminalWebSocket };
