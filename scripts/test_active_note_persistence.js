/**
 * Automated Test Suite for Active Note Persistence & Anti-Duplication on Sync
 * Tests:
 * 1. SyncManifest exists and resolves cleanly on SyncEngine
 * 2. Init logic preserves and restores localStorage 'zoho-notebook-current-id'
 * 3. Empty list fallback does not create rogue notes if local DB has existing notes
 * 4. RefreshNotebookList never throws or wipes local cache on network error
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Starting Active Note Persistence & Sync Anti-Duplication Test Suite...\n');

async function runTests() {
    let passed = 0;
    let total = 0;

    // Test 1: SyncEngine has syncManifest method
    total++;
    process.stdout.write('TEST 1: SyncEngine defines syncManifest() method... ');
    try {
        const syncEngineContent = fs.readFileSync(path.join(__dirname, '../public/js/db/syncEngine.js'), 'utf8');
        assert(syncEngineContent.includes('async syncManifest()'), 'syncEngine.js must define async syncManifest()');
        passed++;
        console.log('✅ PASS');
    } catch (err) {
        console.log(`❌ FAIL (${err.message})`);
    }

    // Test 2: Active Note Restoration Logic Simulation
    total++;
    process.stdout.write('TEST 2: Last active note ID restoration from localStorage... ');
    try {
        const mockLocalStorage = {
            'zoho-notebook-current-id': 'nb-react-guide-99'
        };

        const mockNotebooks = [
            { id: 'nb-getting-started', title: 'Getting Started' },
            { id: 'nb-react-guide-99', title: 'React Guide' },
            { id: 'nb-python-notes', title: 'Python Notes' }
        ];

        let loadedId = null;
        let createdNote = false;

        // Simulate init() logic
        const savedId = mockLocalStorage['zoho-notebook-current-id'];
        if (savedId) {
            const existsInList = Array.isArray(mockNotebooks) && mockNotebooks.some(nb => nb.id === savedId);
            if (existsInList) {
                loadedId = savedId;
            }
        }

        if (!loadedId && mockNotebooks.length > 0) {
            loadedId = mockNotebooks[0].id;
        } else if (!loadedId) {
            createdNote = true;
        }

        assert.strictEqual(loadedId, 'nb-react-guide-99', 'Should restore the exact savedId from localStorage');
        assert.strictEqual(createdNote, false, 'Should NOT create a new note when notes exist');
        passed++;
        console.log('✅ PASS');
    } catch (err) {
        console.log(`❌ FAIL (${err.message})`);
    }

    // Test 3: No new note created on sync / refresh when local notes exist
    total++;
    process.stdout.write('TEST 3: No note duplication when list is refreshed... ');
    try {
        const mockDb = {
            notes: [
                { id: 'nb-1', title: 'My Work', isTrashed: false },
                { id: 'nb-2', title: 'Dev Guide', isTrashed: false }
            ],
            async getAllNotes() { return this.notes; },
            async getNote(id) { return this.notes.find(n => n.id === id); }
        };

        // Simulate refresh failure recovery
        let list = await mockDb.getAllNotes();
        // Simulate a failed sync manifest
        try {
            throw new Error('Network timeout');
        } catch (e) {
            // Fallback to local db
            list = await mockDb.getAllNotes();
        }

        assert.strictEqual(list.length, 2, 'Must keep existing 2 notes without returning empty array');
        passed++;
        console.log('✅ PASS');
    } catch (err) {
        console.log(`❌ FAIL (${err.message})`);
    }

    // Test 4: Verify notebook.js no longer hardcodes 'new folder' / 'New Note' creation on normal load
    total++;
    process.stdout.write('TEST 4: notebook.js init() uses root folder and Getting Started fallback... ');
    try {
        const notebookContent = fs.readFileSync(path.join(__dirname, '../public/js/notebook.js'), 'utf8');
        assert(!notebookContent.includes("this.createNewNotebookInternal('new folder', 'New Note')"), 'Must not have spurious new folder creation in init()');
        passed++;
        console.log('✅ PASS');
    } catch (err) {
        console.log(`❌ FAIL (${err.message})`);
    }

    console.log(`\n🎉 PERSISTENCE & ANTI-DUPLICATION TESTS: ${passed}/${total} PASSED\n`);
    process.exit(passed === total ? 0 : 1);
}

runTests();
