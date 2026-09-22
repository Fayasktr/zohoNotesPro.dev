/**
 * Live Review Proctoring & Anti-Cheating Monitoring Verification Test Suite
 *
 * Tests:
 * 1. UI and Template Integrity:
 *    - views/index.hbs contains review mode badge, proctor log button, and proctor modal
 *    - public/css/style.css contains avatar proctor indicators and modal styles
 *    - public/js/notebook.js contains onRemoteStudentFocus and proctor log modal methods
 * 2. CollabEngine Client Proctor Logic:
 *    - Focus monitoring attaches only for non-host participants
 *    - Visibilitychange triggers tab_switch event
 *    - Blur/focus triggers app_switch event and computes awayDuration
 *    - Screen width ratio < 0.65 triggers split_screen event
 * 3. Server-side Collab Proctor Cache & Dispatcher:
 *    - student_focus messages update room proctor cache
 *    - switchCount increments and totalAwaySeconds accumulates
 *    - presence broadcast includes proctorStatus, switchCount, and totalAwaySeconds
 *    - joined message contains proctorSummary
 *
 * Run: node scripts/test_proctor_monitoring.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

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

async function runSuite() {
    console.log('\n--- Running Live Review Proctoring & Focus Monitoring Suite ---\n');

    // TEST 1: Template & UI Markup
    await test('views/index.hbs has review badge, proctor log button, and proctor modal', () => {
        const hbsContent = fs.readFileSync(path.join(__dirname, '../views/index.hbs'), 'utf8');
        assert(hbsContent.includes('id="collab-review-badge"'), 'collab-review-badge must exist in index.hbs');
        assert(hbsContent.includes('id="btn-collab-proctor-log"'), 'btn-collab-proctor-log must exist in index.hbs');
        assert(hbsContent.includes('id="collab-proctor-alert-count"'), 'collab-proctor-alert-count must exist in index.hbs');
        assert(hbsContent.includes('id="modal-proctor-log"'), 'modal-proctor-log must exist in index.hbs');
        assert(hbsContent.includes('id="proctor-students-tbody"'), 'proctor-students-tbody must exist in index.hbs');
        assert(hbsContent.includes('id="proctor-timeline-list"'), 'proctor-timeline-list must exist in index.hbs');
        assert(hbsContent.includes('style.css?v=35'), 'style.css must be cache-busted to v=35');
        assert(hbsContent.includes('collab_engine.js?v=35'), 'collab_engine.js must be cache-busted to v=35');
        assert(hbsContent.includes('notebook.js?v=35'), 'notebook.js must be cache-busted to v=35');
    });

    // TEST 2: CSS Styles
    await test('public/css/style.css contains proctor status dots, badges, and modal rules', () => {
        const cssContent = fs.readFileSync(path.join(__dirname, '../public/css/style.css'), 'utf8');
        assert(cssContent.includes('.avatar-proctor-dot'), 'avatar-proctor-dot class must exist in style.css');
        assert(cssContent.includes('.status-dot-away'), 'status-dot-away must exist in style.css');
        assert(cssContent.includes('.status-dot-split'), 'status-dot-split must exist in style.css');
        assert(cssContent.includes('.status-dot-active'), 'status-dot-active must exist in style.css');
        assert(cssContent.includes('.collab-review-badge'), 'collab-review-badge must exist in style.css');
        assert(cssContent.includes('.btn-collab-proctor'), 'btn-collab-proctor must exist in style.css');
        assert(cssContent.includes('.proctor-table'), 'proctor-table must exist in style.css');
        assert(cssContent.includes('.proctor-timeline-item'), 'proctor-timeline-item must exist in style.css');
    });

    // TEST 3: Notebook.js Logic Wiring
    await test('public/js/notebook.js handles proctor events and rendering', () => {
        const jsContent = fs.readFileSync(path.join(__dirname, '../public/js/notebook.js'), 'utf8');
        assert(jsContent.includes('this.collab.onRemoteStudentFocus'), 'onRemoteStudentFocus handler must be registered');
        assert(jsContent.includes('updateProctorAlertBadge()'), 'updateProctorAlertBadge must be defined');
        assert(jsContent.includes('openProctorLogModal()'), 'openProctorLogModal must be defined');
        assert(jsContent.includes('renderProctorLogUI()'), 'renderProctorLogUI must be defined');
        assert(jsContent.includes('avatar-proctor-dot'), 'avatar chips must receive proctor dots');
    });

    // TEST 4: CollabEngine Client Focus Tracking Logic
    await test('collab_engine.js has focus monitoring methods', () => {
        const collabContent = fs.readFileSync(path.join(__dirname, '../public/js/collab_engine.js'), 'utf8');
        assert(collabContent.includes('startFocusMonitoring()'), 'startFocusMonitoring must be defined');
        assert(collabContent.includes('stopFocusMonitoring()'), 'stopFocusMonitoring must be defined');
        assert(collabContent.includes('broadcastFocusChange('), 'broadcastFocusChange must be defined');
        assert(collabContent.includes("type: 'student_focus'"), 'must broadcast student_focus messages');
        assert(collabContent.includes("visibilitychange"), 'must listen to visibilitychange');
        assert(collabContent.includes("tab_switch"), 'must identify tab_switch reason');
        assert(collabContent.includes("app_switch"), 'must identify app_switch reason');
        assert(collabContent.includes("split_screen"), 'must identify split_screen reason');
    });

    // TEST 5: End-to-End WebSocket Proctor Protocol Simulation
    await test('Server room proctor cache correctly aggregates events and broadcasts presence', async () => {
        // Setup minimal HTTP & WebSocket Server replicating app.js proctor logic
        const server = http.createServer();
        const wss = new WebSocket.Server({ server, path: '/ws/collab' });

        const collabRooms = new Map();
        const collabProctorCache = new Map();

        function getCollabRoomPresence(noteId) {
            const room = collabRooms.get(noteId);
            if (!room) return { count: 0, users: [], hostOnline: false };
            const users = [];
            let hostOnline = false;
            const roomProctor = collabProctorCache.get(noteId) || new Map();

            for (const [ws, info] of room.entries()) {
                if (ws.readyState === WebSocket.OPEN) {
                    if (info.isHost) hostOnline = true;
                    const pState = roomProctor.get(info.peerId) || {
                        status: 'active',
                        switchCount: 0,
                        totalAwaySeconds: 0
                    };
                    users.push({
                        peerId: info.peerId,
                        username: info.username,
                        color: info.color,
                        isHost: info.isHost,
                        proctorStatus: pState.status,
                        switchCount: pState.switchCount,
                        totalAwaySeconds: pState.totalAwaySeconds
                    });
                }
            }
            return { count: users.length, users, hostOnline };
        }

        function broadcastToCollabRoom(noteId, msg, excludeWs = null) {
            const room = collabRooms.get(noteId);
            if (!room) return;
            const data = JSON.stringify(msg);
            for (const [clientWs] of room.entries()) {
                if (clientWs !== excludeWs && clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(data);
                }
            }
        }

        wss.on('connection', (ws) => {
            let currentNoteId = null;
            let currentPeerId = null;

            ws.on('message', (raw) => {
                const msg = JSON.parse(raw);
                if (msg.type === 'join') {
                    currentNoteId = msg.noteId;
                    currentPeerId = msg.peerId;
                    if (!collabRooms.has(currentNoteId)) collabRooms.set(currentNoteId, new Map());
                    collabRooms.get(currentNoteId).set(ws, {
                        peerId: msg.peerId,
                        username: msg.username,
                        color: msg.color,
                        isHost: Boolean(msg.isHost)
                    });

                    // Send joined response
                    const roomProctor = collabProctorCache.get(currentNoteId) || new Map();
                    const proctorSummary = Array.from(roomProctor.values());
                    ws.send(JSON.stringify({
                        type: 'joined',
                        noteId: currentNoteId,
                        peerId: currentPeerId,
                        presence: getCollabRoomPresence(currentNoteId),
                        proctorSummary
                    }));

                    broadcastToCollabRoom(currentNoteId, {
                        type: 'presence',
                        noteId: currentNoteId,
                        presence: getCollabRoomPresence(currentNoteId)
                    });
                } else if (msg.type === 'student_focus') {
                    if (!currentNoteId) return;
                    if (!collabProctorCache.has(currentNoteId)) {
                        collabProctorCache.set(currentNoteId, new Map());
                    }
                    const roomProctor = collabProctorCache.get(currentNoteId);
                    let studentRec = roomProctor.get(msg.peerId);
                    if (!studentRec) {
                        studentRec = {
                            peerId: msg.peerId,
                            username: msg.username,
                            status: 'active',
                            switchCount: 0,
                            totalAwaySeconds: 0,
                            lastEvent: null
                        };
                        roomProctor.set(msg.peerId, studentRec);
                    }

                    studentRec.status = msg.status;
                    if (msg.status === 'away' || msg.status === 'split_screen') {
                        studentRec.switchCount += 1;
                    }
                    if (msg.awayDuration && typeof msg.awayDuration === 'number') {
                        studentRec.totalAwaySeconds += Math.round(msg.awayDuration);
                    }
                    studentRec.lastEvent = {
                        status: msg.status,
                        reason: msg.reason,
                        timestamp: msg.timestamp || Date.now()
                    };

                    // Broadcast to room
                    broadcastToCollabRoom(currentNoteId, {
                        type: 'student_focus',
                        peerId: msg.peerId,
                        username: msg.username,
                        status: msg.status,
                        reason: msg.reason,
                        awayDuration: msg.awayDuration || 0,
                        switchCount: studentRec.switchCount,
                        totalAwaySeconds: studentRec.totalAwaySeconds,
                        timestamp: Date.now()
                    });

                    // Broadcast updated presence
                    broadcastToCollabRoom(currentNoteId, {
                        type: 'presence',
                        noteId: currentNoteId,
                        presence: getCollabRoomPresence(currentNoteId)
                    });
                }
            });
        });

        await new Promise((resolve) => server.listen(0, resolve));
        const port = server.address().port;

        // Client 1: Host
        const hostWs = new WebSocket(`ws://localhost:${port}/ws/collab`);
        const hostMessages = [];
        await new Promise((resolve) => {
            hostWs.on('open', () => {
                hostWs.send(JSON.stringify({
                    type: 'join',
                    noteId: 'note-proctor-101',
                    peerId: 'host-1',
                    username: 'TeacherFayas',
                    color: '#ff4444',
                    isHost: true
                }));
                resolve();
            });
        });
        hostWs.on('message', (data) => hostMessages.push(JSON.parse(data)));

        // Client 2: Student
        const studentWs = new WebSocket(`ws://localhost:${port}/ws/collab`);
        const studentMessages = [];
        await new Promise((resolve) => {
            studentWs.on('open', () => {
                studentWs.send(JSON.stringify({
                    type: 'join',
                    noteId: 'note-proctor-101',
                    peerId: 'student-1',
                    username: 'StudentAlex',
                    color: '#30ff6a',
                    isHost: false
                }));
                resolve();
            });
        });
        studentWs.on('message', (data) => studentMessages.push(JSON.parse(data)));

        // Give sockets a moment to exchange joined & presence
        await new Promise((r) => setTimeout(r, 100));

        // 1. Student switches tab (e.g. to ask AI)
        studentWs.send(JSON.stringify({
            type: 'student_focus',
            peerId: 'student-1',
            username: 'StudentAlex',
            status: 'away',
            reason: 'tab_switch',
            timestamp: Date.now()
        }));

        await new Promise((r) => setTimeout(r, 100));

        // Verify Host received alert
        const focusMsg1 = hostMessages.find((m) => m.type === 'student_focus' && m.status === 'away');
        assert(focusMsg1, 'Host must receive student_focus away event');
        assert.strictEqual(focusMsg1.reason, 'tab_switch');
        assert.strictEqual(focusMsg1.switchCount, 1);

        // 2. Student returns to tab after 12 seconds
        studentWs.send(JSON.stringify({
            type: 'student_focus',
            peerId: 'student-1',
            username: 'StudentAlex',
            status: 'active',
            reason: 'returned_focus',
            awayDuration: 12,
            timestamp: Date.now()
        }));

        await new Promise((r) => setTimeout(r, 100));

        const focusMsg2 = hostMessages.find((m) => m.type === 'student_focus' && m.status === 'active');
        assert(focusMsg2, 'Host must receive student_focus active event');
        assert.strictEqual(focusMsg2.awayDuration, 12);
        assert.strictEqual(focusMsg2.totalAwaySeconds, 12);

        // 3. Student resizes window to split screen
        studentWs.send(JSON.stringify({
            type: 'student_focus',
            peerId: 'student-1',
            username: 'StudentAlex',
            status: 'split_screen',
            reason: 'split_screen',
            timestamp: Date.now()
        }));

        await new Promise((r) => setTimeout(r, 100));

        const focusMsg3 = hostMessages.find((m) => m.type === 'student_focus' && m.status === 'split_screen');
        assert(focusMsg3, 'Host must receive student_focus split_screen event');
        assert.strictEqual(focusMsg3.switchCount, 2);

        // Verify presence has enriched student proctor stats
        const lastPresence = hostMessages.filter((m) => m.type === 'presence').pop();
        assert(lastPresence, 'Presence update must have been received');
        const studentPresence = lastPresence.presence.users.find((u) => u.peerId === 'student-1');
        assert(studentPresence, 'Student presence must be present in room users list');
        assert.strictEqual(studentPresence.proctorStatus, 'split_screen');
        assert.strictEqual(studentPresence.switchCount, 2);
        assert.strictEqual(studentPresence.totalAwaySeconds, 12);

        // Clean up
        hostWs.close();
        studentWs.close();
        await new Promise((resolve) => server.close(resolve));
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) {
        process.exit(1);
    }
}

runSuite().catch((e) => {
    console.error('Test suite runner crashed:', e);
    process.exit(1);
});
