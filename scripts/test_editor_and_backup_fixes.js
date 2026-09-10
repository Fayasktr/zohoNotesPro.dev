/**
 * Verification Test Suite for Editor & New Account Backup Fixes
 * 
 * Validates:
 * 1. createNewNotebookInternal creates initial note with cells: [initialCell] and single loadNotebook call
 * 2. renderCell includes single-instance guard and detached DOM guard
 * 3. window.console.log filters [BackupEngine], [SyncEngine], etc. from cell output
 * 4. runCell clears currentRunningCellId immediately upon completion
 * 5. verifyAccountIdentity & wipeAllData clean localStorage note IDs
 * 6. pushPendingChanges marks pushed notes as synced locally
 * 7. syncRoutes protects against cross-account duplicate key collisions
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Starting Editor & Backup Fixes Verification Suite...\n');

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

// 1. Check notebook.js createNewNotebookInternal logic
test('1. createNewNotebookInternal avoids addCell double-mount race', () => {
    const code = fs.readFileSync(path.join(__dirname, '../public/js/notebook.js'), 'utf8');
    const fnMatch = code.match(/async createNewNotebookInternal[\s\S]*?\{([\s\S]*?)\n    \}/);
    assert(fnMatch, 'createNewNotebookInternal function must be found');
    const body = fnMatch[1];
    
    // Must NOT call this.addCell('code') inside createNewNotebookInternal
    assert(!body.includes('this.addCell('), 'Must not call addCell() before loadNotebook');
    assert(body.includes('cells: [initialCell]'), 'Must initialize cells with initialCell directly');
    assert(body.includes('await this.loadNotebook('), 'Must call loadNotebook once to render');
});

// 2. Check renderCell guards
test('2. renderCell includes single-instance and detached DOM guards', () => {
    const code = fs.readFileSync(path.join(__dirname, '../public/js/notebook.js'), 'utf8');
    assert(code.includes('if (this.editors[cell.id])'), 'Must dispose existing editor instance for cell');
    assert(code.includes('document.body.contains(editorContainer)'), 'Must verify container is attached to DOM');
    assert(code.includes('if (editorContainer.children.length > 0)'), 'Must clear existing children in container before create');
});

// 3. Check console.log filter
test('3. setupConsoleInterception filters internal engine logs', () => {
    const code = fs.readFileSync(path.join(__dirname, '../public/js/notebook.js'), 'utf8');
    assert(code.includes("firstArg.startsWith('[BackupEngine]')"), 'Must filter [BackupEngine] logs');
    assert(code.includes("firstArg.startsWith('[SyncEngine]')"), 'Must filter [SyncEngine] logs');
    assert(code.includes("firstArg.startsWith('[OfflineManager]')"), 'Must filter [OfflineManager] logs');
});

// 4. Check runCell immediate cleanup
test('4. runCell clears currentRunningCellId immediately in finally block', () => {
    const code = fs.readFileSync(path.join(__dirname, '../public/js/notebook.js'), 'utf8');
    const runCellMatch = code.match(/async runCell\([\s\S]*?\{([\s\S]*?)\n    \}/);
    assert(runCellMatch, 'runCell function must be found');
    const body = runCellMatch[1];
    assert(!body.includes('setTimeout(() => {\n                if (this.currentRunningCellId === cellId) this.currentRunningCellId = null;\n            }, 1000);'), 'Must not have 1000ms delay on currentRunningCellId cleanup');
    assert(body.includes('this.currentRunningCellId = null;'), 'Must clear currentRunningCellId in finally');
});

// 5. Check database.js and syncEngine.js localStorage cleansing
test('5. wipeAllData & verifyAccountIdentity cleanse stale localStorage', () => {
    const dbCode = fs.readFileSync(path.join(__dirname, '../public/js/db/database.js'), 'utf8');
    assert(dbCode.includes("localStorage.removeItem('zoho-notebook-current-id')"), 'wipeAllData must remove zoho-notebook-current-id');
    
    const syncCode = fs.readFileSync(path.join(__dirname, '../public/js/db/syncEngine.js'), 'utf8');
    assert(syncCode.includes("localStorage.removeItem('zoho-notebook-current-id')"), 'verifyAccountIdentity must remove zoho-notebook-current-id');
    assert(syncCode.includes('(!storedOwner && localNotes.length > 0)'), 'Must check untracked notes with missing storedOwner');
});

// 6. Check pushPendingChanges updates note _syncStatus to synced
test('6. pushPendingChanges marks pushed notes as synced locally', () => {
    const syncCode = fs.readFileSync(path.join(__dirname, '../public/js/db/syncEngine.js'), 'utf8');
    assert(syncCode.includes("localNote._syncStatus = 'synced'"), 'Must update pushed notes _syncStatus to synced');
});

// 7. Check syncRoutes cross-account duplicate key protection
test('7. syncRoutes protects against foreign note ID collision on push', () => {
    const routeCode = fs.readFileSync(path.join(__dirname, '../routes/syncRoutes.js'), 'utf8');
    assert(routeCode.includes('targetNoteId'), 'Must use targetNoteId for upsert');
    assert(routeCode.includes('foreignNote'), 'Must detect foreign note ID to prevent E11000 duplicate key crash');
});

console.log(`\nResults: ${passed}/${total} tests passed.`);
if (passed === total) {
    console.log('🎉 ALL EDITOR & BACKUP FIX TESTS PASSED 100%!\n');
} else {
    process.exit(1);
}
