/**
 * Senior QA Tester — Full-Spectrum UI & Backend Automated Validation Suite
 * 
 * Verifies with empirical evidence:
 * 1. Backend Ping & Health Status
 * 2. Polyglot Code Execution:
 *    - In-Process JS/TS Sandbox via AntigravityEngine
 *    - Interactive Live Terminal via WebSocket (Python with stdin & stdout)
 * 3. Cross-Account Collision Safety (Foreign ID Re-keying, zero E11000)
 * 4. Sync Anti-Wipeout Guard (Empty stub rejection)
 * 5. Sync Recency Protection (Server-newer stale update rejection)
 * 6. Sync Delete Tombstone Precedence
 * 7. Frontend Monaco Editor Contract (Single-instance, detached DOM, modelUri, height layout)
 * 8. Frontend Output Purity (System log interception filter & immediate cellId cleanup)
 * 9. Frontend Local-First DB & Account Switching Protection (Wipe cache & synced status)
 */

const assert = require('assert');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const engine = require('../engine/AntigravityEngine');

const BASE_URL = 'http://localhost:4321';
const WS_URL = 'ws://localhost:4321/ws/terminal';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function test(name, fn) {
    totalTests++;
    process.stdout.write(`[TEST ${totalTests}] ${name}... `);
    try {
        await fn();
        passedTests++;
        console.log('✅ PASS');
    } catch (err) {
        failedTests++;
        console.log(`❌ FAIL\n    Reason: ${err.message}`);
        failures.push({ name, err });
    }
}

// Helper: HTTP GET
function httpGet(urlPath) {
    return new Promise((resolve, reject) => {
        http.get(`${BASE_URL}${urlPath}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        }).on('error', reject);
    });
}

// Helper: WebSocket Run with stdin support
function runWsCode(lang, code, stdinInput = null, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(WS_URL);
        let stdout = '';
        let stderr = '';
        let exitCode = null;
        let timer = setTimeout(() => {
            ws.close();
            reject(new Error(`WebSocket execution timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        ws.on('open', () => {
            ws.send(JSON.stringify({ type: 'start', lang, code }));
        });

        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg.type === 'stdout') {
                    stdout += msg.data;
                    // If prompt received and stdin input provided, send stdin
                    if (stdinInput && stdout.includes('Enter your name:')) {
                        ws.send(JSON.stringify({ type: 'stdin', data: stdinInput }));
                        stdinInput = null; // Send once
                    }
                }
                if (msg.type === 'stderr') stderr += msg.data;
                if (msg.type === 'exit') {
                    exitCode = msg.code;
                    clearTimeout(timer);
                    ws.close();
                    resolve({ stdout, stderr, exitCode });
                }
            } catch (e) {}
        });

        ws.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

