const runSyncTests = require('./sync.service.test');
const runApiTests = require('./api.test');
const runExecutionTests = require('./execution.service.test');

async function main() {
    console.log('====================================================');
    console.log('🧪 Starting Zoho Notes Pro Backend MVCS Test Suite');
    console.log('====================================================');

    try {
        runSyncTests();
        await runExecutionTests();
        await runApiTests();

        console.log('====================================================');
        console.log('🎉 ALL BACKEND TESTS PASSED SUCCESSFULLY! (100% GREEN)');
        console.log('====================================================');
        process.exit(0);
    } catch (err) {
        console.error('\n❌ Test Suite Failure:', err.message);
        process.exit(1);
    }
}

main();
