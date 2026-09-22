const assert = require('assert');

function prepareCodeWithReturn(code) {
    if (!code || typeof code !== 'string') return code || '';
    const trimmed = code.trim();
    if (!trimmed) return code;

    const lines = trimmed.split('\n');
    let lastIdx = lines.length - 1;
    while (lastIdx >= 0 && !lines[lastIdx].trim()) lastIdx--;
    if (lastIdx < 0) return code;

    let lastLine = lines[lastIdx].trim();
    if (lastLine.endsWith(';')) lastLine = lastLine.slice(0, -1).trim();

    // Check if lastLine ends with or contains closing delimiters of a block/call
    // e.g. "}", "})", "});", "}, 1000", "}]"
    if (/\}[\s\)\],;]*$/.test(lastLine) || /^[\}\]\)]/.test(lastLine)) {
        return code;
    }

    const nonReturnableKeywords = [
        'return', 'const', 'let', 'var', 'function', 'class', 'if', 'else', 'for',
        'while', 'do', 'switch', 'case', 'try', 'catch', 'finally', 'throw',
        'import', 'export', 'debugger', 'break', 'continue'
    ];

    const firstWord = lastLine.split(/[\s\(\{]/)[0];
    if (nonReturnableKeywords.includes(firstWord) || lastLine.endsWith('}') || lastLine.endsWith('{')) {
        return code;
    }

    // Check bracket balance on lastLine:
    // If lastLine has more closing brackets/parens/braces than opening ones,
    // it cannot be wrapped as a standalone expression.
    let parenBalance = 0, braceBalance = 0, bracketBalance = 0;
    for (const char of lastLine) {
        if (char === '(') parenBalance++;
        else if (char === ')') parenBalance--;
        else if (char === '{') braceBalance++;
        else if (char === '}') braceBalance--;
        else if (char === '[') bracketBalance++;
        else if (char === ']') bracketBalance--;
    }
    if (parenBalance < 0 || braceBalance < 0 || bracketBalance < 0) {
        return code;
    }

    // Try wrapping candidate
    const candidateLines = [...lines];
    candidateLines[lastIdx] = `return (${lastLine});`;
    const candidateCode = candidateLines.join('\n');

    // Pre-compile validation: ensure candidate does NOT introduce a SyntaxError
    try {
        const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
        new AsyncFunction('console', '"use strict";\n' + candidateCode);
        return candidateCode;
    } catch (syntaxErr) {
        // Discard candidate if invalid syntax, fallback safely to original code
        return code;
    }
}

async function runCode(code) {
    const prepared = prepareCodeWithReturn(code);
    const logs = [];
    const customConsole = {
        log: (...args) => logs.push(args.join(' ')),
        error: (...args) => logs.push('ERROR: ' + args.join(' ')),
        warn: (...args) => logs.push('WARN: ' + args.join(' ')),
        info: (...args) => logs.push('INFO: ' + args.join(' '))
    };

    const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
    let fn;
    try {
        fn = new AsyncFunction('console', '"use strict";\n' + prepared);
    } catch (compileErr) {
        if (compileErr instanceof SyntaxError) {
            fn = new AsyncFunction('console', '"use strict";\n' + code);
        } else {
            throw compileErr;
        }
    }
    const result = await fn(customConsole);
    return { result, logs };
}

async function main() {
    console.log('Running test suite for prepareCodeWithReturn...');

    // Test 1: Multi-line forEach block (the user's exact case)
    const test1 = `const list = [1, 2, 3];
list.forEach(item => {
    console.log(item);
});`;
    const res1 = await runCode(test1);
    assert.deepStrictEqual(res1.logs, ['1', '2', '3']);
    console.log('✓ Test 1: forEach with callback block passed without Unexpected token }');

    // Test 2: Multi-line forEach block without trailing semicolon
    const test2 = `const list = ['a', 'b'];
list.forEach(item => {
    console.log(item);
})`;
    const res2 = await runCode(test2);
    assert.deepStrictEqual(res2.logs, ['a', 'b']);
    console.log('✓ Test 2: forEach without semicolon passed');

    // Test 3: setTimeout with callback and duration
    const test3 = `const val = 10;
console.log(val);
setTimeout(() => {
    console.log('timer');
}, 10);`;
    const res3 = await runCode(test3);
    assert.strictEqual(res3.logs[0], '10');
    console.log('✓ Test 3: setTimeout callback passed');

    // Test 4: Expression evaluation (REPL behavior preserved)
    const test4 = `const x = 5;\nconst y = 7;\nx + y;`;
    const res4 = await runCode(test4);
    assert.strictEqual(res4.result, 12);
    console.log('✓ Test 4: Expression REPL return preserved (x + y -> 12)');

    // Test 5: Single line function call
    const test5 = `function greet(name) { return 'Hello ' + name; }\ngreet('Fayas');`;
    const res5 = await runCode(test5);
    assert.strictEqual(res5.result, 'Hello Fayas');
    console.log('✓ Test 5: Function call return preserved');

    // Test 6: Object declaration spanning multiple lines
    const test6 = `const user = {
    name: 'Fayas',
    role: 'Admin'
};
console.log(user.name);`;
    const res6 = await runCode(test6);
    assert.deepStrictEqual(res6.logs, ['Fayas']);
    console.log('✓ Test 6: Multi-line object declaration passed');

    // Test 7: Multi-line chained methods
    const test7 = `const numbers = [1, 2, 3, 4]
  .map(n => n * 2)
  .filter(n => n > 4);
console.log(numbers);`;
    const res7 = await runCode(test7);
    assert.strictEqual(res7.logs.length, 1);
    console.log('✓ Test 7: Multi-line chained methods passed');

    // Test 8: If/else block
    const test8 = `const age = 20;
if (age >= 18) {
    console.log('Eligible');
} else {
    console.log('Not eligible');
}`;
    const res8 = await runCode(test8);
    assert.deepStrictEqual(res8.logs, ['Eligible']);
    console.log('✓ Test 8: If/else block passed');

    console.log('\nALL 8 TESTS PASSED SUCCESSFULLY!');
}

main().catch(err => {
    console.error('TEST FAILED:', err);
    process.exit(1);
});
