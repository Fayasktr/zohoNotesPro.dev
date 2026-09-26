const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
const mcpRoutes = require('../routes/mcpRoutes');
const User = require('../models/User');
const Note = require('../models/Note');

async function runRbacTests() {
    console.log('=== 🧪 Testing MCP Multi-Tenant RBAC & Isolation ===\n');

    await mongoose.connect('mongodb://localhost:27017/zoho');

    // 1. Fetch Admin User (Fayas KP) and a Student User (e.g. testuser or demo)
    const adminUser = await User.findOne({ email: 'fayaskpktr@gmail.com' });
    if (!adminUser || !adminUser.apiKey) {
        throw new Error('Admin user (fayaskpktr@gmail.com) with apiKey not found in DB!');
    }
    console.log(`✅ Found Admin: ${adminUser.username} (${adminUser.email}) [Role: ${adminUser.role}] Key: ${adminUser.apiKey.substring(0, 15)}...`);

    let studentUser = await User.findOne({ role: 'user', apiKey: { $exists: true } });
    if (!studentUser) {
        throw new Error('No regular student user with apiKey found in DB!');
    }
    console.log(`✅ Found Student: ${studentUser.username} (${studentUser.email}) [Role: ${studentUser.role}] Key: ${studentUser.apiKey.substring(0, 15)}...`);

    // Create a note owned by Admin
    const adminNote = new Note({
        id: 'test-admin-note-' + Date.now(),
        title: 'Confidential Admin Note',
        owner: adminUser._id,
        authorName: adminUser.username,
        content: { title: 'Confidential Admin Note', cells: [] }
    });
    await adminNote.save();

    // Create a note owned by Student
    const studentNote = new Note({
        id: 'test-student-note-' + Date.now(),
        title: 'Student Homework Note',
        owner: studentUser._id,
        authorName: studentUser.username,
        content: { title: 'Student Homework Note', cells: [] }
    });
    await studentNote.save();

    // 2. Start a test Express server on port 4399 mounting mcpRoutes
    const app = express();
    app.use(express.json());
    app.use('/mcp', mcpRoutes);
    const testServer = http.createServer(app);
    await new Promise(resolve => testServer.listen(4399, resolve));
    console.log('\n🚀 Test MCP Server running on port 4399');

    try {
        // ==========================================
        // TEST SUITE 1: STUDENT KEY TESTS (ISOLATION)
        // ==========================================
        console.log('\n--- 🧑‍🎓 TEST SUITE 1: Student Permissions & Isolation ---');
        const studentTransport = new SSEClientTransport(new URL(`http://localhost:4399/mcp/sse?apiKey=${studentUser.apiKey}`));
        const studentClient = new Client({ name: 'student-agent', version: '1.0' }, { capabilities: {} });
        await studentClient.connect(studentTransport);
        console.log('✅ Student connected to MCP via personal apiKey!');

        // Test 1.1: Student list_notes should only return their own notes
        const studentNotesRes = await studentClient.callTool({ name: 'list_notes' });
        const studentNotes = JSON.parse(studentNotesRes.content[0].text);
        console.log(`Student saw ${studentNotes.count} notes. ScopedTo: ${studentNotes.scopedToUser}`);
        const sawAdminNote = (studentNotes.notes || []).some(n => n.id === adminNote.id);
        if (sawAdminNote) {
            throw new Error('❌ SECURITY BREACH: Student was able to list Admin note!');
        }
        console.log('✅ Test 1.1 Passed: Student cannot list notes owned by other users.');

        // Test 1.2: Student get_note on Admin's note should be FORBIDDEN
        const forbiddenGet = await studentClient.callTool({ name: 'get_note', arguments: { noteId: adminNote.id } });
        if (!forbiddenGet.isError || !forbiddenGet.content[0].text.includes('Forbidden')) {
            throw new Error(`❌ SECURITY BREACH: Student get_note on admin note was not forbidden! Result: ${JSON.stringify(forbiddenGet)}`);
        }
        console.log('✅ Test 1.2 Passed: Student get_note on other user\'s note returned Forbidden.');

        // Test 1.3: Student get_note on their own note should SUCCEED
        const allowedGet = await studentClient.callTool({ name: 'get_note', arguments: { noteId: studentNote.id } });
        const studentNoteData = JSON.parse(allowedGet.content[0].text);
        if (studentNoteData.id !== studentNote.id) {
            throw new Error('❌ Student could not access their own note!');
        }
        console.log('✅ Test 1.3 Passed: Student successfully accessed their own note.');

        // Test 1.4: Student calling list_users should be FORBIDDEN
        const forbiddenListUsers = await studentClient.callTool({ name: 'list_users' });
        if (!forbiddenListUsers.isError || !forbiddenListUsers.content[0].text.includes('Forbidden')) {
            throw new Error('❌ SECURITY BREACH: Student was able to call list_users!');
        }
        console.log('✅ Test 1.4 Passed: Student calling list_users was rejected with 403 Forbidden.');

        // Test 1.5: Student calling set_user_role should be FORBIDDEN
        const forbiddenSetRole = await studentClient.callTool({
            name: 'set_user_role',
            arguments: { email: studentUser.email, role: 'admin' }
        });
        if (!forbiddenSetRole.isError || !forbiddenSetRole.content[0].text.includes('Forbidden')) {
            throw new Error('❌ SECURITY BREACH: Student was able to promote themselves to admin!');
        }
        console.log('✅ Test 1.5 Passed: Student calling set_user_role was rejected with 403 Forbidden.');


        // ==========================================
        // TEST SUITE 2: ADMIN KEY TESTS (SUPERADMIN)
        // ==========================================
        console.log('\n--- 👑 TEST SUITE 2: Admin Superpowers (Fayas KP) ---');
        const adminTransport = new SSEClientTransport(new URL(`http://localhost:4399/mcp/sse?apiKey=${adminUser.apiKey}`));
        const adminClient = new Client({ name: 'admin-agent', version: '1.0' }, { capabilities: {} });
        await adminClient.connect(adminTransport);
        console.log('✅ Admin connected to MCP via admin apiKey!');

        // Test 2.1: Admin can access student note
        const adminGetStudentNote = await adminClient.callTool({ name: 'get_note', arguments: { noteId: studentNote.id } });
        const adminViewed = JSON.parse(adminGetStudentNote.content[0].text);
        if (adminViewed.id !== studentNote.id) {
            throw new Error('❌ Admin was unable to view student note!');
        }
        console.log('✅ Test 2.1 Passed: Admin can view any student note across the database.');

        // Test 2.2: Admin can call list_users
        const adminListUsers = await adminClient.callTool({ name: 'list_users' });
        const userList = JSON.parse(adminListUsers.content[0].text);
        if (!userList.count || userList.count < 1) {
            throw new Error('❌ Admin list_users failed or returned 0 users!');
        }
        console.log(`✅ Test 2.2 Passed: Admin list_users succeeded (returned ${userList.count} users).`);

        // Test 2.3: Admin can reassign notes
        const reassignRes = await adminClient.callTool({
            name: 'reassign_note',
            arguments: { noteId: studentNote.id, email: adminUser.email }
        });
        const reassignData = JSON.parse(reassignRes.content[0].text);
        if (!reassignData.success) {
            throw new Error('❌ Admin reassign_note failed!');
        }
        console.log('✅ Test 2.3 Passed: Admin successfully reassigned note.');

        console.log('\n🎉 ALL RBAC & ISOLATION TESTS PASSED 100%!');

    } finally {
        // Cleanup test notes and close server
        await Note.deleteOne({ id: adminNote.id });
        await Note.deleteOne({ id: studentNote.id });
        testServer.close();
    }

    process.exit(0);
}

runRbacTests().catch(err => {
    console.error('\n❌ RBAC Test Failed:', err);
    process.exit(1);
});
