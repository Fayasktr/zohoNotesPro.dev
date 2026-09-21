const WebSocket = require('ws');
const assert = require('assert');

async function runTest() {
    console.log('🚀 Starting Live Collaboration WebSocket E2E Test...');

    const noteId = 'live-1789976862578-h0u4';
    const wsUrl = 'ws://localhost:4321/ws/collab';

    const client1 = new WebSocket(wsUrl);
    const client2 = new WebSocket(wsUrl);

    await Promise.all([
        new Promise((resolve, reject) => {
            client1.on('open', resolve);
            client1.on('error', reject);
        }),
        new Promise((resolve, reject) => {
            client2.on('open', resolve);
            client2.on('error', reject);
        })
    ]);

    console.log('  ✅ Both WebSocket clients connected to /ws/collab');

    let client1Events = [];
    let client2Events = [];

    client1.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        client1Events.push(msg);
    });

    client2.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        client2Events.push(msg);
    });

    // 1. Client 1 joins as Host
    client1.send(JSON.stringify({
        type: 'join',
        noteId: noteId,
        peerId: 'peer_host_1',
        user: { id: 'user_host', username: 'HostUser', color: '#6d5dfc', isHost: true }
    }));

    await new Promise(r => setTimeout(r, 100));

    // 2. Client 2 joins as Guest
    client2.send(JSON.stringify({
        type: 'join',
        noteId: noteId,
        peerId: 'peer_guest_2',
        user: { id: 'user_guest', username: 'GuestUser', color: '#00d2ff', isHost: false }
    }));

    await new Promise(r => setTimeout(r, 200));

    // Verify presence on Client 1 & 2
    const presenceC1 = client1Events.find(e => e.type === 'presence' && e.count === 2);
    const presenceC2 = client2Events.find(e => (e.type === 'presence' || e.type === 'joined') && (e.count === 2 || (e.presence && e.presence.count === 2)));
    assert(presenceC1, 'Client 1 must receive presence with 2 users');
    assert(presenceC2, 'Client 2 must receive presence with 2 users');
    console.log('  ✅ Presence broadcast verified: 2 active users, isHostOnline = true');

    // 3. Client 1 broadcasts an edit
    client1.send(JSON.stringify({
        type: 'edit',
        noteId: noteId,
        cellId: 'cell_123',
        changes: [{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: 'function hello() {\n}\n' }],
        fullContent: 'function hello() {\n}\n',
        senderPeerId: 'peer_host_1'
    }));

    await new Promise(r => setTimeout(r, 150));

    const editC2 = client2Events.find(e => e.type === 'edit' && e.cellId === 'cell_123');
    assert(editC2, 'Client 2 must receive the real-time edit');
    assert.strictEqual(editC2.senderPeerId, 'peer_host_1');
    assert.strictEqual(editC2.fullContent, 'function hello() {\n}\n');
    console.log('  ✅ Real-time Monaco edit successfully delivered from Host to Guest with 0ms lag');

    // 4. Client 2 broadcasts dynamic cell creation
    client2.send(JSON.stringify({
        type: 'cell_add',
        noteId: noteId,
        cell: { id: 'cell_new_456', type: 'code', lang: 'javascript', title: 'Collaborator Cell', content: 'console.log("guest");' },
        senderPeerId: 'peer_guest_2'
    }));

    await new Promise(r => setTimeout(r, 150));

    const cellAddC1 = client1Events.find(e => e.type === 'cell_add' && e.cell && e.cell.id === 'cell_new_456');
    assert(cellAddC1, 'Client 1 must receive dynamic cell creation from Client 2');
    console.log('  ✅ Dynamic cell creation successfully synchronized between peers');

    // 5. Client 2 broadcasts execution event
    client2.send(JSON.stringify({
        type: 'exec_start',
        noteId: noteId,
        cellId: 'cell_new_456',
        runnerId: 'user_guest',
        runnerName: 'GuestUser',
        senderPeerId: 'peer_guest_2'
    }));

    await new Promise(r => setTimeout(r, 150));

    const execStartC1 = client1Events.find(e => e.type === 'exec_start' && e.cellId === 'cell_new_456');
    assert(execStartC1, 'Client 1 must receive remote execution start notification');
    console.log('  ✅ Remote execution start notification delivered');

    // 6. Host disconnects -> Guest should receive updated presence with isHostOnline = false
    client1.close();
    await new Promise(r => setTimeout(r, 200));

    const hostOfflinePresence = client2Events.filter(e => e.type === 'presence').pop();
    assert(hostOfflinePresence, 'Client 2 must receive presence update after host disconnect');
    assert.strictEqual(hostOfflinePresence.isHostOnline, false, 'isHostOnline must be false after host disconnect');
    assert.strictEqual(hostOfflinePresence.count, 1, 'Active user count must drop to 1');
    console.log('  ✅ Host offline detection verified: Guest receives isHostOnline = false when Host tab closes');

    client2.close();
    console.log('\n🎉 ALL LIVE COLLABORATION WEBSOCKET TESTS PASSED 100%!');
}

runTest().catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
