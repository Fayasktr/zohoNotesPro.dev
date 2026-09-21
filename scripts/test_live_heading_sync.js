const WebSocket = require('ws');
const assert = require('assert');

async function runTest() {
    console.log('=== TEST: Real-Time Live Heading & Metadata Sync ===');
    const port = 4321;
    const wsUrl = `ws://localhost:${port}/ws/collab`;
    const testNoteId = 'live-test-heading-' + Date.now();

    // 1. Client 1 (Host)
    const hostWs = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
        hostWs.on('open', resolve);
        hostWs.on('error', reject);
    });
    console.log('✔ Host WebSocket connected');

    hostWs.send(JSON.stringify({
        type: 'join',
        noteId: testNoteId,
        peerId: 'peer-host',
        user: { id: 'u-host', username: 'HostUser', isHost: true }
    }));

    // Wait for Host to receive 'joined'
    await new Promise(resolve => {
        const handler = (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'joined') {
                hostWs.off('message', handler);
                resolve();
            }
        };
        hostWs.on('message', handler);
    });
    console.log('✔ Host joined session');

    // 2. Client 2 (Guest)
    const guestWs = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
        guestWs.on('open', resolve);
        guestWs.on('error', reject);
    });
    console.log('✔ Guest WebSocket connected');

    guestWs.send(JSON.stringify({
        type: 'join',
        noteId: testNoteId,
        peerId: 'peer-guest',
        user: { id: 'u-guest', username: 'GuestUser', isHost: false }
    }));

    await new Promise(resolve => {
        const handler = (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'joined') {
                guestWs.off('message', handler);
                resolve();
            }
        };
        guestWs.on('message', handler);
    });
    console.log('✔ Guest joined session');

    // 3. Test Host -> Guest: cell_title
    const cellTitlePromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout waiting for cell_title')), 3000);
        guestWs.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'cell_title' && msg.cellId === 'cell-123') {
                clearTimeout(timer);
                resolve(msg);
            }
        });
    });

    hostWs.send(JSON.stringify({
        type: 'cell_title',
        noteId: testNoteId,
        cellId: 'cell-123',
        title: 'fayas',
        senderPeerId: 'peer-host'
    }));

    const receivedCellTitle = await cellTitlePromise;
    assert.strictEqual(receivedCellTitle.title, 'fayas');
    console.log('✔ Live cell_title ("fayas") received by guest successfully');

    // 4. Test Guest -> Host: notebook_title
    const notebookTitlePromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout waiting for notebook_title')), 3000);
        hostWs.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'notebook_title') {
                clearTimeout(timer);
                resolve(msg);
            }
        });
    });

    guestWs.send(JSON.stringify({
        type: 'notebook_title',
        noteId: testNoteId,
        title: 'Algorithm Masterclass',
        senderPeerId: 'peer-guest'
    }));

    const receivedNotebookTitle = await notebookTitlePromise;
    assert.strictEqual(receivedNotebookTitle.title, 'Algorithm Masterclass');
    console.log('✔ Live notebook_title ("Algorithm Masterclass") received by host successfully');

    // 5. Test Host -> Guest: cell_lang
    const cellLangPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout waiting for cell_lang')), 3000);
        guestWs.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'cell_lang' && msg.cellId === 'cell-123') {
                clearTimeout(timer);
                resolve(msg);
            }
        });
    });

    hostWs.send(JSON.stringify({
        type: 'cell_lang',
        noteId: testNoteId,
        cellId: 'cell-123',
        lang: 'python',
        senderPeerId: 'peer-host'
    }));

    const receivedCellLang = await cellLangPromise;
    assert.strictEqual(receivedCellLang.lang, 'python');
    console.log('✔ Live cell_lang ("python") received by guest successfully');

    // 6. Test Host -> Guest: cell_star
    const cellStarPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout waiting for cell_star')), 3000);
        guestWs.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'cell_star' && msg.cellId === 'cell-123') {
                clearTimeout(timer);
                resolve(msg);
            }
        });
    });

    hostWs.send(JSON.stringify({
        type: 'cell_star',
        noteId: testNoteId,
        cellId: 'cell-123',
        isStarred: true,
        senderPeerId: 'peer-host'
    }));

    const receivedCellStar = await cellStarPromise;
    assert.strictEqual(receivedCellStar.isStarred, true);
    console.log('✔ Live cell_star (true) received by guest successfully');

    // 7. Test Host -> Guest: cell_reorder
    const cellReorderPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout waiting for cell_reorder')), 3000);
        guestWs.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'cell_reorder') {
                clearTimeout(timer);
                resolve(msg);
            }
        });
    });

    hostWs.send(JSON.stringify({
        type: 'cell_reorder',
        noteId: testNoteId,
        cellIdsOrder: ['cell-b', 'cell-123', 'cell-a'],
        senderPeerId: 'peer-host'
    }));

    const receivedCellReorder = await cellReorderPromise;
    assert.deepStrictEqual(receivedCellReorder.cellIdsOrder, ['cell-b', 'cell-123', 'cell-a']);
    console.log('✔ Live cell_reorder received by guest successfully');

    // 8. Test Late-Joining Guest receiving cached metadata in 'joined' message
    const lateGuestWs = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
        lateGuestWs.on('open', resolve);
        lateGuestWs.on('error', reject);
    });

    const joinedPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout waiting for late guest joined')), 3000);
        lateGuestWs.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'joined') {
                clearTimeout(timer);
                resolve(msg);
            }
        });
    });

    lateGuestWs.send(JSON.stringify({
        type: 'join',
        noteId: testNoteId,
        peerId: 'peer-late-guest',
        user: { id: 'u-late', username: 'LateGuest', isHost: false }
    }));

    const joinedMsg = await joinedPromise;
    assert.ok(joinedMsg.cachedMetadata, 'Should have cachedMetadata in joined message');
    assert.strictEqual(joinedMsg.cachedMetadata.title, 'Algorithm Masterclass');
    const cellMeta = joinedMsg.cachedMetadata.cells.find(c => c.cellId === 'cell-123');
    assert.ok(cellMeta, 'Should have metadata for cell-123');
    assert.strictEqual(cellMeta.title, 'fayas');
    assert.strictEqual(cellMeta.lang, 'python');
    assert.strictEqual(cellMeta.isStarred, true);
    console.log('✔ Late-joining guest received cachedMetadata successfully with title, cell title, lang, and star');

    hostWs.close();
    guestWs.close();
    lateGuestWs.close();
    console.log('🎉 ALL LIVE HEADING & METADATA SYNC TESTS PASSED 100%!');
}

runTest().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
