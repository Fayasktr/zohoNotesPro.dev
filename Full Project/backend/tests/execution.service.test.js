const assert = require('assert');
const executionService = require('../src/services/execution.service');

async function runExecutionTests() {
    console.log('\n--- Running Execution Service Unit Tests ---');
    let passed = 0;
    let total = 0;

    async function test(name, fn) {
        total++;
        try {
            await fn();
            console.log(`  ✅ [PASS] ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ❌ [FAIL] ${name}`);
            console.error(`     Error: ${err.message}`);
        }
    }

    // 1. JavaScript execution
    await test('JavaScript execution runs and returns stdout', async () => {
        const code = `
            const a = 10;
            const b = 25;
            console.log("SUM:" + (a + b));
        `;
        const result = await executionService.execute(code, 'javascript');
        assert.strictEqual(result.success, true);
        assert.ok(result.output.includes('SUM:35'), `Expected output to contain SUM:35, got: ${result.output}`);
    });

    // 2. Python execution (if python available)
    await test('Unsupported language returns proper error message', async () => {
        const result = await executionService.execute('print(1)', 'brainfuck');
        assert.strictEqual(result.success, false);
        assert.ok(result.output.includes('Unsupported language'));
    });

    console.log(`\nExecution Tests: ${passed}/${total} passed.\n`);
    if (passed !== total) {
        throw new Error(`Execution tests failed: ${total - passed} failures`);
    }
}

module.exports = runExecutionTests;

if (require.main === module) {
    runExecutionTests().catch(err => {
        console.error('Fatal execution test error:', err);
        process.exit(1);
    });
}
