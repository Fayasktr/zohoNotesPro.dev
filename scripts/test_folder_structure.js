/**
 * Automated Test Suite for Folder Structure, Hierarchy & Tree Navigation
 */

const assert = require('assert');

console.log('🧪 Starting Folder Tree & Structure Test Suite...\n');

let passed = 0;
let total = 0;

function runTest(name, fn) {
    total++;
    process.stdout.write(`TEST ${total}: ${name}... `);
    try {
        fn();
        passed++;
        console.log('✅ PASS');
    } catch (err) {
        console.log(`❌ FAIL (${err.message})`);
    }
}

// 1. Build Tree Structure
runTest('Build Nested Folder Tree from Note Paths', () => {
    const mockNotes = [
        { id: '1', title: 'Root Note', folder: 'root' },
        { id: '2', title: 'Deep File', folder: 'Projects/Backend/API' },
        { id: '3', title: 'Frontend File', folder: 'Projects/Frontend' },
        { id: '4', title: 'Doc', folder: 'Documentation' }
    ];

    const tree = { name: 'root', type: 'folder', children: {}, files: [] };

    mockNotes.forEach(nb => {
        let path = nb.folder && nb.folder !== 'root' ? nb.folder.split('/') : [];
        let currentLevel = tree;
        let currentPath = '';

        path.forEach(part => {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            if (!currentLevel.children[part]) {
                currentLevel.children[part] = {
                    name: part,
                    fullPath: currentPath,
                    type: 'folder',
                    children: {},
                    files: []
                };
            }
            currentLevel = currentLevel.children[part];
        });

        currentLevel.files.push(nb);
    });

    assert.strictEqual(tree.files.length, 1, 'Root note count must be 1');
    assert(tree.children['Projects'], 'Projects folder must exist');
    assert(tree.children['Documentation'], 'Documentation folder must exist');
    assert(tree.children['Projects'].children['Backend'], 'Backend subfolder must exist');
    assert(tree.children['Projects'].children['Backend'].children['API'], 'API subfolder must exist');
    assert.strictEqual(tree.children['Projects'].children['Backend'].children['API'].files[0].title, 'Deep File');
});

// 2. Ancestor Expansion Resolution
runTest('Ancestor Path Expansion for Active Note in Deep Hierarchy', () => {
    const activeNoteFolder = 'Projects/Backend/API/V1';
    const folderPaths = ['Projects', 'Projects/Backend', 'Projects/Backend/API', 'Projects/Backend/API/V1', 'OtherFolder'];

    const expandedFolders = new Set();

    folderPaths.forEach(path => {
        const isAncestor = activeNoteFolder === path || activeNoteFolder.startsWith(path + '/');
        if (isAncestor) {
            expandedFolders.add(path);
        }
    });

    assert(expandedFolders.has('Projects'), 'Projects must be expanded');
    assert(expandedFolders.has('Projects/Backend'), 'Projects/Backend must be expanded');
    assert(expandedFolders.has('Projects/Backend/API'), 'Projects/Backend/API must be expanded');
    assert(expandedFolders.has('Projects/Backend/API/V1'), 'Projects/Backend/API/V1 must be expanded');
    assert(!expandedFolders.has('OtherFolder'), 'OtherFolder must remain collapsed');
});

// 3. Cascade Path Renaming
runTest('Folder Renaming Cascades to Nested Descendant Paths', () => {
    const oldPath = 'Projects/Backend';
    const newPath = 'Projects/Server';

    const notes = [
        { id: '1', folder: 'Projects/Backend' },
        { id: '2', folder: 'Projects/Backend/API' },
        { id: '3', folder: 'Projects/Frontend' }
    ];

    notes.forEach(n => {
        if (n.folder === oldPath) {
            n.folder = newPath;
        } else if (n.folder && n.folder.startsWith(oldPath + '/')) {
            n.folder = newPath + n.folder.slice(oldPath.length);
        }
    });

    assert.strictEqual(notes[0].folder, 'Projects/Server');
    assert.strictEqual(notes[1].folder, 'Projects/Server/API');
    assert.strictEqual(notes[2].folder, 'Projects/Frontend');
});

// 4. Cascade Folder Deletion
runTest('Folder Deletion Matches All Descendant Notes', () => {
    const targetFolder = 'Projects';
    const notes = [
        { id: '1', folder: 'Projects' },
        { id: '2', folder: 'Projects/Backend/API' },
        { id: '3', folder: 'Notes' }
    ];

    const matched = notes.filter(n => n.folder === targetFolder || (n.folder && n.folder.startsWith(targetFolder + '/')));
    assert.strictEqual(matched.length, 2, 'Must match folder and all sub-folders');
    assert.strictEqual(matched[0].id, '1');
    assert.strictEqual(matched[1].id, '2');
});

console.log(`\n🎉 FOLDER STRUCTURE TESTS COMPLETE: ${passed}/${total} PASSED\n`);
process.exit(passed === total ? 0 : 1);
