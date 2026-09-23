const assert = require('assert');
const engine = require('../engine/AntigravityEngine');

async function testTimerExecution() {
    console.log('--- Running Timer Function Execution Tests ---\n');

    // 1. AntigravityEngine: Single setTimeout
    console.log('[Test 1] AntigravityEngine: Single setTimeout...');
    const res1 = await engine.execute(`
        console.log("start");
        setTimeout(() => {
            console.log("middle");
        }, 150);
        console.log("end");
    `, 'javascript');

    assert.strictEqual(res1.success, true, 'Execution should succeed');
    assert.deepStrictEqual(res1.logs, ['start', 'end', 'middle'], 'Logs should capture timer execution in order');
    console.log('  ✅ [PASS] Single setTimeout executed and logged after delay.\n');

    // 2. AntigravityEngine: Multiple concurrent setTimeout calls
    console.log('[Test 2] AntigravityEngine: Multiple concurrent setTimeout...');
    const res2 = await engine.execute(`
        setTimeout(() => console.log("timer-200"), 200);
        setTimeout(() => console.log("timer-100"), 100);
        console.log("sync-log");
    `, 'javascript');

    assert.strictEqual(res2.success, true);
    assert.deepStrictEqual(res2.logs, ['sync-log', 'timer-100', 'timer-200']);
    console.log('  ✅ [PASS] Concurrent timers executed in order of delay.\n');

    // 3. AntigravityEngine: clearTimeout cancellation
    console.log('[Test 3] AntigravityEngine: clearTimeout cancellation...');
    const res3 = await engine.execute(`
        const t1 = setTimeout(() => console.log("should not fire"), 100);
        clearTimeout(t1);
        setTimeout(() => console.log("should fire"), 150);
    `, 'javascript');

    assert.strictEqual(res3.success, true);
    assert.deepStrictEqual(res3.logs, ['should fire']);
    console.log('  ✅ [PASS] clearTimeout successfully prevented callback from firing.\n');

    // 4. AntigravityEngine: setInterval with clearInterval
    console.log('[Test 4] AntigravityEngine: setInterval with clearInterval...');
    const res4 = await engine.execute(`
        let count = 0;
        const intervalId = setInterval(() => {
            count++;
            console.log("tick " + count);
            if (count === 3) {
                clearInterval(intervalId);
            }
        }, 80);
    `, 'javascript');

    assert.strictEqual(res4.success, true);
    assert.deepStrictEqual(res4.logs, ['tick 1', 'tick 2', 'tick 3']);
    console.log('  ✅ [PASS] setInterval ran 3 times and cleared properly.\n');

    // 5. AntigravityEngine: Runaway interval terminated safely by timeout limit
    console.log('[Test 5] AntigravityEngine: Runaway interval safe timeout guard...');
    const start5 = Date.now();
    const res5 = await engine.execute(`
        let ticks = 0;
        setInterval(() => {
            ticks++;
        }, 50);
    `, 'javascript');
    const elapsed5 = Date.now() - start5;

    assert.strictEqual(res5.success, true);
    assert(Math.abs(elapsed5 - engine.timeout) < 1000, `Expected elapsed time around ~${engine.timeout}ms, got ${elapsed5}ms`);
    console.log(`  ✅ [PASS] Runaway interval cleanly stopped after ${elapsed5}ms.\n`);

    // 6. Test BrowserEngine Worker logic in Node environment (AsyncFunction + wrapper)
    console.log('[Test 6] Browser Engine Worker Sandbox Simulation...');
    const logs6 = [];
    const activeTimers = new Set();
    const activeIntervals = new Set();

    const customConsole = {
        log: (...args) => logs6.push(args.join(' ')),
        error: (...args) => logs6.push('ERROR: ' + args.join(' '))
    };

    const wrappedSetTimeout = function(fn, delay, ...args) {
        let id;
        id = setTimeout(function() {
            activeTimers.delete(id);
            try {
                if (typeof fn === 'function') fn(...args);
            } catch(err) {
                customConsole.error(err.message);
            }
        }, delay);
        activeTimers.add(id);
        return id;
    };

    const wrappedClearTimeout = function(id) {
        if (id) activeTimers.delete(id);
        clearTimeout(id);
    };

    const wrappedSetInterval = function(fn, delay, ...args) {
        let id;
        id = setInterval(function() {
            try {
                if (typeof fn === 'function') fn(...args);
            } catch(err) {
                customConsole.error(err.message);
            }
        }, delay);
        activeIntervals.add(id);
        return id;
    };

    const wrappedClearInterval = function(id) {
        if (id) activeIntervals.delete(id);
        clearInterval(id);
    };

    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const fn6 = new AsyncFunction('console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', `
        "use strict";
        console.log("browser worker start");
        let i = 0;
        const iv = setInterval(() => {
            i++;
            console.log("step " + i);
            if (i === 2) clearInterval(iv);
        }, 60);
        setTimeout(() => {
            console.log("browser worker timer done");
        }, 150);
    `);

    await fn6(customConsole, wrappedSetTimeout, wrappedClearTimeout, wrappedSetInterval, wrappedClearInterval);

    // Wait loop simulation
    const waitStart = Date.now();
    while (activeTimers.size > 0 || activeIntervals.size > 0) {
        if (Date.now() - waitStart > 3000) break;
        await new Promise(r => setTimeout(r, 20));
    }

    assert.deepStrictEqual(logs6, [
        'browser worker start',
        'step 1',
        'step 2',
        'browser worker timer done'
    ]);
    console.log('  ✅ [PASS] Browser worker sandbox simulation passed with all timers captured.\n');

    console.log('═══════════════════════════════════════════════════');
    console.log('🎉 ALL 6 TIMER EXECUTION TESTS PASSED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════════════\n');
}

testTimerExecution().catch(err => {
    console.error('❌ Timer test suite failed:', err);
    process.exit(1);
});
