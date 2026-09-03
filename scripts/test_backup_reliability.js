/**
 * Backup Reliability Test Suite - Zoho Notes Pro
 * 
 * Tests:
 * 1. Express 50mb limit configured in app.js
 * 2. Clock drift up to 25s tolerated without false conflict
 * 3. Lifecycle flush includes keepalive: true in safeFetch
 * 4. MaxWait ceiling triggers backup during continuous typing
 * 5. Cross-tab lock contention schedules automatic retry
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const syncRoutes = require('../routes/syncRoutes');
const { resolvePushItem } = syncRoutes;

console.log('🧪 Starting Backup Reliability Test Suite...\n');

let passed = 0;
let total = 0;

function test(name, fn) {
    total++;
    try {
        fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (err) {
        console.error(`  ❌ ${name}: ${err.message}`);
        process.exitCode = 1;
    }
}

async function asyncTest(name, fn) {
    total++;
    try {
        await fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (err) {
        console.error(`  ❌ ${name}: ${err.message}`);
        process.exitCode = 1;
    }
}

function makeMockDb(notes = [], queue = []) {
    return {
        notes: new Map(notes.map(n => [n.id, { ...n }])),
        queue: queue.map((q, i) => ({ autoId: i + 1, entityType: 'note', payload: null, timestamp: Date.now(), retryCount: 0, ...q })),
        removedIds: [],
        putNotes: [],
        settings: new Map(),
        async init() { },
        async getNote(id) { return this.notes.get(id) || null; },
        async getAllNotes() { return [...this.notes.values()].filter(n => !n.isTrashed); },
        async putNote(rec) { const copy = JSON.parse(JSON.stringify(rec)); this.notes.set(rec.id, copy); this.putNotes.push(copy); return copy; },
        async getSyncQueue() { return this.queue.map(q => ({ ...q })); },
        async addToSyncQueue(item) { this.queue.push({ autoId: this.queue.length + 1, timestamp: Date.now(), retryCount: 0, entityType: 'note', payload: null, ...item }); },
        async removeFromSyncQueue(id) { this.removedIds.push(id); this.queue = this.queue.filter(q => q.autoId !== id); },
        async clearSyncQueue() { this.queue = []; },
        async getSetting(k) { return this.settings.has(k) ? this.settings.get(k) : null; },
        async setSetting(k, v) { this.settings.set(k, v); return v; }
    };
}

function makeFetch(responder) {
    const fn = async (url, options = {}) => {
        const call = { url, options, body: options.body ? JSON.parse(options.body) : null };
        fn.calls.push(call);
        return responder(call);
    };
    fn.calls = [];
    return fn;
}

function loadEngine(fetchImpl, opts = {}) {
    const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'db', 'syncEngine.js'), 'utf8');
    const listeners = {};
    const sandboxWindow = {
        addEventListener(event, handler) {
            listeners[event] = listeners[event] || [];
            listeners[event].push(handler);
        },
        removeEventListener() { },
        ZohoLocalDB: null,
        fetch: fetchImpl,
        app: null
    };
    const sandboxNavigator = { onLine: true };
    if (opts.locks) sandboxNavigator.locks = opts.locks;

    const sandbox = {
        window: sandboxWindow,
        document: { addEventListener() { }, querySelector: () => null, visibilityState: 'visible' },
        navigator: sandboxNavigator,
        console: { log() { }, warn() { }, error: console.error },
        setTimeout, clearTimeout, setInterval, clearInterval, Date
    };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: 'syncEngine.sandbox.js' });
    sandboxWindow.ZohoBackupEngine._listeners = listeners;
    return sandboxWindow.ZohoBackupEngine;
}

(async () => {
    // Test 1: Express 50mb body limit
    test('1. app.js configures 50mb body parser limit for large notebooks', () => {
        const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
        assert(appSrc.includes("express.json({ limit: '50mb' })"), 'express.json must have 50mb limit');
        assert(appSrc.includes("express.urlencoded({ extended: true, limit: '50mb' })"), 'express.urlencoded must have 50mb limit');
    });

    // Test 2: Clock Drift Tolerance (e.g. 20 seconds behind)
    test('2. syncRoutes tolerates 20s clock drift without false conflict', () => {
        const existing = {
            id: 'note-drift',
            title: 'Cloud Doc',
            content: { cells: [{ id: 'c1', content: 'hello' }] },
            isTrashed: false,
            updatedAt: new Date(Date.now() - 5000), // Server updated 5s ago
            _version: 2,
            owner: 'u1'
        };
        const driftedPush = {
            action: 'UPDATE',
            note: {
                id: 'note-drift',
                title: 'Drifted Client Update',
                cells: [{ id: 'c1', content: 'hello updated' }],
                updatedAt: Date.now() - 25000, // Client clock is 20s behind server
                _version: 2
            }
        };
        const res = resolvePushItem(existing, driftedPush);
        assert.strictEqual(res.outcome, 'applied', 'Must accept push within widened skew tolerance');
        assert.strictEqual(res.updateDoc._version, 3);
    });

    // Test 3: Lifecycle Flush Keepalive
    await asyncTest('3. flushPendingSyncs sends keepalive: true during page unload', async () => {
        const fetch = makeFetch(() => ({
            ok: true,
            status: 200,
            json: async () => ({ success: true, processedQueueIds: [1] })
        }));
        const engine = loadEngine(fetch);
        const db = makeMockDb(
            [{ id: 'n1', title: 'Work', cells: [{ id: 'c1' }] }],
            [{ entityId: 'n1', action: 'UPDATE' }]
        );
        engine.db = db;
        engine.unsyncedCount = 1;

        await engine.flushPendingSyncs();

        assert.strictEqual(fetch.calls.length, 1, 'Fetch must be called');
        assert.strictEqual(fetch.calls[0].options.keepalive, true, 'keepalive must be true on lifecycle flush');
    });

    // Test 4: MaxWait Ceiling during continuous typing
    await asyncTest('4. MaxWait ceiling triggers backup during continuous typing', async () => {
        const fetch = makeFetch(() => ({
            ok: true,
            status: 200,
            json: async () => ({ success: true, processedQueueIds: [1] })
        }));
        const engine = loadEngine(fetch);
        engine.maxWaitMs = 100; // Small maxWait for test
        engine.idleTimeoutMs = 5000; // Large idle timeout

        const db = makeMockDb(
            [{ id: 'n1', title: 'Continuous Typing Note', cells: [{ id: 'c1' }] }],
            [{ entityId: 'n1', action: 'UPDATE' }]
        );
        engine.db = db;

        // Notify change & simulate typing every 20ms (which would normally starve a 5s debounce)
        await engine.notifyLocalChange('n1', 'UPDATE');
        for (let i = 0; i < 6; i++) {
            await new Promise(r => setTimeout(r, 20));
            engine.recordUserActivity();
        }

        // Wait for maxWait to expire
        await new Promise(r => setTimeout(r, 120));

        assert(fetch.calls.length >= 1, 'MaxWait must force backup even while user is actively typing');
    });

    // Test 5: Cross-Tab Lock Contention Retry
    await asyncTest('5. Cross-tab lock contention schedules automatic retry and succeeds', async () => {
        let lockHeld = true;
        const mockLocks = {
            async request(name, options, callback) {
                if (lockHeld) {
                    // Simulate another tab holding lock
                    return callback(null);
                }
                // Lock released
                return callback({});
            }
        };

        const fetch = makeFetch(() => ({
            ok: true,
            status: 200,
            json: async () => ({ success: true, processedQueueIds: [1] })
        }));

        const engine = loadEngine(fetch, { locks: mockLocks });
        const db = makeMockDb(
            [{ id: 'n1', title: 'Work', cells: [{ id: 'c1' }] }],
            [{ entityId: 'n1', action: 'UPDATE' }]
        );
        engine.db = db;
        engine.unsyncedCount = 1;

        // First attempt: lock is held
        await engine.backupNow();
        assert.strictEqual(fetch.calls.length, 0, 'No fetch while lock held');
        assert(engine.lockRetryTimer !== null, 'Must schedule lockRetryTimer');

        // Release lock and let timer or retry run
        lockHeld = false;
        // Fast forward retry
        clearTimeout(engine.lockRetryTimer);
        engine.lockRetryTimer = null;
        await engine.backupNow({ reason: 'lock_contention_retry' });

        assert.strictEqual(fetch.calls.length, 1, 'Backup executed after lock released');
    });

    console.log(`\n🎉 Reliability Suite: ${passed}/${total} tests passed.`);
    if (passed !== total) process.exit(1);
})();
