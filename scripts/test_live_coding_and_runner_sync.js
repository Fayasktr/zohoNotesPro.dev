const WebSocket = require('ws');

async function runTest() {
    console.log('Testing Collab WebSocket typing and runner synchronization...');
    const noteId = 'test-sync-room-' + Date.now();

    const ws1 = new WebSocket('ws://localhost:4321/ws/collab');
    const ws2 = new WebSocket('ws://localhost:4321/ws/collab');

    await Promise.all([
        new Promise(resolve => ws1.on('open', resolve)),
        new Promise(resolve => ws2.on('open', resolve))
    ]);

    console.log('Both WebSockets connected.');

    // 1. Join rooms
    ws1.send(JSON.stringify({
        type: 'join',
        noteId: noteId,
        user: { id: 'u1', peerId: 'peer_1', username: 'fayas' },
        peerId: 'peer_1'
    }));

    ws2.send(JSON.stringify({
        type: 'join',
        noteId: noteId,
        user: { id: 'u2', peerId: 'peer_2', username: 'alex' },
        peerId: 'peer_2'
    }));

    // Wait 200ms for join handshake
    await new Promise(r => setTimeout(r, 200));

    let receivedTyping = false;
    let receivedExecStart = false;
    let receivedExecDone = false;

    ws2.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'typing') {
            console.log('Client 2 received typing event:', msg);
            if (msg.username === 'fayas' && msg.cellId === 'cell-123') {
                receivedTyping = true;
            }
        }
        if (msg.type === 'exec_start') {
            console.log('Client 2 received exec_start event:', msg);
            if (msg.runnerName === 'fayas' && msg.cellId === 'cell-123') {
                receivedExecStart = true;
            }
        }
        if (msg.type === 'exec_done') {
            console.log('Client 2 received exec_done event:', msg);
            if (msg.runnerName === 'fayas' && msg.cellId === 'cell-123' && msg.output?.logs?.[0] === 'Hello World') {
                receivedExecDone = true;
            }
        }
    });

    // Client 1 sends typing
    ws1.send(JSON.stringify({
        type: 'typing',
        noteId: noteId,
        cellId: 'cell-123',
        username: 'fayas',
        senderPeerId: 'peer_1'
    }));

    await new Promise(r => setTimeout(r, 200));

    // Client 1 sends exec_start
    ws1.send(JSON.stringify({
        type: 'exec_start',
        noteId: noteId,
        cellId: 'cell-123',
        runnerId: 'u1',
        runnerName: 'fayas',
        senderPeerId: 'peer_1'
    }));

    await new Promise(r => setTimeout(r, 200));

    // Client 1 sends exec_done
    ws1.send(JSON.stringify({
        type: 'exec_done',
        noteId: noteId,
        cellId: 'cell-123',
        output: { success: true, logs: ['Hello World'] },
        success: true,
        runnerName: 'fayas',
        senderPeerId: 'peer_1'
    }));

    await new Promise(r => setTimeout(r, 300));

    ws1.close();
    ws2.close();

    console.log('Results:', { receivedTyping, receivedExecStart, receivedExecDone });

    if (receivedTyping && receivedExecStart && receivedExecDone) {
        console.log('TEST PASSED: Live typing indicator and runner sync work perfectly!');
        process.exit(0);
    } else {
        console.error('TEST FAILED: Some messages were not received or mismatched.');
        process.exit(1);
    }
}

runTest().catch(err => {
    console.error('Error running test:', err);
    process.exit(1);
});
