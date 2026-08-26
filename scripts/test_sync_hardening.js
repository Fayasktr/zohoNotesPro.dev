/**
 * Sync Hardening Regression Suite - Zoho Notes Pro
 *
 * Covers every historical data-loss / phantom-note / resurrection bug:
 *   T1  Stale-device overwrite rejected by server recency guard
 *   T2  Anti-wipeout guard still enforced
 *   T3  DELETE tombstones always win + trash propagation allowed through recency guard
 *   T4  Garbage/NaN timestamps sanitized (no poisoned batches)
 *   T5  Purged notes become DELETE tombstones; never-synced CREATEs dropped
 *   T6  Conflicts self-heal: cloud copy adopted locally, queue cleared
 *   T7  Cross-tab lock: concurrent backup skipped gracefully, status restored
 *   T8  Restore-from-cloud never clobbers newer pending local edits
 *   T9  Account switch wipes local cache (no cross-account leaks)
 *   T10 Structural wiring: startup gating, purge tombstones, SW cache bump
 *
 * Run: node scripts/test_sync_hardening.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (err) {
        failed++;
        failures.push({ name, err });
        console.log(`  ❌ ${name}\n     ${err.message}`);
    }
}

// ---------------------------------------------------------------- server core
const syncRoutes = require('../routes/syncRoutes');
const { resolvePushItem, sanitizeTimestamp } = syncRoutes;

// ------------------------------------------------------------- client harness
function makeMockDb(notes = [], queue = []) {
    return {
        notes: new Map(notes.map(n => [n.id, { ...n }])),
        queue: queue.map((q, i) => ({ autoId: i + 1, entityType: 'note', payload: null, timestamp: Date.now(), retryCount: 0, ...q })),
        removedIds: [],
        putNotes: [],
        wiped: false,
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
        async setSetting(k, v) { this.settings.set(k, v); return v; },
        async wipeAllData() { this.wiped = true; this.notes.clear(); this.queue = []; }
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
    const sandboxWindow = {
        addEventListener() { },
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
    return sandboxWindow.ZohoBackupEngine;
}

const jsonOk = obj => ({ ok: true, status: 200, json: async () => obj });

// ------------------------------------------------------------------ the tests
async function runSuite(runNumber) {
    console.log(`\n════════════════════════════════════════════`);
    console.log(`🧪 Sync Hardening Suite — Run #${runNumber}`);
    console.log(`════════════════════════════════════════════`);

    // T1 — Stale-device overwrite protection (THE data-loss killer)
    await test('T1 server rejects STALE device UPDATE over newer cloud copy (server_newer)', () => {
        const existing = {
            id: 'n1',
            title: 'Newer Cloud Version',
            content: { cells: [{ id: 'cloud-cell', type: 'code', content: 'print("v2")' }] },
            isTrashed: false,
            updatedAt: new Date(),
            _version: 7,
            owner: 'u1'
        };
        const stalePush = {
            action: 'UPDATE',
            note: {
                id: 'n1',
                title: 'Old Device Snapshot',
                cells: [{ id: 'old-cell', content: 'print("v1")' }],
                updatedAt: Date.now() - 60000, // 60s older than cloud
                _version: 2
            }
        };
        const r1 = resolvePushItem(existing, stalePush);
        assert.strictEqual(r1.outcome, 'conflict', 'stale push must conflict');
        assert.strictEqual(r1.reason, 'server_newer');
        assert.strictEqual(r1.serverNote.cells.length, 1, 'server note returned for adoption');
        assert(!r1.updateDoc, 'must NOT produce an update doc');

        // Fresh device pushes straight through
        const freshPush = { action: 'UPDATE', note: { ...stalePush.note, updatedAt: Date.now(), _version: 3 } };
        const r2 = resolvePushItem(existing, freshPush);
        assert.strictEqual(r2.outcome, 'applied');
        assert.strictEqual(r2.updateDoc._version, 8, 'monotonic version bump');
        assert.strictEqual(r2.updateDoc.content.cells[0].id, 'old-cell', 'client authoritative when fresh');
    });

    // T2 — Anti-wipeout guard intact
    await test('T2 server rejects empty-cells stub over populated cloud note (anti_wipeout)', () => {
        const existing = {
            id: 'n2',
            content: { cells: [{ id: 'a' }, { id: 'b' }] },
            isTrashed: false,
            updatedAt: new Date(Date.now() - 1000),
            _version: 4,
            owner: 'u1'
        };
        const wipeout = { action: 'UPDATE', note: { id: 'n2', cells: [], updatedAt: Date.now(), _version: 99 } };
        const r = resolvePushItem(existing, wipeout);
        assert.strictEqual(r.outcome, 'conflict');
        assert.strictEqual(r.reason, 'anti_wipeout_protection');
        assert.strictEqual(r.serverNote._version, 4);
    });

    // T3 — Tombstone priority + trash propagation bypass
    await test('T3 DELETE wins regardless of staleness; TRASH propagates through recency guard', () => {
        const existing = {
            id: 'n3',
            content: { cells: [{ id: 'c' }] },
            isTrashed: false,
            updatedAt: new Date(),
            _version: 10,
            owner: 'u1'
        };

        const del = resolvePushItem(existing, { action: 'DELETE', noteId: 'n3', note: null });
        assert.strictEqual(del.outcome, 'delete');
        assert.strictEqual(del.targetId, 'n3');

        const trash = resolvePushItem(existing, {
            action: 'TRASH',
            note: { id: 'n3', isTrashed: true, trashedAt: Date.now() - 999999, cells: [{ id: 'c' }], updatedAt: Date.now() - 999999 }
        });
        assert.strictEqual(trash.outcome, 'applied', 'soft-delete must propagate even from stale device');
        assert.strictEqual(trash.updateDoc.isTrashed, true);
    });

    // T4 — Timestamp sanitization
    await test('T4 garbage timestamps sanitized; no Invalid Date reaches Mongo', () => {
        assert.strictEqual(sanitizeTimestamp('not-a-date'), null);
        assert.strictEqual(sanitizeTimestamp(NaN), null);
        assert.strictEqual(sanitizeTimestamp(undefined), null);

        const r = resolvePushItem(null, { action: 'UPDATE', note: { id: 'n4', cells: [{ id: 'x' }], updatedAt: 'garbage!!' } });
        assert.strictEqual(r.outcome, 'applied');
        const ts = r.updateDoc.updatedAt.getTime();
        assert(Number.isFinite(ts), 'fallback to Date.now()');
        assert(Math.abs(Date.now() - ts) < 5000, 'sanitized timestamp is ~now');
    });

    // T5 — Purge tombstones & ghost-CREATE dropping
    await test('T5 purged local note sends DELETE tombstone; never-synced CREATE dropped cleanly', async () => {
        let pushedBatch = null;
        const fetch = makeFetch(call => {
            if (call.url === '/api/sync/push') {
                pushedBatch = call.body.batch;
                const allIds = pushedBatch.flatMap(i => i.queueIds);
                return jsonOk({ success: true, processedQueueIds: allIds, conflicts: [] });
            }
            return jsonOk({});
        });
        const engine = loadEngine(fetch);
        const db = makeMockDb([], [{ entityId: 'purged-note', action: 'TRASH' }]);
        engine.db = db;

        await engine.backupNow({});
        assert(pushedBatch && pushedBatch.length === 1, 'exactly one item pushed');
        assert.strictEqual(pushedBatch[0].action, 'DELETE', 'orphaned TRASH converted to tombstone');
        assert.strictEqual(pushedBatch[0].noteId, 'purged-note');
        assert.strictEqual(db.queue.length, 0, 'queue drained');

        // Never-synced CREATE: note gone before first push -> dropped, no network call
        const fetch2 = makeFetch(() => jsonOk({ success: true, processedQueueIds: [], conflicts: [] }));
        const engine2 = loadEngine(fetch2);
        const db2 = makeMockDb([], [{ entityId: 'ghost', action: 'CREATE' }]);
        engine2.db = db2;
        await engine2.backupNow({});
        assert.strictEqual(fetch2.calls.filter(c => c.url === '/api/sync/push').length, 0, 'no pointless push');
        assert.strictEqual(db2.queue.length, 0, 'ghost CREATE removed from queue');
    });

    // T6 — Conflict adoption self-heals local state
    await test('T6 client adopts newer cloud copy on conflict and clears its queue', async () => {
        const tLocal = Date.now() - 30000;
        const fetch = makeFetch(() => jsonOk({
            success: true,
            processedQueueIds: [11],
            conflicts: [{
                noteId: 'n9',
                reason: 'anti_wipeout_protection',
                serverNote: {
                    id: 'n9', title: 'Healed From Cloud',
                    folder: 'root', isStarred: false, isTrashed: false, trashedAt: null,
                    cells: [{ id: 'good-cell-1', type: 'code', content: 'recovered!' }],
                    tags: [], updatedAt: Date.now(), _version: 12, owner: 'u1'
                }
            }]
        }));
        const engine = loadEngine(fetch);
        const db = makeMockDb(
            [{ id: 'n9', title: 'Truncated Local', cells: [], updatedAt: tLocal, _version: 3, _syncStatus: 'pending' }],
            [{ entityId: 'n9', action: 'UPDATE', autoId: 11 }]
        );
        engine.db = db;

        await engine.backupNow({});

        const healed = await db.getNote('n9');
        assert.strictEqual(healed.cells.length, 1, 'truncated local note repaired');
        assert.strictEqual(healed.title, 'Healed From Cloud');
        assert.strictEqual(healed._syncStatus, 'synced');
        assert(db.removedIds.includes(11), 'conflicted queue item cleared');
        assert.strictEqual(db.queue.length, 0);
        assert.strictEqual(engine.status, 'SYNCED');
    });

    // T7 — Cross-tab serialization
    await test('T7 second tab skips backup while lock held; status restored, data untouched', async () => {
        let pushCalled = 0;
        const fetch = makeFetch(call => {
            if (call.url === '/api/sync/push') { pushCalled++; return jsonOk({ success: true, processedQueueIds: [], conflicts: [] }); }
            return jsonOk({});
        });
        const busyLocks = {
            request: (name, opts, cb) => Promise.resolve(cb(null)) // lock unavailable: another tab owns it
        };
        const engine = loadEngine(fetch, { locks: busyLocks });
        const db = makeMockDb([{ id: 'n7', cells: [{ id: 'c' }], updatedAt: Date.now(), _syncStatus: 'pending' }],
            [{ entityId: 'n7', action: 'UPDATE' }]);
        engine.db = db;

        await engine.backupNow({});
        assert.strictEqual(pushCalled, 0, 'no network push from locked-out tab');
        assert.notStrictEqual(engine.status, 'SYNCING', 'status must not be stuck');
        assert.strictEqual(db.queue.length, 1, 'changes stay queued for the owning tab');
    });

    // T8 — Restore never clobbers pending local edits
    await test('T8 restoreFromCloud inserts missing notes but preserves newer PENDING locals', async () => {
        const localFuture = Date.now() + 100000; // local edit ahead of cloud clock skew
        const fetch = makeFetch(call => {
            if (call.url === '/api/sync/hydrate') {
                return jsonOk({
                    success: true, count: 2, serverTime: Date.now(),
                    notes: [
                        { id: 'keep-me', title: 'Cloud Older', folder: 'root', cells: [{ id: 'cloud-c' }], tags: [], updatedAt: Date.now() - 5000, _version: 2, owner: 'u1' },
                        { id: 'brand-new', title: 'Fresh From Cloud', folder: 'root', cells: [{ id: 'nc' }], tags: [], updatedAt: Date.now(), _version: 1, owner: 'u1' }
                    ]
                });
            }
            return jsonOk({});
        });
        const engine = loadEngine(fetch);
        const db = makeMockDb([
            { id: 'keep-me', title: 'My Unsaved Work', cells: [{ id: 'local-c' }], updatedAt: localFuture, _version: 5, _syncStatus: 'pending' }
        ]);
        engine.db = db;

        const res = await engine.restoreFromCloud({ isInitial: true });
        assert.strictEqual(res.success, true);

        const preserved = await db.getNote('keep-me');
        assert.strictEqual(preserved.cells[0].id, 'local-c', 'pending local work intact');
        assert.strictEqual(preserved.title, 'My Unsaved Work');
        assert.strictEqual(preserved._syncStatus, 'pending');

        const added = await db.getNote('brand-new');
        assert(added && added.cells.length === 1, 'missing note hydrated');
    });

    // T9 — Account switch protection
    await test('T9 different account login wipes stale local cache before hydration', async () => {
        const fetch = makeFetch(() => jsonOk({ status: 'online', userId: 'user-BBB', totalNotes: 3 }));
        const engine = loadEngine(fetch);
        const db = makeMockDb([{ id: 'a-note', cells: [], owner: 'user-AAA' }], [{ entityId: 'a-note', action: 'UPDATE' }]);
        db.settings.set('ownerId', 'user-AAA');
        engine.db = db;

        await engine.verifyAccountIdentity();

        assert.strictEqual(db.wiped, true, 'stale account data purged');
        assert.strictEqual(await db.getSetting('ownerId'), 'user-BBB', 'new owner recorded');
        assert.strictEqual(engine.accountVerified, true);

        // Same account again -> no wipe
        const fetch2 = makeFetch(() => jsonOk({ status: 'online', userId: 'user-BBB' }));
        const engine2 = loadEngine(fetch2);
        const db2 = makeMockDb([{ id: 'b-note', cells: [] }]);
        db2.settings.set('ownerId', 'user-BBB');
        engine2.db = db2;
        await engine2.verifyAccountIdentity();
        assert.strictEqual(db2.wiped, false, 'same account keeps data');
    });

    // T10 — Structural wiring of all fixes
    await test('T10 wiring: startup gating, purge tombstones, resolver used, SW cache bumped', () => {
        const nb = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'notebook.js'), 'utf8');
        assert(nb.includes('await this.sync.waitForStartup()'), 'notebook.init awaits startup reconcile');
        assert(nb.includes('isAuthRequired'), 'default-note creation gated on auth state');
        assert(/emptyTrash[\s\S]*notifyLocalChange\(id, 'DELETE'\)/.test(nb), 'emptyTrash queues DELETE tombstones');
        assert(nb.includes("notifyLocalChange(id, 'DELETE')"), 'explicit permanent-delete tombstone present');

        const dbSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'db', 'database.js'), 'utf8');
        assert(dbSrc.includes('return purgedNoteIds'), 'clearAllTrash reports purged ids');
        assert(dbSrc.includes('async wipeAllData'), 'wipeAllData exists for account switch');

        const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'syncRoutes.js'), 'utf8');
        assert(routes.includes('resolvePushItem(existing, item)'), 'push route uses hardened resolver');
        assert(routes.includes('sanitizeTimestamp'), 'timestamp sanitization wired');

        const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
        assert(sw.includes('zoho-notes-v14-sync-hardening'), 'service worker cache bumped so clients receive fixes');

        const se = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'db', 'syncEngine.js'), 'utf8');
        assert(se.includes("navigator.locks.request('zoho_backup_lock'"), 'cross-tab lock wired');
        assert(se.includes('verifyAccountIdentity'), 'account identity check wired');
    });

    console.log('────────────────────────────────────────────');
    if (failed > 0) {
        failures.forEach(f => console.error(`❌ ${f.name}:`, f.err));
        throw new Error(`${failed} test(s) failed`);
    }
    console.log(`✅ All ${passed} checks green (run #${runNumber})`);
    passed = 0; failed = 0; failures.length = 0;
}

(async () => {
    const runs = parseInt(process.env.SYNC_TEST_RUNS || '5', 10);
    for (let i = 1; i <= runs; i++) {
        await runSuite(i);
    }
    console.log(`\n🏆 HARDENING VERIFIED: ${runs}/${runs} consecutive clean passes.`);
    process.exit(0);
})().catch(err => {
    console.error('\n💥 SUITE FAILED:', err.message);
    process.exit(1);
});
