const assert = require('assert');
const syncService = require('../src/services/sync.service');

function runSyncTests() {
    console.log('\n--- Running Sync Service Unit Tests ---');
    let passed = 0;
    let total = 0;

    function test(name, fn) {
        total++;
        try {
            fn();
            console.log(`  ✅ [PASS] ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ❌ [FAIL] ${name}`);
            console.error(`     Error: ${err.message}`);
        }
    }

    // 1. Anti-Wipeout Guard
    test('Anti-Wipeout Guard: blocks empty-cells update from destroying real cloud cells', () => {
        const existingCloudNote = {
            id: 'ntbk-123',
            title: 'My Project Architecture',
            isTrashed: false,
            updatedAt: Date.now() - 5000,
            _version: 3,
            content: {
                cells: [
                    { id: 'c1', type: 'code', content: 'console.log("critical code");' },
                    { id: 'c2', type: 'markdown', content: '# Crucial Notes' }
                ]
            }
        };

        const incomingClientUpdate = {
            action: 'UPDATE',
            note: {
                id: 'ntbk-123',
                title: 'My Project Architecture',
                updatedAt: Date.now(),
                _version: 4,
                cells: [] // ⚠️ Empty cells stub!
            }
        };

        const resolution = syncService.resolvePushItem(existingCloudNote, incomingClientUpdate);
        assert.strictEqual(resolution.outcome, 'conflict', 'Expected conflict outcome');
        assert.strictEqual(resolution.reason, 'anti_wipeout_protection', 'Expected anti_wipeout_protection reason');
        assert.ok(resolution.serverNote, 'Expected serverNote to be returned to preserve cloud state');
    });

    // 2. Recency Guard
    test('Recency Guard: rejects stale device snapshot if cloud copy is newer by > 30s', () => {
        const now = Date.now();
        const existingCloudNote = {
            id: 'ntbk-456',
            title: 'Cloud Work',
            isTrashed: false,
            updatedAt: now, // Server updated just now
            _version: 5,
            content: { cells: [{ id: 'c1', content: 'new cloud changes' }] }
        };

        const incomingStaleClientUpdate = {
            action: 'UPDATE',
            note: {
                id: 'ntbk-456',
                title: 'Old Stale Title',
                updatedAt: now - 60000, // 60 seconds older!
                _version: 4,
                cells: [{ id: 'c1', content: 'stale device edits' }]
            }
        };

        const resolution = syncService.resolvePushItem(existingCloudNote, incomingStaleClientUpdate, { skewMs: 30000 });
        assert.strictEqual(resolution.outcome, 'conflict', 'Expected conflict outcome');
        assert.strictEqual(resolution.reason, 'server_newer', 'Expected server_newer reason');
    });

    // 3. Normal update applies and increments version
    test('Normal update: applies valid incoming update and increments _version vector', () => {
        const now = Date.now();
        const existingCloudNote = {
            id: 'ntbk-789',
            title: 'Initial Title',
            isTrashed: false,
            updatedAt: now - 1000,
            _version: 2,
            content: { cells: [{ id: 'c1', content: 'initial' }] }
        };

        const incomingValidUpdate = {
            action: 'UPDATE',
            note: {
                id: 'ntbk-789',
                title: 'Updated Title',
                folder: 'backend',
                isStarred: true,
                updatedAt: now + 500,
                _version: 3,
                cells: [{ id: 'c1', content: 'edited' }]
            }
        };

        const resolution = syncService.resolvePushItem(existingCloudNote, incomingValidUpdate);
        assert.strictEqual(resolution.outcome, 'applied', 'Expected update to be applied');
        assert.strictEqual(resolution.updateDoc.title, 'Updated Title');
        assert.strictEqual(resolution.updateDoc.folder, 'backend');
        assert.strictEqual(resolution.updateDoc.isStarred, true);
        assert.strictEqual(resolution.updateDoc._version, 4, 'Expected version to increment to max(2,3)+1 = 4');
    });

    // 4. Tombstone delete
    test('Tombstone DELETE: action DELETE returns outcome delete with targetId', () => {
        const resolution = syncService.resolvePushItem(null, {
            action: 'DELETE',
            noteId: 'ntbk-delete-me'
        });
        assert.strictEqual(resolution.outcome, 'delete');
        assert.strictEqual(resolution.targetId, 'ntbk-delete-me');
    });

    // 5. Brand new note creation
    test('New note creation: applies successfully with initial version', () => {
        const resolution = syncService.resolvePushItem(null, {
            action: 'CREATE',
            note: {
                id: 'ntbk-new-1',
                title: 'Fresh Notebook',
                cells: [{ id: 'cell-1', content: 'hello world' }]
            }
        });
        assert.strictEqual(resolution.outcome, 'applied');
        assert.strictEqual(resolution.updateDoc.id, 'ntbk-new-1');
        assert.strictEqual(resolution.updateDoc._version, 2);
    });

    console.log(`\nSync Tests: ${passed}/${total} passed.\n`);
    if (passed !== total) {
        throw new Error(`Sync tests failed: ${total - passed} failures`);
    }
}

module.exports = runSyncTests;

if (require.main === module) {
    runSyncTests();
}
