const http = require('http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
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

async function runTests() {
    console.log('🧪 Starting Collaborative Live Sharing Test Suite...\n');

    await mongoose.connect('mongodb://localhost:27017/zoho');

    try {
        const hashedPassword = await bcrypt.hash('password123', 10);
        const creatorEmail = `creator_${Date.now()}@test.com`;
        const joinerEmail = `joiner_${Date.now()}@test.com`;

        const creator = await User.create({
            username: 'CollabCreator',
            email: creatorEmail,
            password: hashedPassword
        });

        const joiner = await User.create({
            username: 'CollabJoiner',
            email: joinerEmail,
            password: hashedPassword
        });

        // 1. Create a Note by Creator
        const noteId = `ntbk-collab-${Date.now()}`;
        const note = await Note.create({
            id: noteId,
            owner: creator._id,
            authorName: creator.username,
            title: 'Live Pair Programming Demo',
            folder: 'root',
            cells: [{ id: 'cell-1', type: 'code', lang: 'javascript', content: 'console.log("hello collab");' }]
        });

        console.log('  ✅ Note created with auto-generated shareCode:', note.shareCode);
        if (!note.shareCode || !note.shareCode.startsWith('collab-')) {
            throw new Error(`Expected shareCode to start with collab-, got: ${note.shareCode}`);
        }

        // 2. Unauthenticated user visits /note/join/:shareCode -> Should redirect to /login
        const unauthRes = await request(`/note/join/${note.shareCode}`);
        console.log('  ✅ Unauthenticated access status:', unauthRes.status, '(Expect 302)');
        if (unauthRes.status !== 302) {
            throw new Error(`Expected 302 redirect for unauthenticated user, got ${unauthRes.status}`);
        }
        const redirectLoc = unauthRes.headers['location'];
        console.log('  ✅ Redirect location:', redirectLoc);
        if (!redirectLoc.includes('/login') || !redirectLoc.includes('notice=')) {
            throw new Error(`Expected redirect to /login with notice query, got: ${redirectLoc}`);
        }

        // Extract cookie from redirect
        let currentCookie = unauthRes.headers['set-cookie']
            ? unauthRes.headers['set-cookie'][0].split(';')[0]
            : '';

        // Fetch login page to get CSRF token
        const loginPageRes = await request('/login', {
            headers: { 'Cookie': currentCookie }
        });
        if (loginPageRes.headers['set-cookie']) {
            currentCookie = loginPageRes.headers['set-cookie'][0].split(';')[0];
        }
        const csrfMatch = loginPageRes.body.match(/name="_csrf"\s+value="([^"]+)"/);
        if (!csrfMatch) throw new Error('Could not find CSRF token on login page');
        const csrfToken = csrfMatch[1];

        // 3. User logs in (simulate session with cookie)
        const loginRes = await request('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': currentCookie
            },
            body: `email=${encodeURIComponent(joinerEmail)}&password=password123&_csrf=${encodeURIComponent(csrfToken)}`
        });

        const sessionCookie = loginRes.headers['set-cookie']
            ? loginRes.headers['set-cookie'][0].split(';')[0]
            : currentCookie;

        console.log('  ✅ Login response status:', loginRes.status, '(Expect 302)');

        // 4. Authenticated Joiner visits /note/join/:shareCode
        const authJoinRes = await request(`/note/join/${note.shareCode}`, {
            headers: { 'Cookie': sessionCookie }
        });

        console.log('  ✅ Authenticated join status:', authJoinRes.status, '(Expect 302)');
        const joinedRedirect = authJoinRes.headers['location'];
        console.log('  ✅ Joined redirect target:', joinedRedirect, `(Expect /?noteId=${note.id})`);
        if (joinedRedirect !== `/?noteId=${note.id}`) {
            throw new Error(`Expected redirect to /?noteId=${note.id}, got ${joinedRedirect}`);
        }

        // 5. Verify Note in DB now has Joiner in collaborators
        const updatedNote = await Note.findOne({ id: note.id });
        const hasCollaborator = updatedNote.collaborators.some(c => c.user && c.user.toString() === joiner._id.toString());
        console.log('  ✅ Note has joiner in collaborators array:', hasCollaborator);
        if (!hasCollaborator) {
            throw new Error('Joiner user was not added to note.collaborators');
        }

        // 6. Joiner fetches /api/notes/shared
        const sharedNotesRes = await request('/api/notes/shared', {
            headers: { 'Cookie': sessionCookie }
        });
        console.log('  ✅ /api/notes/shared status:', sharedNotesRes.status, '(Expect 200)');
        const sharedNotes = JSON.parse(sharedNotesRes.body);
        console.log('  ✅ Shared notes count:', sharedNotes.length);
        const sharedNoteItem = sharedNotes.find(n => n.id === note.id);
        if (!sharedNoteItem) {
            throw new Error('Shared note not found in /api/notes/shared response');
        }
        console.log('  ✅ Shared note details: authorName =', sharedNoteItem.authorName, ', title =', sharedNoteItem.title);
        if (sharedNoteItem.authorName !== 'CollabCreator') {
            throw new Error(`Expected authorName to be CollabCreator, got: ${sharedNoteItem.authorName}`);
        }

        // 7. Joiner requests /api/notes/:noteId/share-code
        const shareCodeRes = await request(`/api/notes/${note.id}/share-code`, {
            method: 'POST',
            headers: {
                'Cookie': sessionCookie,
                'CSRF-Token': csrfToken
            }
        });
        console.log('  ✅ /api/notes/:id/share-code status:', shareCodeRes.status, '(Expect 200)');
        const shareCodeData = JSON.parse(shareCodeRes.body);
        console.log('  ✅ shareUrl returned:', shareCodeData.shareUrl);
        if (!shareCodeData.shareUrl || !shareCodeData.shareUrl.includes(`/note/join/${note.shareCode}`)) {
            throw new Error(`Invalid shareUrl: ${shareCodeData.shareUrl}`);
        }

        // 8. Test home page injection with ?noteId=
        const homePageRes = await request(`/?noteId=${note.id}`, {
            headers: { 'Cookie': sessionCookie }
        });
        console.log('  ✅ /?noteId= status:', homePageRes.status, '(Expect 200)');
        const hasInitialNoteId = homePageRes.body.includes(note.id);
        console.log('  ✅ Home page injected INITIAL_NOTE_ID:', hasInitialNoteId);
        if (!hasInitialNoteId) {
            throw new Error('Home page did not render INITIAL_NOTE_ID');
        }

        // Clean up test records
        await Note.deleteOne({ id: note.id });
        await User.deleteMany({ _id: { $in: [creator._id, joiner._id] } });

        console.log('\n🎉 ALL COLLABORATION INTEGRATION TESTS PASSED 100%!\n');
    } finally {
        await mongoose.disconnect();
    }
}

runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
