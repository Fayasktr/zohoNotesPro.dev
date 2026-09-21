const http = require('http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const assert = require('assert');
const User = require('../models/User');

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
    console.log('🧪 Starting Live Link & Live Note Deletion Test Suite...');

    await mongoose.connect('mongodb://localhost:27017/zoho');

    const timestamp = Date.now();
    const hashedPassword = await bcrypt.hash('secret123', 10);
    const hostEmail = `delhost_${timestamp}@test.com`;
    const guestEmail = `delguest_${timestamp}@test.com`;

    await User.create({ username: 'DelHostUser', email: hostEmail, password: hashedPassword });
    await User.create({ username: 'DelGuestUser', email: guestEmail, password: hashedPassword });

    console.log('1. Logging in Host and Guest...');
    const hostAuth = await loginUser(hostEmail, 'secret123');
    const guestAuth = await loginUser(guestEmail, 'secret123');
    console.log('  ✅ Users authenticated');

    // 2. Host creates Live Note
    console.log('2. Host creating Live Note...');
    const createRes = await request('/api/notes/live', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': hostAuth.cookie,
            'CSRF-Token': hostAuth.csrfToken
        },
        body: JSON.stringify({ title: 'Live Note To Be Deleted' })
    });
    assert.strictEqual(createRes.status, 200, 'Create live note must succeed');
    const noteData = JSON.parse(createRes.body);
    const noteId = noteData.id;
    const shareCode = noteData.shareCode;
    console.log(`  ✅ Live note created: id=${noteId}, shareCode=${shareCode}`);

    // 3. Guest can access the share link
    console.log('3. Guest joining live note via share link...');
    const joinRes = await request(`/note/join/${shareCode}`, {
        headers: { 'Cookie': guestAuth.cookie }
    });
    assert.strictEqual(joinRes.status, 302, 'Guest join should redirect');
    console.log('  ✅ Guest successfully joined live note');

    // Verify Guest sees it in joined list
    const guestListRes = await request('/api/notes/live', {
        headers: { 'Cookie': guestAuth.cookie }
    });
    const guestList = JSON.parse(guestListRes.body);
    assert(guestList.joined.some(n => n.id === noteId), 'Note must be in guest joined list');
    console.log('  ✅ Note verified in Guest joined list');

    // 4. Test Revoking / Deleting the live share link
    console.log('4. Host revoking / deleting the live share link...');
    const revokeRes = await request(`/api/notes/${noteId}/revoke-share`, {
        method: 'POST',
        headers: {
            'Cookie': hostAuth.cookie,
            'CSRF-Token': hostAuth.csrfToken
        }
    });
    assert.strictEqual(revokeRes.status, 200, 'Revoke live link must return 200');
    console.log('  ✅ Live link successfully revoked on server');

    // 5. Verify the live link no longer works
    console.log('5. Verifying old live link is now invalid (404)...');
    const invalidJoinRes = await request(`/note/join/${shareCode}`, {
        headers: { 'Cookie': guestAuth.cookie }
    });
    assert.strictEqual(invalidJoinRes.status, 404, 'Revoked share link must return 404');
    assert(invalidJoinRes.body.includes('deleted') || invalidJoinRes.body.includes('expired') || invalidJoinRes.body.includes('Live Session Not Found'), 'Should show expired/deleted error page');
    console.log('  ✅ Live link confirmed dead/invalidated (returns 404)');

    // 6. Test Host deleting the live note completely
    console.log('6. Host creating second live note to test complete deletion...');
    const create2Res = await request('/api/notes/live', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': hostAuth.cookie,
            'CSRF-Token': hostAuth.csrfToken
        },
        body: JSON.stringify({ title: 'Second Live Note' })
    });
    const note2Data = JSON.parse(create2Res.body);
    const note2Id = note2Data.id;
    const shareCode2 = note2Data.shareCode;

    // Guest joins second live note
    await request(`/note/join/${shareCode2}`, {
        headers: { 'Cookie': guestAuth.cookie }
    });

    // Guest removes note from their joined list
    console.log('7. Guest removing note from joined list...');
    const guestDelRes = await request(`/api/notes/live/${note2Id}`, {
        method: 'DELETE',
        headers: {
            'Cookie': guestAuth.cookie,
            'CSRF-Token': guestAuth.csrfToken
        }
    });
    assert.strictEqual(guestDelRes.status, 200, 'Guest delete must succeed');
    const guestDelData = JSON.parse(guestDelRes.body);
    assert.strictEqual(guestDelData.action, 'removed', 'Action should be removed');

    const guestListAfter = JSON.parse((await request('/api/notes/live', { headers: { 'Cookie': guestAuth.cookie } })).body);
    assert(!guestListAfter.joined.some(n => n.id === note2Id), 'Note must not be in guest joined list anymore');
    console.log('  ✅ Note successfully removed from Guest joined list');

    // Host deletes the live note permanently
    console.log('8. Host deleting live note permanently...');
    const hostDelRes = await request(`/api/notes/live/${note2Id}`, {
        method: 'DELETE',
        headers: {
            'Cookie': hostAuth.cookie,
            'CSRF-Token': hostAuth.csrfToken
        }
    });
    assert.strictEqual(hostDelRes.status, 200, 'Host delete must succeed');
    const hostDelData = JSON.parse(hostDelRes.body);
    assert.strictEqual(hostDelData.action, 'deleted', 'Action should be deleted');

    const hostListAfter = JSON.parse((await request('/api/notes/live', { headers: { 'Cookie': hostAuth.cookie } })).body);
    assert(!hostListAfter.hosted.some(n => n.id === note2Id), 'Note must not be in host list anymore');
    console.log('  ✅ Live note successfully removed from Host list');

    // Confirm link 2 is also dead
    const deadJoinRes = await request(`/note/join/${shareCode2}`, {
        headers: { 'Cookie': guestAuth.cookie }
    });
    assert.strictEqual(deadJoinRes.status, 404, 'Deleted note share link must return 404');
    console.log('  ✅ Deleted note share link verified dead (404)');

    await mongoose.disconnect();
    console.log('\n🎉 ALL LIVE LINK & NOTE DELETION TESTS PASSED 100%!');
}

run().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