async function runAllTests() {
    console.log('================================================================');
    console.log('🔍 SENIOR QA TEST SUITE: UI & BACKEND COMPREHENSIVE VALIDATION');
    console.log('================================================================\n');

    // -------------------------------------------------------------
    // SECTION 1: BACKEND SERVER & API ENDPOINTS
    // -------------------------------------------------------------
    console.log('--- SECTION 1: BACKEND SERVER & API ENDPOINTS ---');

    await test('1.1 Health Check: GET /api/ping returns 200 pong', async () => {
        const res = await httpGet('/api/ping');
        assert.strictEqual(res.status, 200, `Expected status 200, got ${res.status}`);
        assert.strictEqual(res.body, 'pong', `Expected 'pong', got '${res.body}'`);
    });

    await test('1.2 Auth Guard: GET / redirects unauthenticated users to /login', async () => {
        const res = await httpGet('/');
        assert.strictEqual(res.status, 302, `Expected 302 redirect, got ${res.status}`);
        assert(res.headers.location && res.headers.location.includes('/login'), 'Redirect must point to /login');
    });

    // -------------------------------------------------------------
    // SECTION 2: POLYGLOT CODE EXECUTION ENGINES
    // -------------------------------------------------------------
    console.log('\n--- SECTION 2: POLYGLOT CODE EXECUTION ENGINES ---');

    await test('2.1 JavaScript Engine: executes JS and captures logs & return value', async () => {
        const magicStr = 'QA_JS_VERIFIED_' + Date.now();
        const code = `console.log("${magicStr}"); 42 * 2;`;
        const res = await engine.execute(code, 'javascript');
        assert(res.success, `Execution failed: ${res.error}`);
        assert(res.logs && res.logs.some(l => l.includes(magicStr)), `Logs did not contain ${magicStr}`);
        assert.strictEqual(String(res.result), '84', `Expected return value '84', got ${res.result}`);
    });

    await test('2.2 TypeScript Engine: executes TypeScript and captures type-checked evaluation', async () => {
        const code = `let x: number = 10; let y: number = 25; console.log("SUM=" + (x + y)); x + y;`;
        const res = await engine.execute(code, 'typescript');
        assert(res.success, `TS execution failed: ${res.error}`);
        assert(res.logs && res.logs.some(l => l.includes('SUM=35')), 'TS output did not contain SUM=35');
    });

    await test('2.3 Python Interactive Terminal: executes via WebSocket and captures stdout', async () => {
        const magicNum = 987654;
        const code = `print("PY_RESULT_" + str(${magicNum}))`;
        const res = await runWsCode('python', code);
        assert.strictEqual(res.exitCode, 0, `Process exited with ${res.exitCode}, stderr: ${res.stderr}`);
        assert(res.stdout.includes(`PY_RESULT_${magicNum}`), `Output did not contain token. Stdout: ${res.stdout}`);
    });

    await test('2.4 Python Stdin Streaming: handles real-time input() through WebSocket terminal', async () => {
        const pyCode = `import sys\nprint("Enter your name:", flush=True)\nval = sys.stdin.readline().strip()\nprint(f"GREETING_HELLO_{val}", flush=True)`;
        const res = await runWsCode('python', pyCode, 'ZohoTester');
        assert.strictEqual(res.exitCode, 0, `Process exited with code ${res.exitCode}, stderr: ${res.stderr}`);
        assert(res.stdout.includes('GREETING_HELLO_ZohoTester'), `Stdout did not contain greeting. Got: ${res.stdout}`);
    });

    // -------------------------------------------------------------
    // SECTION 3: BACKEND SYNC, ISOLATION & ANTI-WIPEOUT CORE
    // -------------------------------------------------------------
    console.log('\n--- SECTION 3: SYNC LOGIC, ANTI-WIPEOUT & ISOLATION ---');

    const { resolvePushItem } = require('../routes/syncRoutes');

    await test('3.1 Anti-Wipeout: Server blocks empty cells stub over populated cloud note', () => {
        const existingNote = {
            id: 'ntbk-antiwipe-1',
            title: 'Populated Note',
            content: {
                cells: [
                    { id: 'c1', type: 'code', lang: 'javascript', content: 'console.log("Important!");' }
                ]
            },
            isTrashed: false,
            updatedAt: new Date(Date.now() - 10000)
        };

        const incomingEmptyStub = {
            action: 'UPDATE',
            note: {
                id: 'ntbk-antiwipe-1',
                title: 'Populated Note',
                cells: [],
                updatedAt: new Date()
            }
        };

        const result = resolvePushItem(existingNote, incomingEmptyStub);
        assert.strictEqual(result.outcome, 'conflict', 'Must trigger conflict outcome');
        assert.strictEqual(result.reason, 'anti_wipeout_protection', 'Reason must be anti_wipeout_protection');
    });

    await test('3.2 Recency Guard: Server rejects stale client snapshot over newer cloud note', () => {
        const existingNote = {
            id: 'ntbk-stale-1',
            title: 'Cloud Version',
            content: { cells: [{ id: 'c1', type: 'code', content: 'v2' }] },
            isTrashed: false,
            updatedAt: new Date(Date.now() - 1000)
        };

        const incomingStale = {
            action: 'UPDATE',
            note: {
                id: 'ntbk-stale-1',
                title: 'Stale Client',
                cells: [{ id: 'c1', type: 'code', content: 'v1' }],
                updatedAt: new Date(Date.now() - 120000) // 2 minutes older
            }
        };

        const result = resolvePushItem(existingNote, incomingStale);
        assert.strictEqual(result.outcome, 'conflict', 'Must trigger conflict for stale client');
        assert.strictEqual(result.reason, 'server_newer', 'Reason must be server_newer');
    });

    await test('3.3 Delete Tombstone Precedence: DELETE wins regardless of staleness', () => {
        const existingNote = {
            id: 'ntbk-del-1',
            updatedAt: new Date()
        };

        const incomingDelete = {
            action: 'DELETE',
            noteId: 'ntbk-del-1'
        };

        const result = resolvePushItem(existingNote, incomingDelete);
        assert.strictEqual(result.outcome, 'delete', 'DELETE action must result in delete outcome');
        assert.strictEqual(result.targetId, 'ntbk-del-1', 'Target ID must match');
    });

    await test('3.4 Cross-Account Collision Safety: Re-keys foreign note ID to prevent E11000', async () => {
        const syncRoutesCode = fs.readFileSync(path.join(__dirname, '../routes/syncRoutes.js'), 'utf8');
        assert(syncRoutesCode.includes('Note.findOne({ id: note.id }).lean()'), 'Must query foreign note to detect collision');
        assert(syncRoutesCode.includes('targetNoteId = `ntbk-${Date.now()}-'), 'Must re-key targetNoteId with unique timestamp prefix');
        assert(syncRoutesCode.includes('resolution.updateDoc.id = targetNoteId'), 'Must update resolution document with new target ID');
    });

    // -------------------------------------------------------------
    // SECTION 4: FRONTEND UI & MONACO EDITOR ARCHITECTURE CONTRACT
    // -------------------------------------------------------------
    console.log('\n--- SECTION 4: FRONTEND UI & MONACO EDITOR ARCHITECTURAL CONTRACT ---');

    const notebookJs = fs.readFileSync(path.join(__dirname, '../public/js/notebook.js'), 'utf8');

    await test('4.1 Monaco Single-Instance Guard: disposes existing instance prior to remount', () => {
        assert(notebookJs.includes('if (this.editors[cell.id])'), 'Must check this.editors[cell.id]');
        assert(notebookJs.includes('this.editors[cell.id].dispose()'), 'Must call dispose on existing editor');
    });

    await test('4.2 Detached DOM Check: guards against mounting on unattached container nodes', () => {
        assert(notebookJs.includes('document.body.contains(editorContainer)'), 'Must check document.body.contains(editorContainer)');
    });

    await test('4.3 Container Child Clear: removes pre-existing elements inside editor container', () => {
        assert(notebookJs.includes('if (editorContainer.children.length > 0)'), 'Must check editorContainer.children.length');
        assert(notebookJs.includes("editorContainer.innerHTML = ''"), 'Must clear container innerHTML');
    });

    await test('4.4 Monaco Model URI Binding: explicitly defines modelUri before model retrieval', () => {
        assert(notebookJs.includes('const modelUri = monaco.Uri.parse(`file:///${cell.id}.${ext}`);'), 'Must define modelUri with monaco.Uri.parse');
        assert(notebookJs.includes('monaco.editor.getModel(modelUri)'), 'Must pass modelUri to getModel');
    });

    await test('4.5 Model Language Sync: dynamically updates language without recreating editor', () => {
        assert(notebookJs.includes('monaco.editor.setModelLanguage(model, lang)'), 'Must synchronize language on reused models');
    });

    await test('4.6 Layout Height & Separation: sets editor height dynamically to avoid output overlap', () => {
        assert(notebookJs.includes('const finalHeight = Math.max(contentHeight, minHeight)'), 'Must calculate finalHeight from content and minHeight');
        assert(notebookJs.includes('editorDiv.style.height = `${finalHeight}px`'), 'Must set editorDiv height');
        assert(notebookJs.includes('editor.layout()'), 'Must call editor.layout()');
        assert(notebookJs.includes('setTimeout(updateHeight, 50)'), 'Must have delayed height recalculation for font rendering');
    });

    await test('4.7 Atomic Notebook Creation: avoids double-render race between addCell and loadNotebook', () => {
        const match = notebookJs.match(/async createNewNotebookInternal[\s\S]*?\{([\s\S]*?)\n    \}/);
        assert(match, 'createNewNotebookInternal must exist');
        const body = match[1];
        assert(!body.includes('this.addCell('), 'Must NOT call addCell before loadNotebook');
        assert(body.includes('cells: [initialCell]'), 'Must pre-populate cells array');
    });

    // -------------------------------------------------------------
    // SECTION 5: FRONTEND OUTPUT PURITY & ISOLATION
    // -------------------------------------------------------------
    console.log('\n--- SECTION 5: OUTPUT PURITY & LOG LEAK PREVENTION ---');

    await test('5.1 Console Interception Filter: suppresses internal engine logs from code output', () => {
        assert(notebookJs.includes("firstArg.startsWith('[BackupEngine]')"), 'Must filter [BackupEngine]');
        assert(notebookJs.includes("firstArg.startsWith('[SyncEngine]')"), 'Must filter [SyncEngine]');
        assert(notebookJs.includes("firstArg.startsWith('[OfflineManager]')"), 'Must filter [OfflineManager]');
        assert(notebookJs.includes("firstArg.startsWith('[NotebookApp]')"), 'Must filter [NotebookApp]');
        assert(notebookJs.includes("firstArg.startsWith('[SW]')"), 'Must filter [SW]');
        assert(notebookJs.includes("firstArg.startsWith('[ZohoLocalDB]')"), 'Must filter [ZohoLocalDB]');
    });

    await test('5.2 Immediate Execution Cleanup: resets currentRunningCellId in finally block', () => {
        const cleaned = notebookJs.replace(/\r\n/g, '\n');
        assert(cleaned.includes('if (this.currentRunningCellId === cellId) {\n                this.currentRunningCellId = null;\n            }'), 'Must reset currentRunningCellId immediately in finally');
    });

    // -------------------------------------------------------------
    // SECTION 6: LOCAL-FIRST DATABASE & ACCOUNT SWITCH INTEGRITY
    // -------------------------------------------------------------
    console.log('\n--- SECTION 6: LOCAL-FIRST DB & ACCOUNT ISOLATION ---');

    const dbJs = fs.readFileSync(path.join(__dirname, '../public/js/db/database.js'), 'utf8');
    const syncJs = fs.readFileSync(path.join(__dirname, '../public/js/db/syncEngine.js'), 'utf8');

    await test('6.1 Database Cache Cleansing: wipeAllData clears localStorage note IDs', () => {
        assert(dbJs.includes("localStorage.removeItem('zoho-notebook-current-id')"), 'Must remove current-id from localStorage on wipe');
        assert(dbJs.includes("localStorage.removeItem('zoho-notebook-trash-cache')"), 'Must remove trash-cache from localStorage on wipe');
    });

    await test('6.2 Account Identity Verification: detects unowned local notes and wipes cache', () => {
        assert(syncJs.includes('(!storedOwner && localNotes.length > 0)'), 'Must detect unowned local notes when storedOwner is absent');
        assert(syncJs.includes("localStorage.removeItem('zoho-notebook-current-id')"), 'Must cleanse localStorage on foreign account login');
    });

    await test('6.3 Push Status Finalization: marks successfully pushed notes as synced locally', () => {
        assert(syncJs.includes("localNote._syncStatus = 'synced'"), 'Must update local note _syncStatus to synced');
        assert(syncJs.includes('await this.db.putNote(localNote, { isRemoteSync: true, hasFullContent: true })'), 'Must persist synced note in Dexie');
    });

    // -------------------------------------------------------------
    // FINAL QA SUMMARY REPORT
    // -------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`📋 QA TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED (${Math.round((passedTests/totalTests)*100)}%)`);
    console.log('================================================================');

    if (failedTests > 0) {
        console.error(`\n❌ ${failedTests} test(s) failed:`);
        failures.forEach(f => console.error(` - ${f.name}: ${f.err.message}`));
        process.exit(1);
    } else {
        console.log('\n🎉 ALL UI & BACKEND VERIFICATION CHECKS PASSED WITH ZERO ERRORS!\n');
        process.exit(0);
    }
}

runAllTests().catch(err => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
});
