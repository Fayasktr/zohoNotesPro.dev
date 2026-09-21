const http = require('http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const assert = require('assert');
const User = require('../models/User');
const Note = require('../models/Note');

function request(path, options = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: 4321,
            path,
            method: options.method || 'GET',
            headers: options.headers || {}
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
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
    console.log('🧪 Starting Host-Only Live Link Deletion Security Tests...');

    await mongoose.connect('mongodb://localhost:27017/zoho');

    const timestamp = Date.now();
    const hashedPassword = await bcrypt.hash('secret123', 10);
    const hostEmail = `host_only_${timestamp}@test.com`;
    const guestEmail = `guest_only_${timestamp}@test.com`;

    const hostUser = await User.create({ username: 'StrictHostUser', email: hostEmail, password: hashedPassword });
    const guestUser = await User.create({ username: 'StrictGuestUser', email: guestEmail, password: hashedPassword });

    console.log('1. Logging in Host and Guest...');
    const hostAuth = await loginUser(hostEmail, 'secret123');
    const guestAuth = await loginUser(guestEmail, 'secret123');
    console.log('  ✅ Users authenticated successfully');

    // 2. Host creates Live Note
    console.log('2. Host creating Live Note...');
    const createRes = await request('/api/notes/live', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': hostAuth.cookie,
            'CSRF-Token': hostAuth.csrfToken
        },
        body: JSON.stringify({ title: 'Host Protected Live Note' })
    });
    assert.strictEqual(createRes.status, 200, 'Create live note must return 200');
    const noteData = JSON.parse(createRes.body);
    const noteId = noteData.id;
    const shareCode = noteData.shareCode;
    console.log(`  ✅ Live note created: id=${noteId}, shareCode=${shareCode}`);

    // 3. Guest joins live note
    console.log('3. Guest joining live note via share code...');
    const joinRes = await request(`/note/join/${shareCode}`, {
        headers: { 'Cookie': guestAuth.cookie }
    });
    assert.strictEqual(joinRes.status, 302, 'Guest join should redirect');
    console.log('  ✅ Guest joined live note');

    // Verify Guest sees it in joined list
    const guestListRes = await request('/api/notes/live', {
        headers: { 'Cookie': guestAuth.cookie }
    });
    const guestList = JSON.parse(guestListRes.body);
    assert(guestList.joined.some(n => n.id === noteId), 'Note must appear in guest joined list');
    console.log('  ✅ Note verified in Guest joined list');

    // 4. Guest attempts to revoke host live link -> Expect 403 Forbidden!
    console.log('4. Guest attempting to revoke/delete the Host live link...');
    const guestRevokeRes = await request(`/api/notes/${noteId}/revoke-share`, {
        method: 'POST',
        headers: {
            'Cookie': guestAuth.cookie,
            'CSRF-Token': guestAuth.csrfToken
        }
    });
    console.log(`  Server response status for guest revoke: ${guestRevokeRes.status}`);
    assert.strictEqual(guestRevokeRes.status, 403, 'Guest revoke must be rejected with 403 Forbidden');
    const guestRevokeBody = JSON.parse(guestRevokeRes.body);
    assert(guestRevokeBody.error && guestRevokeBody.error.includes('Only the host can delete or revoke'), 'Expected forbidden error message');
    console.log('  ✅ Guest revoke attempt rejected with 403 Forbidden!');

    // 5. Verify the live note and share link are STILL completely active
    const dbNoteAfterGuestRevoke = await Note.findOne({ id: noteId });
    assert.strictEqual(dbNoteAfterGuestRevoke.isLive, true, 'Note must still be live');
    assert.strictEqual(dbNoteAfterGuestRevoke.shareCode, shareCode, 'shareCode must remain untouched');
    console.log('  ✅ Host live link remains completely active in database');

    // 6. Guest attempts to sync-push trashing the note -> Sync protection must strip isTrashed
    console.log('6. Guest attempting sync-push to trash or un-live host note...');
    const guestPushRes = await request('/api/sync/push', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': guestAuth.cookie,
            'CSRF-Token': guestAuth.csrfToken
        },
        body: JSON.stringify({
            batch: [{
                action: 'upsert',
                note: {
                    id: noteId,
                    title: 'Hacked Title',
                    isTrashed: true,
                    isLive: false,
                    shareCode: null,
                    updatedAt: new Date().toISOString()
                }
            }]
        })
    });
    assert.strictEqual(guestPushRes.status, 200, 'Sync push responded');
    const dbNoteAfterGuestPush = await Note.findOne({ id: noteId });
    assert.strictEqual(dbNoteAfterGuestPush.isTrashed, false, 'Guest cannot trash host note via sync push');
    assert.strictEqual(dbNoteAfterGuestPush.isLive, true, 'Guest cannot un-live host note via sync push');
    assert.strictEqual(dbNoteAfterGuestPush.shareCode, shareCode, 'Guest cannot clear shareCode via sync push');
    console.log('  ✅ Sync-push protection successfully prevented Guest from trashing or deactivating host note');

    // 7. Guest deletes the live note -> Only leaves/removes self
    console.log('7. Guest clicking delete on live note (should leave session, not delete note)...');
    const guestDelRes = await request(`/api/notes/live/${noteId}`, {
        method: 'DELETE',
        headers: {
            'Cookie': guestAuth.cookie,
            'CSRF-Token': guestAuth.csrfToken
        }
    });
    assert.strictEqual(guestDelRes.status, 200, 'Guest delete endpoint returns 200');
    const guestDelData = JSON.parse(guestDelRes.body);
    assert.strictEqual(guestDelData.action, 'removed', 'Action must be "removed" for guest');
    
    // Check DB: Note still exists, host still owns it, shareCode still exists!
    const dbNoteAfterGuestDel = await Note.findOne({ id: noteId });
    assert(dbNoteAfterGuestDel !== null, 'Note must NOT be deleted from DB by guest');
    assert.strictEqual(dbNoteAfterGuestDel.isLive, true, 'Note must still be live');
    assert.strictEqual(dbNoteAfterGuestDel.shareCode, shareCode, 'ShareCode must still exist');
    console.log('  ✅ Guest deletion only removed guest; Host live note and share link survived intact!');

    // 8. Host revokes live share link -> Succeeded
    console.log('8. Host revoking live share link...');
    const hostRevokeRes = await request(`/api/notes/${noteId}/revoke-share`, {
        method: 'POST',
        headers: {
            'Cookie': hostAuth.cookie,
            'CSRF-Token': hostAuth.csrfToken
        }
    });
    assert.strictEqual(hostRevokeRes.status, 200, 'Host revoke must succeed with 200');
    const dbNoteAfterHostRevoke = await Note.findOne({ id: noteId });
    assert(!dbNoteAfterHostRevoke.shareCode, 'Host revoke clears shareCode');
    assert.strictEqual(dbNoteAfterHostRevoke.isLive, false, 'Host revoke sets isLive to false');
    console.log('  ✅ Host successfully revoked live link!');

    // 9. Verify join link returns 404
    console.log('9. Verifying old join link returns 404...');
    const joinAfterRevokeRes = await request(`/note/join/${shareCode}`, {
        headers: { 'Cookie': guestAuth.cookie }
    });
    assert.strictEqual(joinAfterRevokeRes.status, 404, 'Revoked live link must return 404');
    console.log('  ✅ Revoked live link returns 404');

    await mongoose.disconnect();
    console.log('\n🎉 ALL HOST-ONLY SECURITY TESTS PASSED 100%!');
}

run().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
