const WebSocket = require('ws');
const assert = require('assert');

async function runTest() {
    console.log('🧪 Starting Per-Box (Monaco Editor) Live Coding & Runner Sync Tests...');
    const noteId = 'live-note-perbox-' + Date.now();

    const ws1 = new WebSocket('ws://localhost:4321/ws/collab');
    const ws2 = new WebSocket('ws://localhost:4321/ws/collab');

    await Promise.all([
        new Promise(resolve => ws1.on('open', resolve)),
        new Promise(resolve => ws2.on('open', resolve))
    ]);

    console.log('1. Connected both clients to WebSocket server.');

    // 1. Join live note room
    ws1.send(JSON.stringify({
        type: 'join',
        noteId: noteId,
        user: { id: 'u_fayas', peerId: 'peer_fayas', username: 'fayas' },
        peerId: 'peer_fayas'
    }));

    ws2.send(JSON.stringify({
        type: 'join',
        noteId: noteId,
        user: { id: 'u_alex', peerId: 'peer_alex', username: 'alex' },
        peerId: 'peer_alex'
    }));

    await new Promise(r => setTimeout(r, 200));

    const client1Received = [];
    const client2Received = [];

    ws1.on('message', (raw) => {
        try {
            client1Received.push(JSON.parse(raw.toString()));
        } catch (_) { }
    });

    ws2.on('message', (raw) => {
        try {
            client2Received.push(JSON.parse(raw.toString()));
        } catch (_) { }
    });

    // 2. Fayas starts typing in Box 1 (cell-101)
    console.log('2. Fayas typing in Box 1 (cell-101)...');
    ws1.send(JSON.stringify({
        type: 'typing',
        noteId: noteId,
        cellId: 'cell-101',
        username: 'fayas',
        senderPeerId: 'peer_fayas'
    }));

    // 3. At the exact same time, Alex starts typing in Box 2 (cell-202)
    console.log('3. Simultaneously, Alex typing in Box 2 (cell-202)...');
    ws2.send(JSON.stringify({
        type: 'typing',
        noteId: noteId,
        cellId: 'cell-202',
        username: 'alex',
        senderPeerId: 'peer_alex'
    }));

    await new Promise(r => setTimeout(r, 300));

    // Verify Client 2 received Fayas typing in Box 1
    const fayasTyping = client2Received.find(m => m.type === 'typing' && m.cellId === 'cell-101');
    assert(fayasTyping, 'Client 2 must receive Fayas typing in cell-101');
    assert.strictEqual(fayasTyping.username, 'fayas', 'Typing event username must be "fayas"');
    console.log('  ✅ Client 2 received: "fayas coding..." on Box 1 (cell-101)');

    // Verify Client 1 received Alex typing in Box 2
    const alexTyping = client1Received.find(m => m.type === 'typing' && m.cellId === 'cell-202');
    assert(alexTyping, 'Client 1 must receive Alex typing in cell-202');
    assert.strictEqual(alexTyping.username, 'alex', 'Typing event username must be "alex"');
    console.log('  ✅ Client 1 received: "alex coding..." on Box 2 (cell-202)');

    // 4. Test code edit with cellId (Monaco edit delta)
    console.log('4. Fayas edits code in Box 1...');
    ws1.send(JSON.stringify({
        type: 'edit',
        noteId: noteId,
        cellId: 'cell-101',
        changes: [{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: 'console.log("hi");' }],
        fullContent: 'console.log("hi");',
        username: 'fayas',
        senderPeerId: 'peer_fayas'
    }));

    await new Promise(r => setTimeout(r, 200));

    const fayasEdit = client2Received.find(m => m.type === 'edit' && m.cellId === 'cell-101');
    assert(fayasEdit, 'Client 2 must receive Fayas edit in cell-101');
    console.log('  ✅ Client 2 received edit for Box 1 with cellId preserved');

    // 5. Test Box 1 Execution by Fayas
    console.log('5. Fayas running code in Box 1...');
    ws1.send(JSON.stringify({
        type: 'exec_start',
        noteId: noteId,
        cellId: 'cell-101',
        runnerId: 'u_fayas',
        runnerName: 'fayas',
        senderPeerId: 'peer_fayas'
    }));

    ws1.send(JSON.stringify({
        type: 'exec_done',
        noteId: noteId,
        cellId: 'cell-101',
        output: { success: true, logs: ['hi'] },
        success: true,
        runnerName: 'fayas',
        senderPeerId: 'peer_fayas'
    }));

    // 6. Test Box 2 Execution by Alex
    console.log('6. Alex running code in Box 2...');
    ws2.send(JSON.stringify({
        type: 'exec_start',
        noteId: noteId,
        cellId: 'cell-202',
        runnerId: 'u_alex',
        runnerName: 'alex',
        senderPeerId: 'peer_alex'
    }));

    ws2.send(JSON.stringify({
        type: 'exec_done',
        noteId: noteId,
        cellId: 'cell-202',
        output: { success: true, logs: ['42'] },
        success: true,
        runnerName: 'alex',
        senderPeerId: 'peer_alex'
    }));

    await new Promise(r => setTimeout(r, 300));

    const c2ExecStart = client2Received.find(m => m.type === 'exec_start' && m.cellId === 'cell-101');
    const c2ExecDone = client2Received.find(m => m.type === 'exec_done' && m.cellId === 'cell-101');
    assert(c2ExecStart && c2ExecStart.runnerName === 'fayas', 'Box 1 runner name must be fayas');
    assert(c2ExecDone && c2ExecDone.runnerName === 'fayas', 'Box 1 exec done runner name must be fayas');
    console.log('  ✅ Box 1 output correctly attributed to runner: fayas');

    const c1ExecStart = client1Received.find(m => m.type === 'exec_start' && m.cellId === 'cell-202');
    const c1ExecDone = client1Received.find(m => m.type === 'exec_done' && m.cellId === 'cell-202');
    assert(c1ExecStart && c1ExecStart.runnerName === 'alex', 'Box 2 runner name must be alex');
    assert(c1ExecDone && c1ExecDone.runnerName === 'alex', 'Box 2 exec done runner name must be alex');
    console.log('  ✅ Box 2 output correctly attributed to runner: alex');

    ws1.close();
    ws2.close();

    console.log('\n🎉 ALL PER-BOX CODING & RUNNER SYNC TESTS PASSED 100%!');
}

runTest().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
