const http = require('http');
const assert = require('assert');
const app = require('../app');

function makeRequest(server, options, postData = null) {
    return new Promise((resolve, reject) => {
        const addr = server.address();
        const port = addr.port;
        const reqOptions = {
            hostname: '127.0.0.1',
            port,
            path: options.path,
            method: options.method || 'GET',
            headers: {
                Connection: 'close',
                ...(options.headers || {})
            },
            agent: false // Disable connection pooling / keep-alive
        };

        if (postData) {
            const dataStr = typeof postData === 'string' ? postData : JSON.stringify(postData);
            reqOptions.headers['Content-Type'] = 'application/json';
            reqOptions.headers['Content-Length'] = Buffer.byteLength(dataStr);
        }

        const req = http.request(reqOptions, (res) => {
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                let parsed;
                try {
                    parsed = JSON.parse(body);
                } catch (e) {
                    parsed = body;
                }
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: parsed
                });
            });
        });

        req.on('error', reject);

        if (postData) {
            req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
        }
        req.end();
    });
}

async function runApiTests() {
    console.log('\n--- Running Backend API Integration Tests ---');
    let passed = 0;
    let total = 0;

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    async function test(name, fn) {
        total++;
        try {
            await fn();
            console.log(`  ✅ [PASS] ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ❌ [FAIL] ${name}`);
            console.error(`     Error: ${err.message}`);
        }
    }

    try {
        // 1. GET /api/ping
        await test('GET /api/ping returns 200 pong', async () => {
            const res = await makeRequest(server, { path: '/api/ping' });
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body, 'pong');
        });

        // 2. GET /api/health
        await test('GET /api/health returns valid JSON telemetry', async () => {
            const res = await makeRequest(server, { path: '/api/health' });
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.data.service, 'zoho-notes-pro-backend');
            assert.strictEqual(res.body.data.status, 'ok');
            assert.ok(res.body.data.memory, 'Expected memory statistics');
        });

        // 3. GET /api/notebooks without token
        await test('GET /api/notebooks without token returns 401 Unauthorized', async () => {
            const res = await makeRequest(server, { path: '/api/notebooks' });
            assert.strictEqual(res.statusCode, 401);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
        });

        // 4. POST /api/auth/register missing fields
        await test('POST /api/auth/register with missing parameters returns 400 Bad Request', async () => {
            const res = await makeRequest(server, { path: '/api/auth/register', method: 'POST' }, { username: 'testuser' });
            assert.strictEqual(res.statusCode, 400);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.error.code, 'BAD_REQUEST');
        });

        // 5. 404 Route Not Found
        await test('Non-existent endpoint returns 404 JSON response', async () => {
            const res = await makeRequest(server, { path: '/api/non-existent-route' });
            assert.strictEqual(res.statusCode, 404);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.error.code, 'NOT_FOUND');
        });

        console.log(`\nAPI Tests: ${passed}/${total} passed.\n`);
    } finally {
        if (server.closeAllConnections) {
            server.closeAllConnections();
        }
        await new Promise((resolve) => server.close(resolve));
    }

    if (passed !== total) {
        throw new Error(`API tests failed: ${total - passed} failures`);
    }
}

module.exports = runApiTests;

if (require.main === module) {
    runApiTests().catch(err => {
        console.error('Fatal API test error:', err);
        process.exit(1);
    });
}
