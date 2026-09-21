const http = require('http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const Note = require('../models/Note');
const User = require('../models/User');

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

async function runTests() {
    console.log('🧪 Running Live Notes Access & Normal Isolation Verification Suite...\n');

    await mongoose.connect('mongodb://localhost:27017/zoho');

    try {
        const hashedPassword = await bcrypt.hash('secret123', 10);
        const hostEmail = `host_${Date.now()}@test.com`;
        const guestEmail = `guest_${Date.now()}@test.com`;

        const hostUser = await User.create({
            username: 'LiveHostUser',
            email: hostEmail,
            password: hashedPassword
        });

        const guestUser = await User.create({
            username: 'LiveGuestUser',
            email: guestEmail,
            password: hashedPassword
        });

        const hostAuth = await loginUser(hostEmail, 'secret123');
        const guestAuth = await loginUser(guestEmail, 'secret123');

        // Test 1: Template Verification - No live broadcast button in normal note header
        console.log('1. Verifying index.hbs template has no live buttons on normal notes...');
        const indexHbs = fs.readFileSync(path.join(__dirname, '../views/index.hbs'), 'utf8');
        if (indexHbs.includes('id="btn-open-live-modal"')) {
            throw new Error('FAILED: #btn-open-live-modal is still present in views/index.hbs');
        }
        console.log('  ✅ views/index.hbs does NOT contain #btn-open-live-modal');

        // Test 2: Host creates normal note
        console.log('2. Creating normal notebook...');
        const normNoteRes = await request('/api/notebooks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': hostAuth.cookie,
                'CSRF-Token': hostAuth.csrfToken
            },
            body: JSON.stringify({
                id: `normal-nb-${Date.now()}`,
                title: 'Standard Normal Notebook',
                isLive: false,
                cells: [{ id: 'c-normal-1', type: 'code', lang: 'javascript', content: 'console.log("normal");' }]
            })
        });
        if (normNoteRes.status !== 200) {
            throw new Error(`Failed to create normal notebook: ${normNoteRes.status} ${normNoteRes.body}`);
        }
        console.log('  ✅ Normal notebook created successfully');

        // Test 3: Normal notes list excludes live notes
        const normalListRes = await request('/api/notebooks', {
            headers: { 'Cookie': hostAuth.cookie }
        });
        const normalList = JSON.parse(normalListRes.body);
        console.log('  ✅ /api/notebooks returned', normalList.length, 'notes (should all have isLive !== true)');
        for (const n of normalList) {
            if (n.isLive === true) {
                throw new Error(`FAILED: Normal note list contains live note ${n.id}`);
            }
        }

        // Test 4: Host creates dedicated Live Note via POST /api/notes/live
        console.log('3. Host creating dedicated Live Note...');
        const createLiveRes = await request('/api/notes/live', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': hostAuth.cookie,
                'CSRF-Token': hostAuth.csrfToken
            },
            body: JSON.stringify({
                title: 'Host Live Coding Room'
            })
        });
        if (createLiveRes.status !== 200) {
            throw new Error(`Failed to create live note: ${createLiveRes.status} ${createLiveRes.body}`);
        }
        const liveNote = JSON.parse(createLiveRes.body);
        console.log('  ✅ Live note created: id =', liveNote.id, ', shareCode =', liveNote.shareCode);
        if (!liveNote.isLive || !liveNote.shareCode || !liveNote.shareCode.startsWith('collab-')) {
            throw new Error(`FAILED: Invalid live note response ${JSON.stringify(liveNote)}`);
        }

        // Test 5: Host Live Notes listing
        const hostLiveNotesRes = await request('/api/notes/live', {
            headers: { 'Cookie': hostAuth.cookie }
        });
        const hostLiveNotes = JSON.parse(hostLiveNotesRes.body);
        const hostedItem = hostLiveNotes.hosted.find(n => n.id === liveNote.id);
        if (!hostedItem) {
            throw new Error('FAILED: Created live note not found in host hosted live notes');
        }
        console.log('  ✅ Live note found in host hosted section');

        // Test 6: Guest joins live note via /note/join/:shareCode
        console.log('4. Guest joining live note via link /note/join/' + liveNote.shareCode);
        const guestJoinRes = await request(`/note/join/${liveNote.shareCode}`, {
            headers: { 'Cookie': guestAuth.cookie }
        });
        if (guestJoinRes.status !== 302 || guestJoinRes.headers['location'] !== `/?noteId=${liveNote.id}`) {
            throw new Error(`FAILED: Guest join redirect unexpected: ${guestJoinRes.status} -> ${guestJoinRes.headers['location']}`);
        }
        console.log('  ✅ Guest successfully redirected to /?noteId=' + liveNote.id);

        // Test 7: Guest checks /api/notes/live (Joined section)
        console.log('5. Guest fetching /api/notes/live...');
        const guestLiveRes = await request('/api/notes/live', {
            headers: { 'Cookie': guestAuth.cookie }
        });
        const guestLiveNotes = JSON.parse(guestLiveRes.body);
        const joinedLiveItem = guestLiveNotes.joined.find(n => n.id === liveNote.id);
        if (!joinedLiveItem) {
            throw new Error('FAILED: Guest did not receive live note in joined array of /api/notes/live');
        }
        console.log('  ✅ Guest has live note in joined list with authorName =', joinedLiveItem.authorName);
        if (joinedLiveItem.authorName !== 'LiveHostUser') {
            throw new Error(`FAILED: Expected authorName 'LiveHostUser', got '${joinedLiveItem.authorName}'`);
        }

        // Test 8: Guest fetches full notebook content via /api/notebooks/:id
        console.log('6. Guest fetching notebook content via /api/notebooks/' + liveNote.id);
        const guestGetNoteRes = await request(`/api/notebooks/${liveNote.id}`, {
            headers: { 'Cookie': guestAuth.cookie }
        });
        if (guestGetNoteRes.status !== 200) {
            throw new Error(`FAILED: Guest cannot read notebook: ${guestGetNoteRes.status} ${guestGetNoteRes.body}`);
        }
        const guestNoteContent = JSON.parse(guestGetNoteRes.body);
        console.log('  ✅ Guest received notebook content: isLive =', guestNoteContent.isLive, ', isOwner =', guestNoteContent.isOwner, ', cells count =', guestNoteContent.cells?.length);
        if (!guestNoteContent.isLive) {
            throw new Error('FAILED: guestNoteContent.isLive is false or missing');
        }
        if (guestNoteContent.isOwner !== false) {
            throw new Error('FAILED: guestNoteContent.isOwner should be false for guest');
        }
        if (!Array.isArray(guestNoteContent.cells) || guestNoteContent.cells.length === 0) {
            throw new Error('FAILED: guestNoteContent has no cells');
        }

        // Test 9: Guest pulls note via /api/sync/pull
        console.log('7. Guest pulling note content via /api/sync/pull...');
        const guestPullRes = await request('/api/sync/pull', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': guestAuth.cookie,
                'CSRF-Token': guestAuth.csrfToken
            },
            body: JSON.stringify({ noteIds: [liveNote.id] })
        });
        if (guestPullRes.status !== 200) {
            throw new Error(`FAILED: /api/sync/pull failed: ${guestPullRes.status} ${guestPullRes.body}`);
        }
        const pullData = JSON.parse(guestPullRes.body);
        const pulledNote = (pullData.notes && pullData.notes[0]);
        if (!pulledNote || pulledNote.id !== liveNote.id) {
            throw new Error('FAILED: /api/sync/pull did not return live note');
        }
        console.log('  ✅ Pulled note details: isLive =', pulledNote.isLive, ', shareCode =', pulledNote.shareCode);
        if (!pulledNote.isLive || !pulledNote.shareCode) {
            throw new Error('FAILED: Pulled note missing isLive or shareCode');
        }

        // Clean up test data
        await Note.deleteMany({ id: { $in: [liveNote.id] } });
        await User.deleteMany({ _id: { $in: [hostUser._id, guestUser._id] } });

        console.log('\n🎉 ALL LIVE ACCESS & NORMAL ISOLATION VERIFICATIONS PASSED!\n');
    } finally {
        await mongoose.disconnect();
    }
}

runTests().catch(err => {
    console.error('\n❌ Suite execution failed:', err);
    process.exit(1);
});
