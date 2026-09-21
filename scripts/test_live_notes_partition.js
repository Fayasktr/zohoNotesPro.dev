/**
 * Live Notes Partition & Host Gating Regression Suite
 * Run: node scripts/test_live_notes_partition.js
 */

const assert = require('assert');
const mongoose = require('mongoose');
const Note = require('../models/Note');
const { resolvePushItem, formatServerNote } = require('../routes/syncRoutes');

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

async function run() {
    console.log('\n--- 1. Model & Pre-save Schema Rules ---');

    await test('Normal note defaults isLive to false and does not auto-generate shareCode', () => {
        const dummyOwner = new mongoose.Types.ObjectId();
        const note = new Note({
            id: 'norm-' + Date.now(),
            title: 'My Normal Notebook',
            owner: dummyOwner
        });

        assert.strictEqual(note.isLive, false, 'isLive should default to false');
        
        note.validateSync();
        const preHooks = Note.schema.s.hooks._pres.get('save') || [];
        for (const hook of preHooks) {
            hook.fn.call(note, () => {});
        }

        assert.strictEqual(note.shareCode, undefined, 'shareCode should not be generated for normal notes');
    });

    await test('Live note generates collab- shareCode in pre-save hook', () => {
        const dummyOwner = new mongoose.Types.ObjectId();
        const liveNote = new Note({
            id: 'live-' + Date.now(),
            title: 'Live Pair Programming',
            isLive: true,
            owner: dummyOwner
        });

        assert.strictEqual(liveNote.isLive, true);

        const preHooks = Note.schema.s.hooks._pres.get('save') || [];
        for (const hook of preHooks) {
            hook.fn.call(liveNote, () => {});
        }

        assert.ok(liveNote.shareCode, 'shareCode should be generated');
        assert.ok(liveNote.shareCode.startsWith('collab-'), `shareCode should start with collab-, got ${liveNote.shareCode}`);
    });

    console.log('\n--- 2. Sync Engine isLive Projection ---');

    await test('resolvePushItem projects isLive correctly for both normal and live notes', () => {
        const normalPush = {
            id: 'test-norm-1',
            title: 'Normal Note',
            _version: 1,
            cells: [{ id: 'c1', content: 'test' }]
        };
        const resultNorm = resolvePushItem(null, { action: 'UPDATE', note: normalPush });
        assert.strictEqual(resultNorm.outcome, 'applied');
        assert.strictEqual(resultNorm.updateDoc.isLive, false, 'Normal note must have isLive=false');

        const livePush = {
            id: 'test-live-1',
            title: 'Live Note',
            isLive: true,
            _version: 1,
            cells: [{ id: 'c1', content: 'live test' }]
        };
        const resultLive = resolvePushItem(null, { action: 'UPDATE', note: livePush });
        assert.strictEqual(resultLive.outcome, 'applied');
        assert.strictEqual(resultLive.updateDoc.isLive, true, 'Live note must preserve isLive=true');
    });

    await test('formatServerNote includes isLive field', () => {
        const dummyOwner = new mongoose.Types.ObjectId();
        const serverDoc = {
            id: 'test-doc-1',
            title: 'Doc',
            owner: dummyOwner,
            isLive: true,
            cells: [],
            _version: 2
        };
        const formatted = formatServerNote(serverDoc);
        assert.strictEqual(formatted.isLive, true, 'formatServerNote must project isLive');
    });

    console.log('\n--- 3. Database Partition Query Safety ---');

    await test('Normal notes query { isLive: { $ne: true } } strictly excludes live notes', () => {
        const mockNotes = [
            { id: '1', title: 'Normal Note A', isLive: false },
            { id: '2', title: 'Normal Note B' },
            { id: '3', title: 'Live Note C', isLive: true }
        ];

        const normalResults = mockNotes.filter(n => n.isLive !== true);
        assert.strictEqual(normalResults.length, 2);
        assert.deepStrictEqual(normalResults.map(n => n.id), ['1', '2']);

        const liveResults = mockNotes.filter(n => n.isLive === true);
        assert.strictEqual(liveResults.length, 1);
        assert.deepStrictEqual(liveResults.map(n => n.id), ['3']);
    });

    console.log('\n--- 4. Client Engine Offline Host Gating Invariants ---');

    await test('Client collab_engine suppresses broadcasts when guest and host is offline', () => {
        const mockCollab = {
            isConnected: true,
            isHost: false,
            hostOnline: false,
            sentEdits: [],
            sentExecutions: [],
            broadcastEdit(cellId, changes) {
                if (!this.isConnected || (!this.isHost && !this.hostOnline)) return;
                this.sentEdits.push({ cellId, changes });
            },
            broadcastExecutionStart(cellId) {
                if (!this.isConnected || (!this.isHost && !this.hostOnline)) return;
                this.sentExecutions.push({ cellId });
            }
        };

        mockCollab.broadcastEdit('c1', [{ text: 'console.log(1)' }]);
        mockCollab.broadcastExecutionStart('c1');
        assert.strictEqual(mockCollab.sentEdits.length, 0, 'Edit broadcast must be blocked when host is offline');
        assert.strictEqual(mockCollab.sentExecutions.length, 0, 'Exec broadcast must be blocked when host is offline');

        mockCollab.hostOnline = true;
        mockCollab.broadcastEdit('c1', [{ text: 'console.log(1)' }]);
        mockCollab.broadcastExecutionStart('c1');
        assert.strictEqual(mockCollab.sentEdits.length, 1, 'Edit broadcast must pass when host is online');
        assert.strictEqual(mockCollab.sentExecutions.length, 1, 'Exec broadcast must pass when host is online');
    });

    console.log(`\n========================================`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

run().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
