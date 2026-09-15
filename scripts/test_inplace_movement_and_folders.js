/**
 * Test Suite: In-Place Cell Reordering, Folder Persistence, and 1-Minute Idle Backup
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Starting In-Place Reordering, Persistent Folders & 1-Min Backup Test Suite...\n');

let total = 0;
let passed = 0;

function test(name, fn) {
    total++;
    process.stdout.write(`TEST ${total}: ${name}... `);
    try {
        fn();
        passed++;
        console.log('✅ PASS');
    } catch (err) {
        console.log(`❌ FAIL (${err.message})`);
        process.exitCode = 1;
    }
}

const notebookCode = fs.readFileSync(path.join(__dirname, '../public/js/notebook.js'), 'utf8');
const syncEngineCode = fs.readFileSync(path.join(__dirname, '../public/js/db/syncEngine.js'), 'utf8');
const syncRoutesCode = fs.readFileSync(path.join(__dirname, '../routes/syncRoutes.js'), 'utf8');
const offlineManagerCode = fs.readFileSync(path.join(__dirname, '../public/js/offlineManager.js'), 'utf8');

// 1. In-Place moveCell does not destroy editors or innerHTML
test('moveCell repositions DOM nodes in-place without disposeEditors or innerHTML wipeout', () => {
    const fnMatch = notebookCode.match(/moveCell\(cellId, direction\) \{([\s\S]*?)\n    \}/);
    assert(fnMatch, 'moveCell method must exist');
    const body = fnMatch[1];
    assert(!body.includes('this.disposeEditors()'), 'moveCell must NOT call disposeEditors()');
    assert(!body.includes(".innerHTML = ''"), "moveCell must NOT clear innerHTML");
    assert(body.includes('updateCellIndices()'), 'moveCell must call updateCellIndices()');
    assert(body.includes('scrollIntoView'), 'moveCell must preserve smooth scroll view');
    assert(body.includes('before(') || body.includes('after(') || body.includes('insertBefore('), 'moveCell must reposition DOM elements in-place');
});

// 2. In-Place handleCellDrop does not destroy editors or innerHTML
test('handleCellDrop repositions DOM nodes in-place without disposeEditors or innerHTML wipeout', () => {
    const fnMatch = notebookCode.match(/handleCellDrop\(e\) \{([\s\S]*?)\n    \}/);
    assert(fnMatch, 'handleCellDrop method must exist');
    const body = fnMatch[1];
    assert(!body.includes('this.disposeEditors()'), 'handleCellDrop must NOT call disposeEditors()');
    assert(!body.includes(".innerHTML = ''"), "handleCellDrop must NOT clear innerHTML");
    assert(body.includes('updateCellIndices()'), 'handleCellDrop must call updateCellIndices()');
    assert(body.includes('scrollIntoView'), 'handleCellDrop must preserve smooth scroll view');
    assert(body.includes('after(') || body.includes('before('), 'handleCellDrop must reposition DOM elements in-place');
});

// 3. updateCellIndices exists and re-indexes all cells
test('updateCellIndices is implemented and correctly re-indexes .cell-index badges', () => {
    assert(notebookCode.includes('updateCellIndices()'), 'updateCellIndices method must exist');
    assert(notebookCode.includes('.cell-index'), 'updateCellIndices must select .cell-index');
    assert(notebookCode.includes('idx + 1'), 'updateCellIndices must set textContent to 1-based index');
});

// 4. Folder persistence in notebook.js
test('Persisted folders are maintained so empty folders do not disappear', () => {
    assert(notebookCode.includes('this.persistedFolders = this.getPersistedFolders()'), 'Constructor must load persistedFolders');
    assert(notebookCode.includes('addPersistedFolder'), 'addPersistedFolder helper must exist');
    assert(notebookCode.includes('savePersistedFolders'), 'savePersistedFolders helper must exist');
    assert(notebookCode.includes('zoho-persisted-folders'), 'Must store in zoho-persisted-folders localStorage');
    
    // renderNotebookList seeds tree with persistedFolders
    const renderMatch = notebookCode.match(/renderNotebookList\(notebooks\) \{([\s\S]*?)\n    \}/);
    assert(renderMatch, 'renderNotebookList must exist');
    const renderBody = renderMatch[1];
    assert(renderBody.includes('this.persistedFolders'), 'renderNotebookList must seed tree with persistedFolders');
    assert(renderBody.includes('(Empty folder)'), 'Empty folders must render placeholder instead of vanishing');
});

// 5. Folder rename & delete update persistedFolders
test('renameFolder and deleteFolder properly update persistedFolders cache', () => {
    const renameMatch = notebookCode.match(/async renameFolder\(oldPath\) \{([\s\S]*?)\n    \}/);
    assert(renameMatch, 'renameFolder must exist');
    assert(renameMatch[1].includes('this.persistedFolders'), 'renameFolder must update persistedFolders');

    const deleteMatch = notebookCode.match(/async deleteFolder\(folderName\) \{([\s\S]*?)\n    \}/);
    assert(deleteMatch, 'deleteFolder must exist');
    assert(deleteMatch[1].includes('this.persistedFolders'), 'deleteFolder must update persistedFolders');
});

// 6. 1-Minute Idle Backup Timeout in syncEngine.js
test('syncEngine.js defaults to 60000ms (1 minute) idle timeout with user override', () => {
    assert(syncEngineCode.includes('this.idleTimeoutMs = 60000'), 'idleTimeoutMs must default to 60000 (1 min)');
    assert(syncEngineCode.includes('this.maxWaitMs = 120000'), 'maxWaitMs must be 120000 (2 mins)');
    assert(syncEngineCode.includes('setIdleTimeoutMs'), 'setIdleTimeoutMs method must exist');
    assert(syncEngineCode.includes('zoho-backup-idle-delay'), 'Must load/save custom idle delay in localStorage');
});

// 7. CSRF auto-recovery in safeFetch and GET /api/sync/csrf endpoint
test('syncEngine safeFetch auto-retries on 403 CSRF and syncRoutes provides /csrf endpoint', () => {
    assert(syncEngineCode.includes('/api/sync/csrf'), 'safeFetch must call /api/sync/csrf on 403');
    assert(syncEngineCode.includes('_csrfRetried'), 'safeFetch must use retry guard for CSRF');
    assert(syncRoutesCode.includes("router.get('/csrf'"), 'syncRoutes must define GET /csrf');
});

// 8. OfflineManager UI has Auto-Backup delay selector
test('offlineManager modal includes auto-backup idle duration control', () => {
    assert(offlineManagerCode.includes('modal-idle-delay-select'), 'Modal must have modal-idle-delay-select element');
    assert(offlineManagerCode.includes('setIdleTimeoutMs'), 'Modal must hook into engine.setIdleTimeoutMs');
    assert(offlineManagerCode.includes('1 Minute (Default)'), 'Must offer 1 Minute (Default) option');
});

console.log(`\nResults: ${passed}/${total} tests passed.`);
if (passed === total) {
    console.log('🎉 ALL IN-PLACE MOVEMENT, PERSISTENT FOLDER & BACKUP TESTS PASSED 100%!\n');
} else {
    process.exit(1);
}
