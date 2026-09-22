const http = require('http');
const fs = require('fs');
const assert = require('assert');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const BASE_URL = 'http://127.0.0.1:4321';

function request(path, options = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const reqOpts = {
            method: options.method || 'GET',
            headers: options.headers || {},
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search
        };

        const req = http.request(reqOpts, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: body
                });
            });
        });

        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

async function loginUser(email, password) {
    const loginPageRes = await request('/login');
    let cookie = loginPageRes.headers['set-cookie']
        ? loginPageRes.headers['set-cookie'][0].split(';')[0]
        : '';
    const csrfMatch = loginPageRes.body.match(/name="_csrf"\s+value="([^"]+)"/);
    if (!csrfMatch) throw new Error('Could not find CSRF token');
    const csrfToken = csrfMatch[1];

    const loginRes = await request('/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookie
        },
        body: `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&_csrf=${encodeURIComponent(csrfToken)}`
    });

    const sessionCookie = loginRes.headers['set-cookie']
        ? loginRes.headers['set-cookie'][0].split(';')[0]
        : cookie;

    return { cookie: sessionCookie, csrfToken };
}

async function run() {
    console.log('🧪 Running Drag and Drop & Move Verification Suite...\n');

    // 1. Static Checks on public/js/notebook.js and public/css/style.css
    console.log('1. Checking static Drag and Drop attributes and styling...');
    const notebookJs = fs.readFileSync('public/js/notebook.js', 'utf8');
    const styleCss = fs.readFileSync('public/css/style.css', 'utf8');

    assert(notebookJs.includes("fileItem.setAttribute('draggable', 'true')"), 'Normal note fileItem must be draggable');
    assert(notebookJs.includes("fileItem.setAttribute('data-is-live', 'true')"), 'Live note fileItem must have data-is-live="true"');
    assert(notebookJs.includes('handleSidebarDragStart'), 'notebook.js must have handleSidebarDragStart');
    assert(notebookJs.includes('handleLiveNotesListDragOver'), 'notebook.js must have handleLiveNotesListDragOver');
    assert(notebookJs.includes('handleLiveNotesListDrop'), 'notebook.js must have handleLiveNotesListDrop');
    assert(notebookJs.includes('moveLiveNotebookToFolder'), 'notebook.js must have moveLiveNotebookToFolder');
    assert(notebookJs.includes('moveNotebookToFolder'), 'notebook.js must have moveNotebookToFolder');
    assert(notebookJs.includes('moveCellToNotebook'), 'notebook.js must have moveCellToNotebook');

    assert(styleCss.includes('.live-note-item.drag-over'), 'CSS must have .live-note-item.drag-over');
    assert(styleCss.includes('.tree-item.is-live-folder.drag-over-folder'), 'CSS must have .tree-item.is-live-folder.drag-over-folder');
    assert(styleCss.includes('.notebook-item.dragging-sidebar-note'), 'CSS must have .dragging-sidebar-note');
    console.log('  ✅ Static attributes, event handlers, and styling verified\n');

    // 2. Authentication & Live Note Move Test
    console.log('2. Testing Backend Move APIs with Host...');
    await mongoose.connect('mongodb://localhost:27017/zoho');
    const User = require('../models/User');
    const hashedPassword = await bcrypt.hash('secret123', 10);
    const hostEmail = `dnd_host_${Date.now()}@example.com`;
    await User.create({
        username: 'DndHostUser',
        email: hostEmail,
        password: hashedPassword
    });

    const hostAuth = await loginUser(hostEmail, 'secret123');
    const hostCookie = hostAuth.cookie;
    const csrfToken = hostAuth.csrfToken;
    assert(hostCookie, 'Host must be authenticated');

    // Create a live note
    const liveNoteRes = await request('/api/notes/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': hostCookie, 'CSRF-Token': csrfToken },
        body: JSON.stringify({
            title: 'DnD Live Session',
            folder: 'root',
            cells: [{ id: 'cell-dnd-1', type: 'code', lang: 'javascript', title: 'Cell 1', content: 'console.log("dnd");' }]
        })
    });
    assert.strictEqual(liveNoteRes.status, 200, 'Live note creation must succeed');
    const liveNote = JSON.parse(liveNoteRes.body);
    console.log(`  ✅ Live note created: ${liveNote.id}`);

    // Move live note to folder via API (simulating drag-and-drop onto folder)
    const moveLiveRes = await request('/api/notebooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': hostCookie, 'CSRF-Token': csrfToken },
        body: JSON.stringify({
            id: liveNote.id,
            folder: 'DnD Live Folder'
        })
    });
    assert.strictEqual(moveLiveRes.status, 200, 'Move live note to folder must succeed');

    const checkLiveRes = await request('/api/notes/live', {
        headers: { 'Cookie': hostCookie }
    });
    const checkLiveData = JSON.parse(checkLiveRes.body);
    const hostedLive = checkLiveData.hosted.find(n => n.id === liveNote.id);
    assert(hostedLive, 'Moved live note must exist in hosted');
    assert.strictEqual(hostedLive.folder, 'DnD Live Folder', 'Live note folder must be updated');
    console.log(`  ✅ Live note successfully moved into folder "${hostedLive.folder}"`);

    // Move live note back to root (simulating drag-and-drop to root)
    await request('/api/notebooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': hostCookie, 'CSRF-Token': csrfToken },
        body: JSON.stringify({
            id: liveNote.id,
            folder: 'root'
        })
    });
    const checkLiveRootRes = await request('/api/notes/live', {
        headers: { 'Cookie': hostCookie }
    });
    const checkLiveRootData = JSON.parse(checkLiveRootRes.body);
    const hostedLiveRoot = checkLiveRootData.hosted.find(n => n.id === liveNote.id);
    assert.strictEqual(hostedLiveRoot.folder, 'root', 'Live note folder must be reset to root');
    console.log(`  ✅ Live note successfully moved back to root`);

    // 3. Test Moving Cell into Live Note via /api/notebooks/move-cell
    console.log('\n3. Testing Move Cell into Live Note via drag-and-drop endpoint...');
    // Create a regular notebook with cells
    const normalId = `normal-nb-${Date.now()}`;
    const normalNoteRes = await request('/api/notebooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': hostCookie, 'CSRF-Token': csrfToken },
        body: JSON.stringify({
            id: normalId,
            title: 'Regular Notebook',
            folder: 'root',
            cells: [
                { id: 'cell-source-1', type: 'code', lang: 'javascript', title: 'Source Code', content: 'let x = 42;' },
                { id: 'cell-source-2', type: 'code', lang: 'javascript', title: 'Stay Here', content: 'let y = 100;' }
            ]
        })
    });
    assert.strictEqual(normalNoteRes.status, 200);
    const normalNote = JSON.parse(normalNoteRes.body);

    // Move cell-source-1 from normalNote to liveNote
    const moveCellRes = await request('/api/notebooks/move-cell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': hostCookie, 'CSRF-Token': csrfToken },
        body: JSON.stringify({
            sourceNotebookId: normalId,
            targetNotebookId: liveNote.id,
            cell: { id: 'cell-source-1', type: 'code', lang: 'javascript', title: 'Source Code', content: 'let x = 42;' }
        })
    });
    assert.strictEqual(moveCellRes.status, 200, 'move-cell must succeed');
    const moveCellData = JSON.parse(moveCellRes.body);
    assert.strictEqual(moveCellData.success, true);

    // Verify cell is now in live note
    const updatedLiveRes = await request(`/api/notebooks/${liveNote.id}`, {
        headers: { 'Cookie': hostCookie }
    });
    const liveCells = JSON.parse(updatedLiveRes.body).cells;
    assert(liveCells.some(c => c.id === 'cell-source-1'), 'Live note must now contain moved cell');
    assert(liveCells.some(c => c.id === 'cell-dnd-1'), 'Live note must still contain original cell');

    // Verify cell is removed from regular note
    const updatedNormalRes = await request(`/api/notebooks/${normalId}`, {
        headers: { 'Cookie': hostCookie }
    });
    const normalCells = JSON.parse(updatedNormalRes.body).cells;
    assert(!normalCells.some(c => c.id === 'cell-source-1'), 'Regular note must not contain moved cell');
    assert(normalCells.some(c => c.id === 'cell-source-2'), 'Regular note must retain non-moved cell');
    console.log('  ✅ Cell moved seamlessly from regular notebook to Live Note!');

    console.log('\n🎉 ALL DRAG AND DROP VERIFICATIONS PASSED!\n');
    await mongoose.disconnect();
}

run().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
