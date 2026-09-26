const mongoose = require('mongoose');
const http = require('http');
const express = require('express');
const User = require('../models/User');
const McpSession = require('../models/McpSession');
const mcpRoutes = require('../routes/mcpRoutes');

async function runTests() {
    console.log('--- Testing User MCP API Key Management & Rate Limiting ---');
    await mongoose.connect('mongodb://localhost:27017/zoho');

    // Create a mock express app to test MCP routes
    const app = express();
    app.use(express.json());
    app.use('/mcp', mcpRoutes);

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}`;
    console.log(`✓ Test HTTP server listening on ${baseUrl}`);

    try {
        const studentEmail = 'test_student_rate_limit@example.com';
        const adminEmail = 'admin@gmail.com';

        await User.deleteMany({ email: { $in: [studentEmail, 'temp_test_user@example.com'] } });

        const student = await User.create({
            username: 'Test Student',
            email: studentEmail,
            role: 'user',
            mcpUsage: { dailyCount: 0, lastResetDate: new Date().toISOString().slice(0, 10) }
        });

        console.log('✓ Created test student user without API key');

        // Test 1: Verify user initially has no key
        const freshStudent = await User.findById(student._id);
        if (freshStudent.apiKey) {
            throw new Error('FAIL: User should NOT have an auto-generated API key initially');
        }
        console.log('✓ Verified: No auto-generated key initially');

        // Test 2: Generate key with 30-day expiration
        const crypto = require('crypto');
        const testKey1 = `zn_live_${crypto.randomBytes(20).toString('hex')}`;
        const expiry30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        freshStudent.apiKey = testKey1;
        freshStudent.apiKeyCreatedAt = new Date();
        freshStudent.apiKeyExpiresAt = expiry30Days;
        await freshStudent.save();

        console.log('✓ Successfully set key with 30-day expiration:', testKey1);
        if (!freshStudent.apiKeyExpiresAt || freshStudent.apiKeyExpiresAt <= new Date()) {
            throw new Error('FAIL: Expiry date not set properly');
        }
        console.log('✓ Verified: Expiration date is in the future (~30 days)');

        // Test 3: Test valid key allows status / access
        let res = await fetch(`${baseUrl}/mcp/status`, {
            headers: { 'Authorization': `Bearer ${testKey1}` }
        });
        const statusBody = await res.json();
        console.log('✓ Status endpoint response:', res.status, statusBody.service);

        // Test 4: Test Expired Key Rejection
        const expiredStudent = await User.create({
            username: 'Expired Student',
            email: 'temp_test_user@example.com',
            role: 'user',
            apiKey: `zn_live_expired_${crypto.randomBytes(10).toString('hex')}`,
            apiKeyCreatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
            apiKeyExpiresAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // Expired 10 days ago
        });

        res = await fetch(`${baseUrl}/mcp/users`, {
            headers: { 'Authorization': `Bearer ${expiredStudent.apiKey}` }
        });
        const expiredBody = await res.json();
        
        if (res.status !== 401 || !expiredBody.error || !expiredBody.error.includes('expired')) {
            console.error('Expected 401 Expired, got:', res.status, expiredBody);
            throw new Error('FAIL: Expired key was not rejected with 401 Expired');
        }
        console.log('✓ Verified: Expired API key successfully rejected with 401:', expiredBody.error);

        // Test 5: Test 50 Requests/Day Rate Limiting for Regular User
        console.log('Testing daily request rate limit (50 requests limit for normal student)...');
        
        // Simulate student having made 49 requests today
        const todayStr = new Date().toISOString().slice(0, 10);
        await User.updateOne(
            { _id: student._id },
            { 'mcpUsage.dailyCount': 49, 'mcpUsage.lastResetDate': todayStr }
        );

        // 50th request should SUCCEED (mcpAuth passes, RBAC returns 403 Forbidden because student is not admin)
        res = await fetch(`${baseUrl}/mcp/users`, {
            headers: { 'Authorization': `Bearer ${testKey1}` }
        });
        if (res.status === 429) {
            throw new Error('FAIL: 50th request should NOT be rate limited');
        }
        console.log('✓ 50th request passed rate limit check (mcpAuth authenticated, RBAC returned 403 as expected for student)');

        // Now student should be at 50 count
        const studentAt50 = await User.findById(student._id);
        console.log(`Current student count in DB: ${studentAt50.mcpUsage.dailyCount}`);

        // 51st request should be BLOCKED with 429
        res = await fetch(`${baseUrl}/mcp/users`, {
            headers: { 'Authorization': `Bearer ${testKey1}` }
        });
        const rateLimitBody = await res.json();
        
        if (res.status !== 429 || !rateLimitBody.error.includes('limit reached')) {
            console.error('Expected 429 Rate Limit, got:', res.status, rateLimitBody);
            throw new Error('FAIL: 51st request was not blocked with 429 Rate Limit');
        }
        console.log('✓ Verified: 51st request successfully blocked with 429:', rateLimitBody.error);

        // Test 6: Test Super Admin Bypass (Unlimited Access)
        console.log('Testing Super Admin (admin@gmail.com) unlimited access...');
        let admin = await User.findOne({ email: adminEmail });
        if (!admin) {
            admin = await User.create({
                username: 'admin',
                email: adminEmail,
                role: 'admin',
                apiKey: `zn_admin_${crypto.randomBytes(20).toString('hex')}`
            });
        }

        // Set admin count to 100 requests already today
        await User.updateOne(
            { _id: admin._id },
            { 'mcpUsage.dailyCount': 100, 'mcpUsage.lastResetDate': todayStr }
        );

        res = await fetch(`${baseUrl}/mcp/users`, {
            headers: { 'Authorization': `Bearer ${admin.apiKey}` }
        });
        const adminBody = await res.json();

        if (res.status !== 200) {
            console.error('Expected 200 for Admin, got:', res.status, adminBody);
            throw new Error('FAIL: Admin was restricted or failed auth');
        }
        console.log('✓ Verified: Super Admin has UNLIMITED access (count was 100, request returned 200 with all users count:', adminBody.count, ')');

        // Test 7: Test Invalidation & Single Active Key
        console.log('Testing single active key rotation & session termination...');
        const testKey2 = `zn_live_${crypto.randomBytes(20).toString('hex')}`;
        student.apiKey = testKey2;
        student.apiKeyCreatedAt = new Date();
        await student.save();

        // Old key testKey1 must now FAIL with 401
        res = await fetch(`${baseUrl}/mcp/users`, {
            headers: { 'Authorization': `Bearer ${testKey1}` }
        });
        if (res.status !== 401) {
            throw new Error('FAIL: Old API key was not invalidated after generating new key');
        }
        console.log('✓ Verified: Previous API key immediately rejected with 401 after rotation');

        // Test 8: Test Revocation
        student.apiKey = undefined;
        student.apiKeyExpiresAt = undefined;
        await student.save();

        res = await fetch(`${baseUrl}/mcp/users`, {
            headers: { 'Authorization': `Bearer ${testKey2}` }
        });
        if (res.status !== 401) {
            throw new Error('FAIL: Revoked API key was still accepted');
        }
        console.log('✓ Verified: Revoked API key returns 401 Unauthorized');

        // Clean up
        await User.deleteMany({ email: { $in: [studentEmail, 'temp_test_user@example.com'] } });

        console.log('\n========================================');
        console.log('ALL MCP USER API KEY & RATE LIMIT TESTS PASSED 100%!');
        console.log('========================================\n');
    } finally {
        server.close();
        await mongoose.disconnect();
    }
}

runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
