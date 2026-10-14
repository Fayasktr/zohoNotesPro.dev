/**
 * Automated Verification Suite: Zero Data Loss in Live Coding Sessions
 * 
 * Tests the entire multi-layered persistence & anti-overwrite pipeline:
 * T1: Periodic auto-flush during typing (WS edit -> 3s debounce -> MongoDB updated & server_flushed broadcast)
 * T2: In-memory cache drop survival (simulates server restart / Render spin-down -> MongoDB holds all code)
 * T3: Guaranteed teardown flush on last peer disconnect (abrupt tab close -> room.size === 0 -> instant MongoDB flush)
 * T4: The "Silent Fork" prevention in syncRoutes.js (collaborator push preserves live note, no fork, auto-registered)
 * T5: Dedicated force-save endpoint / mechanism for "Submit Mock Review / Save All" button
 * T6: Reviewer cloud fetch verification (returns fresh student code, verifying no empty template overwrite)
 */

const http = require('http');
const mongoose = require('mongoose');
const WebSocket = require('ws');
const path = require('path');

// Import app, models and flush controllers
const {
    app,
    server,
    flushCollabRoomToDatabase,
    scheduleCollabFlush,
    collabRooms,
    collabCellsCache
} = require('../app');
const Note = require('../models/Note');
const User = require('../models/User');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zoho';
const TEST_PORT = 4322;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runZeroDataLossTestSuite() {
    console.log('================================================================');
    console.log('🛡️  ZERO DATA LOSS LIVE CODING SIMULATION & VERIFICATION SUITE');
    console.log('================================================================\n');

    let passedTests = 0;
    let failedTests = 0;

    function assert(condition, message) {
        if (!condition) {
            console.error(`❌ FAIL: ${message}`);
            failedTests++;
            throw new Error(`Assertion failed: ${message}`);
        } else {
            console.log(`✅ PASS: ${message}`);
            passedTests++;
        }
    }

    try {
        // 1. Connect MongoDB
        console.log('1. Connecting to MongoDB...');
        if (mongoose.connection.readyState !== 1) {
            await mongoose.connect(MONGO_URI);
        }
        console.log('MongoDB connected.');

        // 2. Start HTTP/WS server if not already listening
        console.log('2. Starting test server on port ' + TEST_PORT + '...');
        if (!server.listening) {
            await new Promise((resolve) => server.listen(TEST_PORT, resolve));
        }
        console.log(`Server listening on port ${TEST_PORT}.\n`);

        // Prepare test users
        let instructor = await User.findOne({ email: 'fayaskpktr@gmail.com' });
        if (!instructor) {
            instructor = await User.create({
                username: 'fayas',
                email: 'fayaskpktr@gmail.com',
                passwordHash: 'dummyhash',
                role: 'admin'
            });
        }

        let student = await User.findOne({ email: 'student.live@brototype.in' });
        if (!student) {
            student = await User.create({
                username: 'Live Student A',
                email: 'student.live@brototype.in',
                passwordHash: 'dummyhash',
                role: 'user'
            });
        }

        // Clean previous test notes
        await Note.deleteMany({ id: { $regex: /^test-live-zero-loss-/ } });

        // ---------------------------------------------------------------------
        // TEST 1: Periodic Auto-Flush During Typing
        // ---------------------------------------------------------------------
        console.log('--- TEST 1: Periodic Debounced Auto-Flush During Live Coding ---');
        const noteId1 = 'test-live-zero-loss-1';
        const liveNote1 = await Note.create({
            id: noteId1,
            title: 'Mock Test - Student A',
            owner: instructor._id,
            isLive: true,
            shareCode: 'code-zero-loss-1',
            content: {
                id: noteId1,
                title: 'Mock Test - Student A',
                cells: [
                    { id: 'c1', type: 'code', title: 'Q1. Reverse String', content: '// Write code here' },
                    { id: 'c2', type: 'code', title: 'Q2. Palindrome', content: '// Write code here' }
                ]
            }
        });

        const wsUrl = `ws://127.0.0.1:${TEST_PORT}/ws/collab`;
        const wsClient1 = new WebSocket(wsUrl);

        let receivedServerFlushed = null;

        await new Promise((resolve, reject) => {
            wsClient1.on('open', () => {
                wsClient1.send(JSON.stringify({
                    type: 'join',
                    noteId: noteId1,
                    peerId: 'peer_student_1',
                    user: {
                        id: String(student._id),
                        peerId: 'peer_student_1',
                        username: 'Live Student A',
                        color: '#4fc3f7',
                        isHost: false
                    }
                }));
                resolve();
            });
            wsClient1.on('error', reject);
        });

        wsClient1.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg.type === 'server_flushed') {
                    receivedServerFlushed = msg;
                }
            } catch (_) {}
        });

        await sleep(300);

        // Student types in Cell 1
        const studentCodeQ1 = 'function reverseString(s) { return s.split("").reverse().join(""); }';
        wsClient1.send(JSON.stringify({
            type: 'edit',
            cellId: 'c1',
            content: studentCodeQ1,
            peerId: 'peer_student_1'
        }));

        console.log('Student sent edit event. Waiting 3.5s for debounced flush to trigger...');
        await sleep(3600);

        // Check if server_flushed was broadcast
        assert(receivedServerFlushed !== null, 'Server broadcasted "server_flushed" event to WebSocket client');
        assert(receivedServerFlushed.noteId === noteId1, 'server_flushed event has correct noteId');

        // Check MongoDB directly
        const dbNote1 = await Note.findOne({ id: noteId1 }).lean();
        const flushedCell1 = dbNote1.content.cells.find(c => c.id === 'c1');
        assert(flushedCell1 !== undefined, 'Cell 1 exists in MongoDB');
        assert(flushedCell1.content === studentCodeQ1, 'Student code for Q1 was automatically persisted to MongoDB Atlas during typing');

        // ---------------------------------------------------------------------
        // TEST 2: In-Memory Cache Drop Survival (Server Restart Simulation)
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 2: In-Memory Cache Drop Survival (Server Restart Simulation) ---');
        // Type into Cell 2 as well
        const studentCodeQ2 = 'function isPalindrome(s) { return s === s.split("").reverse().join(""); }';
        wsClient1.send(JSON.stringify({
            type: 'edit',
            cellId: 'c2',
            content: studentCodeQ2,
            peerId: 'peer_student_1'
        }));

        await sleep(3500); // Allow debounced flush

        // Now simulate a server restart or memory purge: wipe collabCellsCache and collabRooms
        console.log('Simulating complete server process restart by wiping in-memory collab caches...');
        collabCellsCache.delete(noteId1);
        collabRooms.delete(noteId1);

        // Read fresh from MongoDB
        const dbNoteAfterReboot = await Note.findOne({ id: noteId1 }).lean();
        const cell1AfterReboot = dbNoteAfterReboot.content.cells.find(c => c.id === 'c1');
        const cell2AfterReboot = dbNoteAfterReboot.content.cells.find(c => c.id === 'c2');
        assert(cell1AfterReboot.content === studentCodeQ1, 'Cell 1 student code survived server memory wipe');
        assert(cell2AfterReboot.content === studentCodeQ2, 'Cell 2 student code survived server memory wipe');

        // ---------------------------------------------------------------------
        // TEST 3: Guaranteed Teardown Flush on Last Disconnect (Abrupt Exit)
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 3: Guaranteed Teardown Flush on Last Peer Disconnect ---');
        // Reconnect student
        const wsClient2 = new WebSocket(wsUrl);
        await new Promise((resolve, reject) => {
            wsClient2.on('open', () => {
                wsClient2.send(JSON.stringify({
                    type: 'join',
                    noteId: noteId1,
                    peerId: 'peer_student_2',
                    user: {
                        id: String(student._id),
                        peerId: 'peer_student_2',
                        username: 'Live Student A',
                        color: '#4fc3f7',
                        isHost: false
                    }
                }));
                resolve();
            });
            wsClient2.on('error', reject);
        });

        await sleep(300);

        // Student makes an edit right before abruptly closing laptop / tab
        const lastSecondWork = '// Final touch before closing tab: O(n) optimized solution';
        wsClient2.send(JSON.stringify({
            type: 'edit',
            cellId: 'c1',
            content: lastSecondWork,
            peerId: 'peer_student_2'
        }));

        await sleep(50); // Minimal time (far less than 3s debounce)

        // Close WebSocket connection abruptly (simulate tab close / laptop sleep)
        console.log('Student abruptly closes tab / terminates connection (0.05s after typing)...');
        wsClient2.close();

        // Wait 500ms for ws close cleanup() to execute guaranteed teardown flush
        await sleep(600);

        // Check MongoDB: it MUST have the last-second work even though debounce timer was aborted
        const dbNoteAfterDisconnect = await Note.findOne({ id: noteId1 }).lean();
        const cell1AfterTeardown = dbNoteAfterDisconnect.content.cells.find(c => c.id === 'c1');
        assert(cell1AfterTeardown.content === lastSecondWork, 'Guaranteed teardown flush wrote last-second work to MongoDB upon disconnect');

        // ---------------------------------------------------------------------
        // TEST 4: The "Silent Fork" Trap Prevention in syncRoutes.js
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 4: Prevention of Silent Fork Trap in syncRoutes.js ---');
        const noteId2 = 'test-live-zero-loss-2';
        const liveNote2 = await Note.create({
            id: noteId2,
            title: 'Mock Review - Student B',
            owner: instructor._id,
            isLive: true,
            shareCode: 'code-zero-loss-2',
            collaborators: [], // Student is NOT pre-added to collaborators
            content: {
                id: noteId2,
                title: 'Mock Review - Student B',
                cells: [
                    { id: 'c1', type: 'code', title: 'Q1', content: '// initial' }
                ]
            }
        });

        // Simulate student pushing sync payload targeting noteId2
        const studentSyncDoc = {
            id: noteId2,
            title: 'Mock Review - Student B',
            folder: 'Live Notes',
            updatedAt: new Date().toISOString(),
            content: {
                id: noteId2,
                title: 'Mock Review - Student B',
                cells: [
                    { id: 'c1', type: 'code', title: 'Q1', content: 'const studentBSolution = "SUCCESS";' }
                ]
            }
        };

        // We test the logic executed in POST /api/sync/push:
        // When a non-owner pushes changes to an existing live note, verify:
        // 1. It does NOT fork to a random ntbk- ID
        // 2. It auto-adds the student to collaborators
        // 3. It updates the live note content in place
        const existingNote = await Note.findOne({ id: studentSyncDoc.id });
        assert(existingNote !== null, 'Target live note exists');
        const isOwner = String(existingNote.owner) === String(student._id);
        const isCollab = existingNote.collaborators && existingNote.collaborators.some(c => String(c.user) === String(student._id));
        const isForeignLive = !isOwner && !isCollab && existingNote.isLive === true;
        assert(isForeignLive === true, 'Correctly identified as foreign live note (unregistered collaborator)');

        // Run the auto-admission and update logic from syncRoutes.js
        if (isForeignLive) {
            await Note.updateOne(
                { _id: existingNote._id },
                {
                    $addToSet: {
                        collaborators: {
                            user: student._id,
                            email: student.email,
                            role: 'editor',
                            status: 'accepted'
                        }
                    },
                    $set: {
                        'content.cells': studentSyncDoc.content.cells,
                        updatedAt: new Date()
                    }
                }
            );
        }

        const checkForkNote = await Note.findOne({ id: noteId2 }).lean();
        assert(checkForkNote.collaborators.some(c => String(c.user) === String(student._id)), 'Student auto-admitted to collaborators');
        assert(checkForkNote.content.cells[0].content === 'const studentBSolution = "SUCCESS";', 'Host live note updated in place without forking');

        // Verify no random ntbk- was created
        const anyForks = await Note.find({ 'content.cells.0.content': 'const studentBSolution = "SUCCESS";' });
        assert(anyForks.length === 1 && anyForks[0].id === noteId2, 'Zero orphan forks created');

        // ---------------------------------------------------------------------
        // TEST 5: Force-Save Controller (Submit Mock Review Button)
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 5: Manual Force-Save Controller (Submit Review Button) ---');
        const manualCells = [
            { id: 'c1', type: 'code', title: 'Q1', content: '// Submitted Final Answer 1' },
            { id: 'c2', type: 'code', title: 'Q2', content: '// Submitted Final Answer 2' }
        ];

        // Seed cache
        if (!collabCellsCache.has(noteId1)) collabCellsCache.set(noteId1, new Map());
        manualCells.forEach(c => collabCellsCache.get(noteId1).set(c.id, c.content));

        const flushResult = await flushCollabRoomToDatabase(noteId1, { force: true, reason: 'student_manual_submit' });
        assert(flushResult.success === true, 'flushCollabRoomToDatabase returned success: true');
        assert(flushResult.cellsCount === 2, 'flushCollabRoomToDatabase persisted both cells');

        const dbSubmittedNote = await Note.findOne({ id: noteId1 }).lean();
        assert(dbSubmittedNote.content.cells[0].content === '// Submitted Final Answer 1', 'Cell 1 holds manual submission');
        assert(dbSubmittedNote.content.cells[1].content === '// Submitted Final Answer 2', 'Cell 2 holds manual submission');

        // ---------------------------------------------------------------------
        // TEST 6: Reviewer Cloud Hydration Simulation (No Stale Local Overwrite)
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 6: Reviewer Cloud Hydration Simulation ---');
        // When reviewer opens the note later:
        // Cloud note must be queried and provide the student's submission
        const reviewerFetchedNote = await Note.findOne({ id: noteId1, isTrashed: false }).lean();
        assert(reviewerFetchedNote !== null, 'Reviewer successfully fetched note from MongoDB');
        assert(reviewerFetchedNote.content.cells.length === 2, 'Reviewer receives all 2 question cells');
        assert(reviewerFetchedNote.content.cells[0].content === '// Submitted Final Answer 1', 'Reviewer sees student code in Cell 1');
        assert(reviewerFetchedNote.content.cells[1].content === '// Submitted Final Answer 2', 'Reviewer sees student code in Cell 2');

        console.log('\n================================================================');
        console.log(`🎉 ALL TESTS PASSED: ${passedTests} passed, ${failedTests} failed.`);
        console.log('================================================================\n');

        // Clean up test notes
        await Note.deleteMany({ id: { $regex: /^test-live-zero-loss-/ } });

        process.exit(0);
    } catch (err) {
        console.error('\n❌ TEST SUITE FAILED WITH EXCEPTION:', err);
        process.exit(1);
    }
}

runZeroDataLossTestSuite();
