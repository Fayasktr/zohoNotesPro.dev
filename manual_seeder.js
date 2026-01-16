require('dotenv').config();
const mongoose = require('mongoose');
const Quest = require('./models/Quest');

const manualQuests = [
    // --- LANGUAGE FUNDAMENTALS (10) ---
    {
        id: 'fund-1', lang: 'javascript', topic: 'language fundamentals', difficulty: 'standard', title: 'Hello World', functionName: 'sayHello',
        explanation: 'In programming, **"Hello World"** is the traditional first step! It proves your environment is working. To solve this, you just need to return a string.',
        description: 'Return the exact string "Hello World"', template: 'function sayHello() {\n  // Your code here\n}',
        testCases: [{ input: [], expected: 'Hello World' }], points: 5
    },
    {
        id: 'fund-2', lang: 'javascript', topic: 'language fundamentals', difficulty: 'standard', title: 'Addition', functionName: 'add',
        explanation: 'The `+` operator in JavaScript adds two numbers together. Simple and powerful!',
        description: 'Return the sum of a and b', template: 'function add(a, b) {\n  \n}',
        testCases: [{ input: [1, 2], expected: 3 }], points: 5
    },
    {
        id: 'fund-3', lang: 'javascript', topic: 'language fundamentals', difficulty: 'standard', title: 'Subtraction', functionName: 'sub',
        explanation: 'The `-` operator subtracts the second value from the first.',
        description: 'Subtract b from a', template: 'function sub(a, b) {\n  \n}',
        testCases: [{ input: [5, 2], expected: 3 }], points: 5
    },
    {
        id: 'fund-4', lang: 'javascript', topic: 'language fundamentals', difficulty: 'standard', title: 'Multiplication', functionName: 'mul',
        explanation: 'Use the asterisk `*` for multiplication.',
        description: 'Multiply a and b', template: 'function mul(a, b) {\n  \n}',
        testCases: [{ input: [3, 4], expected: 12 }], points: 5
    },
    {
        id: 'fund-5', lang: 'javascript', topic: 'language fundamentals', difficulty: 'standard', title: 'Division', functionName: 'div',
        explanation: 'The forward slash `/` is used for division.',
        description: 'Divide a by b', template: 'function div(a, b) {\n  \n}',
        testCases: [{ input: [10, 2], expected: 5 }], points: 5
    },
    {
        id: 'fund-6', lang: 'javascript', topic: 'language fundamentals', difficulty: 'standard', title: 'Remainder', functionName: 'mod',
        explanation: 'The modulo operator `%` returns what is left over after division. For example, `10 % 3` is `1` because 3 goes into 10 three times with 1 left over.',
        description: 'Return the remainder of a/b', template: 'function mod(a, b) {\n  \n}',
        testCases: [{ input: [10, 3], expected: 1 }], points: 5
    },
    {
        id: 'fund-7', lang: 'javascript', topic: 'language fundamentals', difficulty: 'standard', title: 'Is Even', functionName: 'isEven',
        explanation: 'An even number is any number divisible by 2 with no remainder. You can check this using `n % 2 === 0`.',
        description: 'Return true if n is even, false otherwise', template: 'function isEven(n) {\n  \n}',
        testCases: [{ input: [4], expected: true }, { input: [7], expected: false }], points: 5
    },
    {
        id: 'fund-8', lang: 'javascript', topic: 'language fundamentals', difficulty: 'standard', title: 'Is Odd', functionName: 'isOdd',
        explanation: 'An odd number leaves a remainder of 1 when divided by 2. Use `n % 2 !== 0`.',
        description: 'Return true if n is odd', template: 'function isOdd(n) {\n  \n}',
        testCases: [{ input: [7], expected: true }], points: 5
    },
    {
        id: 'fund-9', lang: 'javascript', topic: 'language fundamentals', difficulty: 'standard', title: 'Negation', functionName: 'negate',
        explanation: 'To negate a number, simply put a minus sign `-` in front of it.',
        description: 'Return the negative version of n', template: 'function negate(n) {\n  \n}',
        testCases: [{ input: [5], expected: -5 }], points: 5
    },
    {
        id: 'fund-10', lang: 'javascript', topic: 'language fundamentals', difficulty: 'standard', title: 'Absolute Value', functionName: 'abs',
        explanation: 'The **Absolute Value** of a number is its distance from zero, regardless of direction. In simple terms: if it is negative, make it positive; if it is positive, leave it alone. JavaScript provides `Math.abs(n)` for this.',
        description: 'Return the absolute value of n', template: 'function abs(n) {\n  \n}',
        testCases: [{ input: [-10], expected: 10 }], points: 5
    },

    // --- VARIABLES (10) ---
    {
        id: 'var-1', lang: 'javascript', topic: 'variables', difficulty: 'standard', title: 'Declare let', functionName: 'getVar',
        explanation: 'Variables are containers for data. `let` allows you to declare a variable that can be changed later.',
        description: 'Declare a variable x with value 5 and return it', template: 'function getVar() {\n  \n}',
        testCases: [{ input: [], expected: 5 }], points: 5
    },
    {
        id: 'var-2', lang: 'javascript', topic: 'variables', difficulty: 'standard', title: 'Declare const', functionName: 'getConst',
        explanation: '`const` is for values that should not be reassigned. It stands for "constant".',
        description: 'Declare a const x = 10 and return it', template: 'function getConst() {\n  \n}',
        testCases: [{ input: [], expected: 10 }], points: 5
    },
    {
        id: 'var-3', lang: 'javascript', topic: 'variables', difficulty: 'standard', title: 'Reassignment', functionName: 'reassign',
        explanation: 'You can change the value of a `let` variable by simply assigning a new value to it using `=`.',
        description: 'Set x=1, then change it to 2 and return x', template: 'function reassign() {\n  \n}',
        testCases: [{ input: [], expected: 2 }], points: 5
    },
    {
        id: 'var-4', lang: 'javascript', topic: 'variables', difficulty: 'standard', title: 'String Concat', functionName: 'concat',
        explanation: 'Combining strings is called "concatenation". Use the `+` operator to join them.',
        description: 'Join string a and b together', template: 'function concat(a, b) {\n  \n}',
        testCases: [{ input: ["a", "b"], expected: "ab" }], points: 5
    },
    {
        id: 'var-5', lang: 'javascript', topic: 'variables', difficulty: 'standard', title: 'Template Literals', functionName: 'greet',
        explanation: 'Template literals use backticks (`` ` ``) and `${variable}` to easily inject values into strings. It is much cleaner than using `+`.',
        description: 'Return "Hi " followed by the name using backticks', template: 'function greet(name) {\n  \n}',
        testCases: [{ input: ["Fayas"], expected: "Hi Fayas" }], points: 5
    },
    {
        id: 'var-6', lang: 'javascript', topic: 'variables', difficulty: 'standard', title: 'Check Undefined', functionName: 'isUndef',
        explanation: '`undefined` means a variable has been declared but not yet assigned a value.',
        description: 'Return true if x is undefined', template: 'function isUndef(x) {\n  \n}',
        testCases: [{ input: [undefined], expected: true }], points: 5
    },
    {
        id: 'var-7', lang: 'javascript', topic: 'variables', difficulty: 'standard', title: 'Null check', functionName: 'isNull',
        explanation: '`null` is an intentional absence of any object value. It is different from `undefined`.',
        description: 'Return true if x is exactly null', template: 'function isNull(x) {\n  \n}',
        testCases: [{ input: [null], expected: true }], points: 5
    },
    {
        id: 'var-8', lang: 'javascript', topic: 'variables', difficulty: 'standard', title: 'Var scope', functionName: 'testVar',
        explanation: '`var` is function-scoped. If you declare it inside an `if` block, it is still accessible outside that block (within the same function). This is often confusing!',
        description: 'Observe how x declared in "if" affects the function scope', template: 'function testVar() {\n  var x = 1;\n  if(true){ var x = 2; }\n  return x;\n}',
        testCases: [{ input: [], expected: 2 }], points: 5
    },
    {
        id: 'var-9', lang: 'javascript', topic: 'variables', difficulty: 'standard', title: 'Let scope', functionName: 'testLet',
        explanation: '`let` is block-scoped. A variable declared inside an `if` block using `let` is a completely different variable from one outside.',
        description: 'Observe how let x in "if" does NOT change the outer x', template: 'function testLet() {\n  let x = 1;\n  if(true){ let x = 2; }\n  return x;\n}',
        testCases: [{ input: [], expected: 1 }], points: 5
    },
    {
        id: 'var-10', lang: 'javascript', topic: 'variables', difficulty: 'standard', title: 'Const Mutability', functionName: 'modifyCol',
        explanation: '`const` prevents reassignment of the variable itself, but it does NOT make objects or arrays immutable. You can still add items to a `const` array!',
        description: 'Add 2 to the const array [1] and return it', template: 'function modifyCol() {\n  const x = [1];\n  x.push(2);\n  return x;\n}',
        testCases: [{ input: [], expected: [1, 2] }], points: 5
    },

    // --- HOISTING (10) ---
    {
        id: 'hoist-1', lang: 'javascript', topic: 'hoisting', difficulty: 'standard', title: 'Basic Hoisting', functionName: 'h1',
        explanation: 'In JS, `var` declarations are "hoisted" to the top of their scope. This means the variable exists but is `undefined` until the code reaches the assignment line.',
        description: 'What is returned if we access x before "var x = 5"?', template: 'function h1() {\n  return x;\n  var x = 5;\n}',
        testCases: [{ input: [], expected: undefined }], points: 10
    },
    {
        id: 'hoist-2', lang: 'javascript', topic: 'hoisting', difficulty: 'standard', title: 'Temporal Dead Zone', functionName: 'h2',
        explanation: 'Unlike `var`, `let` and `const` are NOT hoisted in a way that allows access. Accessing them before initialization causes a "ReferenceError". This region is called the Temporal Dead Zone (TDZ).',
        description: 'Try to catch the error when accessing let early', template: 'function h2() {\n  try {\n    return x;\n    let x = 5;\n  } catch(e) { return "error"; }\n}',
        testCases: [{ input: [], expected: "error" }], points: 10
    },
    {
        id: 'hoist-3', lang: 'javascript', topic: 'hoisting', difficulty: 'standard', title: 'Function Hoisting', functionName: 'h3',
        explanation: 'Function declarations are fully hoisted! You can call a function before you define it in the code.',
        description: 'Call f() before its definition', template: 'function h3() {\n  return f();\n  function f(){ return 1; }\n}',
        testCases: [{ input: [], expected: 1 }], points: 10
    },
    {
        id: 'hoist-4', lang: 'javascript', topic: 'hoisting', difficulty: 'standard', title: 'Expression Hoisting', functionName: 'h4',
        explanation: 'Function expressions (like `var f = () => ...`) only hoist the variable name, not the function itself. So the variable is `undefined` when called, causing an error.',
        description: 'What happens when calling a var function expression early?', template: 'function h4() {\n  try { return f(); } \n  catch(e) { return "err"; }\n  var f = () => 1;\n}',
        testCases: [{ input: [], expected: "err" }], points: 10
    },
    {
        id: 'hoist-5', lang: 'javascript', topic: 'hoisting', difficulty: 'standard', title: 'Initialization Order', functionName: 'h5',
        explanation: 'Hoisting moves the declaration, but not the initialization. Always keep track of when values are actually assigned.',
        description: 'Predict the result of f() which uses a global-ish a', template: 'function h5() {\n  var a = 1;\n  var b = f(); \n  function f() { return a; }\n  return b;\n}',
        testCases: [{ input: [], expected: 1 }], points: 10
    },
    {
        id: 'hoist-6', lang: 'javascript', topic: 'hoisting', difficulty: 'standard', title: 'Duplicate Definitions', functionName: 'h6',
        explanation: 'If you define the same function twice, the second one "wins" because both are hoisted and the second definition overwrites the first.',
        description: 'Define f returning 1, then define f returning 2. Which runs?', template: 'function h6() {\n  function f(){ return 1; }\n  function f(){ return 2; }\n  return f();\n}',
        testCases: [{ input: [], expected: 2 }], points: 10
    },
    {
        id: 'hoist-7', lang: 'javascript', topic: 'hoisting', difficulty: 'standard', title: 'Shadowing Parameters', functionName: 'h7',
        explanation: 'Function parameters are like local variables. Declaring a `var` with the same name inside the function doesn\'t overwrite the parameter value unless you also assign something to it.',
        description: 'Does "var a;" reset the parameter a?', template: 'function h7(a) {\n  var a;\n  return a;\n}',
        testCases: [{ input: [5], expected: 5 }], points: 10
    },
    {
        id: 'hoist-8', lang: 'javascript', topic: 'hoisting', difficulty: 'standard', title: 'Block Hoisting', functionName: 'h8',
        explanation: 'In modern JS (strict mode), function declarations inside blocks are hoisted to the top of that specific block.',
        description: 'Access a block-defined function', template: 'function h8() {\n  {\n    function f(){ return 1; }\n  }\n  return f();\n}',
        testCases: [{ input: [], expected: 1 }], points: 10
    },
    {
        id: 'hoist-9', lang: 'javascript', topic: 'hoisting', difficulty: 'standard', title: 'Block Scope TDZ', functionName: 'h9',
        explanation: '`let` variables inside an `if` block belong ONLY to that block. Attempting to access them outside results in an error.',
        description: 'Try to access x outside the if block', template: 'function h9() {\n  if(true){ let x = 1; }\n  try { return x; } catch(e){ return "err"; }\n}',
        testCases: [{ input: [], expected: "err" }], points: 10
    },
    {
        id: 'hoist-10', lang: 'javascript', topic: 'hoisting', difficulty: 'standard', title: 'Execution Order', functionName: 'h10',
        explanation: 'Remember: 1. Declarations are hoisted. 2. Assignments stay in place. 3. Code executes line by line.',
        description: 'Update a variable inside f() and check result', template: 'function h10() {\n  var a = 1;\n  function f(){ a = 2; }\n  f();\n  return a;\n}',
        testCases: [{ input: [], expected: 2 }], points: 10
    },

    // --- DATA TYPES (10) ---
    {
        id: 'type-1', lang: 'javascript', topic: 'data types', difficulty: 'standard', title: 'Number Type', functionName: 't1',
        explanation: 'JavaScript has a single `number` type for both integers and decimals.',
        description: 'What is typeof 123?', template: 'function t1() { return typeof 123; }',
        testCases: [{ input: [], expected: "number" }], points: 5
    },
    {
        id: 'type-2', lang: 'javascript', topic: 'data types', difficulty: 'standard', title: 'String Type', functionName: 't2',
        explanation: 'Textual data is stored as strings.',
        description: 'What is typeof "hi"?', template: 'function t2() { return typeof "hi"; }',
        testCases: [{ input: [], expected: "string" }], points: 5
    },
    {
        id: 'type-3', lang: 'javascript', topic: 'data types', difficulty: 'standard', title: 'Undefined', functionName: 't3',
        explanation: '`undefined` is its own type.',
        description: 'What is typeof undefined?', template: 'function t3() { return typeof undefined; }',
        testCases: [{ input: [], expected: "undefined" }], points: 5
    },
    {
        id: 'type-4', lang: 'javascript', topic: 'data types', difficulty: 'standard', title: 'The Null Bug', functionName: 't4',
        explanation: 'Crucial Lesson: `typeof null` is actually `"object"`. This is a famous bug in early JavaScript that was never fixed to avoid breaking old websites!',
        description: 'What is the unexpected result of typeof null?', template: 'function t4() { return typeof null; }',
        testCases: [{ input: [], expected: "object" }], points: 5
    },
    {
        id: 'type-5', lang: 'javascript', topic: 'data types', difficulty: 'standard', title: 'Is it an Array?', functionName: 't5',
        explanation: '`typeof []` is `"object"`. To specifically check for an array, use `Array.isArray(variable)`.',
        description: 'Check if the input x is an array', template: 'function t5(x) { return Array.isArray(x); }',
        testCases: [{ input: [[]], expected: true }], points: 5
    },
    {
        id: 'type-6', lang: 'javascript', topic: 'data types', difficulty: 'standard', title: 'NaN is a Number', functionName: 't6',
        explanation: '`NaN` stands for "Not a Number", but ironically, its type is `"number"`. This represents a failed numerical operation.',
        description: 'What is the type of NaN?', template: 'function t6() { return typeof NaN; }',
        testCases: [{ input: [], expected: "number" }], points: 5
    },
    {
        id: 'type-7', lang: 'javascript', topic: 'data types', difficulty: 'standard', title: 'Integer Check', functionName: 't7',
        explanation: 'Since all numbers are just `number`, use `Number.isInteger(n)` to see if it\'s a whole number.',
        description: 'Is x an integer?', template: 'function t7(x) { return Number.isInteger(x); }',
        testCases: [{ input: [1], expected: true }, { input: [1.5], expected: false }], points: 5
    },
    {
        id: 'type-8', lang: 'javascript', topic: 'data types', difficulty: 'standard', title: 'Symbols', functionName: 't8',
        explanation: 'Symbols are unique, immutable identifiers often used as hidden object keys.',
        description: 'What is the type of a Symbol?', template: 'function t8() { return typeof Symbol("s"); }',
        testCases: [{ input: [], expected: "symbol" }], points: 5
    },
    {
        id: 'type-9', lang: 'javascript', topic: 'data types', difficulty: 'standard', title: 'BigInt', functionName: 't9',
        explanation: 'For numbers larger than $2^{53}-1$, JavaScript uses `BigInt`. You create them by adding an `n` to the end of a number.',
        description: 'What is the type of 1n?', template: 'function t9() { return typeof 1n; }',
        testCases: [{ input: [], expected: "bigint" }], points: 5
    },
    {
        id: 'type-10', lang: 'javascript', topic: 'data types', difficulty: 'standard', title: 'Objects', functionName: 't10',
        explanation: 'Collections of data are stored as objects.',
        description: 'What is the type of {}?', template: 'function t10() { return typeof {}; }',
        testCases: [{ input: [], expected: "object" }], points: 5
    },

    // --- EXECUTION MODEL (10) ---
    {
        id: 'exec-1', lang: 'javascript', topic: 'execution model', difficulty: 'standard', title: 'Synchronous Flow', functionName: 'e1',
        explanation: 'JavaScript is single-threaded, meaning it executes one line at a time from top to bottom.',
        description: 'Predict the order of string builds', template: 'function e1() {\n  let s = "";\n  s += "a";\n  s += "b";\n  return s;\n}',
        testCases: [{ input: [], expected: "ab" }], points: 10
    },
    {
        id: 'exec-2', lang: 'javascript', topic: 'execution model', difficulty: 'standard', title: 'The Call Stack', functionName: 'e2',
        explanation: 'When a function is called, it is "pushed" onto the call stack. When it finishes, it is "popped" off.',
        description: 'Observe inner function execution', template: 'function e2() {\n  function f() { return "f"; }\n  return f();\n}',
        testCases: [{ input: [], expected: "f" }], points: 10
    },
    {
        id: 'exec-3', lang: 'javascript', topic: 'execution model', difficulty: 'standard', title: 'Global Context', functionName: 'e3',
        explanation: 'Variables declared outside any function belong to the Global Execution Context (GEC).',
        description: 'Access a global variable g', template: 'var g = 1;\nfunction e3() {\n  return g;\n}',
        testCases: [{ input: [], expected: 1 }], points: 10
    },
    {
        id: 'exec-4', lang: 'javascript', topic: 'execution model', difficulty: 'standard', title: 'Parameter Passing', functionName: 'e4',
        explanation: 'Parameters are like local variables created when the function is called.',
        description: 'Return the passed parameter x', template: 'function e4(x) {\n  return x;\n}',
        testCases: [{ input: [5], expected: 5 }], points: 10
    },
    {
        id: 'exec-5', lang: 'javascript', topic: 'execution model', difficulty: 'standard', title: 'Shadowing', functionName: 'e5',
        explanation: 'If a local variable has the same name as a global one, the local one "shadows" it.',
        description: 'Predict which x is returned', template: 'let x = 1;\nfunction e5() {\n  let x = 2;\n  return x;\n}',
        testCases: [{ input: [], expected: 2 }], points: 10
    },
    {
        id: 'exec-6', lang: 'javascript', topic: 'execution model', difficulty: 'standard', title: 'Reference Changes', functionName: 'e6',
        explanation: 'Objects are passed by reference. Changing an object inside a function affects the original object!',
        description: 'Modify property "a" of the input object', template: 'function e6(o) {\n  o.a = 2;\n  return o.a;\n}',
        testCases: [{ input: [{ a: 1 }], expected: 2 }], points: 10
    },
    {
        id: 'exec-7', lang: 'javascript', topic: 'execution model', difficulty: 'standard', title: 'Nested Execution', functionName: 'e7',
        explanation: 'Each function call creates its own specialized "Execution Context".',
        description: 'Return value from nested function a()', template: 'function e7() {\n  function a() { return "a"; }\n  return a();\n}',
        testCases: [{ input: [], expected: "a" }], points: 10
    },
    {
        id: 'exec-8', lang: 'javascript', topic: 'execution model', difficulty: 'standard', title: 'Post-Increment', functionName: 'e8',
        explanation: '`x++` returns the current value and *then* increments it.',
        description: 'What is returned by x++ if x is 1?', template: 'let x = 1;\nfunction e8() {\n  return x++;\n}',
        testCases: [{ input: [], expected: 1 }], points: 10
    },
    {
        id: 'exec-9', lang: 'javascript', topic: 'execution model', difficulty: 'standard', title: 'Pre-Increment', functionName: 'e9',
        explanation: '`++x` increments the value *first* and then returns it.',
        description: 'What is returned by ++x if x is 1?', template: 'let x = 1;\nfunction e9() {\n  return ++x;\n}',
        testCases: [{ input: [], expected: 2 }], points: 10
    },
    {
        id: 'exec-10', lang: 'javascript', topic: 'execution model', difficulty: 'standard', title: 'Short Circuiting', functionName: 'e10',
        explanation: 'Logical OR `||` stops and returns the first "truthy" value it finds.',
        description: 'What is (0 || 5)?', template: 'function e10() {\n  let x = 0;\n  return (x || 5);\n}',
        testCases: [{ input: [], expected: 5 }], points: 10
    },

    // --- SCOPE (10) ---
    {
        id: 'scope-1', lang: 'javascript', topic: 'scope', difficulty: 'standard', title: 'Global Scope', functionName: 's1',
        explanation: 'Scope determines where variables are accessible. **Global Scope** variables are defined outside any function and can be seen by *everyone*.',
        description: 'Access the global variable g', template: 'let g = 1;\nfunction s1() {\n  return g;\n}',
        testCases: [{ input: [], expected: 1 }], points: 10
    },
    {
        id: 'scope-2', lang: 'javascript', topic: 'scope', difficulty: 'standard', title: 'Local Scope', functionName: 's2',
        explanation: 'Variables declared inside a block `{}` with `let` or `const` are only available *inside* that block. This is called **Local** or **Block Scope**.',
        description: 'Try to catch the error when accessing a block-scoped variable x outside its block', template: 'function s2() {\n  {\n    let x = 1;\n  }\n  try {\n    return x;\n  } catch(e){ return "err"; }\n}',
        testCases: [{ input: [], expected: "err" }], points: 10
    },
    {
        id: 'scope-3', lang: 'javascript', topic: 'scope', difficulty: 'standard', title: 'Nested Scope', functionName: 's3',
        explanation: 'Functions can "see" variables in their parent scopes. This is often called "Lexical Scope".',
        description: 'Can inner function f access x from the parent?', template: 'function s3() {\n  let x = 1;\n  function f() { return x; }\n  return f();\n}',
        testCases: [{ input: [], expected: 1 }], points: 10
    },
    {
        id: 'scope-4', lang: 'javascript', topic: 'scope', difficulty: 'standard', title: 'Shadowing Redux', functionName: 's4',
        explanation: 'When a function parameter has the same name as an outer variable, the parameter takes priority. This is **Shadowing**.',
        description: 'Return x which is passed as a parameter', template: 'let x = 1;\nfunction s4(x) {\n  return x;\n}',
        testCases: [{ input: [5], expected: 5 }], points: 10
    },
    {
        id: 'scope-5', lang: 'javascript', topic: 'scope', difficulty: 'standard', title: 'Closure Scope', functionName: 's5',
        explanation: 'A closure is formed when a function is returned from another. It "remembers" its original parent scope variables.',
        description: 'Return an arrow function that returns the outer x', template: 'function s5() {\n  let x = 10;\n  return () => x;\n}',
        testCases: [{ input: [], expected: 10 }], points: 10
    },
    {
        id: 'scope-6', lang: 'javascript', topic: 'scope', difficulty: 'standard', title: 'Var Loop Leak', functionName: 's6',
        explanation: 'Because `var` is NOT block-scoped, a `var` declared in a `for` loop "leaks" out and is still available after the loop finishes.',
        description: 'What is the value of i after the loop `for(var i=0; i<3; i++)`?', template: 'function s6() {\n  for(var i=0; i<3; i++){}\n  return i;\n}',
        testCases: [{ input: [], expected: 3 }], points: 10
    },
    {
        id: 'scope-7', lang: 'javascript', topic: 'scope', difficulty: 'standard', title: 'Let Loop Safety', functionName: 's7',
        explanation: 'Unlike `var`, `let` is block-scoped. So the loop variable `i` is destroyed once the loop is over.',
        description: 'Try to catch the error when accessing loop variable i (declared with let) outside the loop', template: 'function s7() {\n  for(let i=0; i<3; i++){}\n  try { return i; }\n  catch(e){ return "err"; }\n}',
        testCases: [{ input: [], expected: "err" }], points: 10
    },
    {
        id: 'scope-8', lang: 'javascript', topic: 'scope', difficulty: 'standard', title: 'Strict Mode Scope', functionName: 's8',
        explanation: 'In normal mode, assigning to a non-existent variable creates a global variable. In `"use strict"`, it throws an error!',
        description: 'Catch the error in strict mode when assigning to x without declaring it', template: 'function s8() {\n  "use strict";\n  try {\n    x = 1;\n  } catch(e){ return "err"; }\n}',
        testCases: [{ input: [], expected: "err" }], points: 10
    },
    {
        id: 'scope-9', lang: 'javascript', topic: 'scope', difficulty: 'standard', title: 'Function Isolation', functionName: 's9',
        explanation: 'Each function has its own private scope. Variables inside one function cannot be seen by another function unless one is nested inside the other.',
        description: 'Does function a() successfully change the outer x?', template: 'function s9() {\n  let x = 1;\n  function a() { let x = 2; }\n  a();\n  return x;\n}',
        testCases: [{ input: [], expected: 1 }], points: 10
    },
    {
        id: 'scope-10', lang: 'javascript', topic: 'scope', difficulty: 'standard', title: 'The Scope Chain', functionName: 's10',
        explanation: 'JS searches for a variable starting in the current scope. If it doesn\'t find it, it looks in the parent, then the grandparent, all the way to global.',
        description: 'Access the global x from nested function a()', template: 'let x = 1;\nfunction s10() {\n  function a() {\n    return x;\n  }\n  return a();\n}',
        testCases: [{ input: [], expected: 1 }], points: 10
    },

    // --- CLOSURE (10) ---
    {
        id: 'clos-1', lang: 'javascript', topic: 'closure', difficulty: 'standard', title: 'Basic Closure', functionName: 'c1',
        explanation: 'A closure happens when an inner function is able to access the variables of its outer function even AFTER the outer function has finished executing.',
        description: 'Return a function that increments and returns a private x', template: 'function c1() {\n  let x = 0;\n  return () => ++x;\n}',
        testCases: [{ input: [], expected: 1 }], points: 15
    },
    {
        id: 'clos-2', lang: 'javascript', topic: 'closure', difficulty: 'standard', title: 'State Persistence', functionName: 'c2',
        explanation: 'Closures are great for "remembering" data. The returned object "closes over" the `val` parameter.',
        description: 'Return an object with a get() method that returns the passed val', template: 'function c2(val) {\n  return {\n    get: () => val\n  };\n}',
        testCases: [{ input: [5], expected: 5 }], points: 15
    },
    {
        id: 'clos-3', lang: 'javascript', topic: 'closure', difficulty: 'standard', title: 'The Multiplier Factory', functionName: 'c3',
        explanation: 'This is a "Function Factory". `c3` creates specialized functions that multiply by a specific number.',
        description: 'Return a function that multiplies its input by m', template: 'function c3(m) {\n  return (n) => n * m;\n}',
        testCases: [{ input: [2], expected: 10 }], points: 15
    },
    {
        id: 'clos-4', lang: 'javascript', topic: 'closure', difficulty: 'standard', title: 'Private Variables', functionName: 'c4',
        explanation: 'By returning only specific methods, you can keep certain variables "private" and untouchable from the outside world.',
        description: 'Return an object with reveal() method to see the "secret"', template: 'function c4() {\n  let secret = "shh";\n  return {\n    reveal: () => secret\n  };\n}',
        testCases: [{ input: [], expected: "shh" }], points: 15
    },
    {
        id: 'clos-5', lang: 'javascript', topic: 'closure', difficulty: 'standard', title: 'Loop Closure Fix', functionName: 'c5',
        explanation: 'Before `let`, people used IIFEs to fix closure issues in loops. With `let`, each loop iteration gets its own unique variable block!',
        description: 'Return the value from the 2nd index of the generated array', template: 'function c5() {\n  let arr = [];\n  for(let i=0; i<3; i++){\n    arr.push(() => i);\n  }\n  return arr[1]();\n}',
        testCases: [{ input: [], expected: 1 }], points: 15
    },
    {
        id: 'clos-6', lang: 'javascript', topic: 'closure', difficulty: 'standard', title: 'Shared References', functionName: 'c6',
        explanation: 'Multiple inner functions can share the SAME closure. Modifying the variable in one function affects the result of the other.',
        description: 'Return two functions in an array: one to increment x, one to return x', template: 'function c6() {\n  let x = 0;\n  return [\n    ()=>++x, \n    ()=>x\n  ];\n}',
        testCases: [{ input: [], expected: 1 }], points: 15
    },
    {
        id: 'clos-7', lang: 'javascript', topic: 'closure', difficulty: 'standard', title: 'Execute Once', functionName: 'c7',
        explanation: 'A common pattern! Use a boolean inside a closure to ensure a sensitive function only runs once.',
        description: 'Create a function that only calls f the first time it is invoked', template: 'function c7(f) {\n  let called = false;\n  return () => {\n    if(!called){\n      called=true;\n      return f();\n    }\n  };\n}',
        testCases: [{ input: [() => 1], expected: 1 }], points: 20
    },
    {
        id: 'clos-8', lang: 'javascript', topic: 'closure', difficulty: 'standard', title: 'Memoization Basic', functionName: 'c8',
        explanation: 'Closures can act as a simple "Cache" to save the result of expensive calculations.',
        description: 'Store the result of f() so it only runs once', template: 'function c8(f) {\n  let cache;\n  return () => cache || (cache = f());\n}',
        testCases: [{ input: [() => 5], expected: 5 }], points: 20
    },
    {
        id: 'clos-9', lang: 'javascript', topic: 'closure', difficulty: 'standard', title: 'Currying Basics', functionName: 'c9',
        explanation: 'Currying is transforming a function that takes multiple arguments into a sequence of functions that each take one argument.',
        description: 'Return a function that adds its input b to a', template: 'function c9(a) {\n  return (b) => a + b;\n}',
        testCases: [{ input: [1], expected: 3 }], points: 15
    },
    {
        id: 'clos-10', lang: 'javascript', topic: 'closure', difficulty: 'standard', title: 'Unique Instances', functionName: 'c10',
        explanation: 'Every time you call the parent function, a BRAND NEW closure environment is created. They don\'t share state!',
        description: 'Use a generator-style closure to return IDs', template: 'function c10() {\n  let id = 0;\n  return () => ++id;\n}',
        testCases: [{ input: [], expected: 1 }], points: 15
    },

    // --- FUNCTIONS (10) ---
    {
        id: 'func-1', lang: 'javascript', topic: 'all types of functions', difficulty: 'standard', title: 'Declaration', functionName: 'f1',
        explanation: 'The classic way! Function declarations are hoisted and define a named block of code.',
        description: 'Define a function f1 returning 1', template: 'function f1() {\n  return 1;\n}',
        testCases: [{ input: [], expected: 1 }], points: 5
    },
    {
        id: 'func-2', lang: 'javascript', topic: 'all types of functions', difficulty: 'standard', title: 'Function Expression', functionName: 'f2',
        explanation: 'Assigning an anonymous function to a variable creates a "Function Expression". These are NOT hoisted.',
        description: 'Assign function returning 1 to const f2', template: 'const f2 = function() {\n  return 1;\n};',
        testCases: [{ input: [], expected: 1 }], points: 5
    },
    {
        id: 'func-3', lang: 'javascript', topic: 'all types of functions', difficulty: 'standard', title: 'Arrow Functions', functionName: 'f3',
        explanation: 'Arrow functions are shorter and DO NOT have their own `this` context. Useful for callbacks!',
        description: 'Create an arrow function f3 returning 1', template: 'const f3 = () => 1;',
        testCases: [{ input: [], expected: 1 }], points: 5
    },
    {
        id: 'func-4', lang: 'javascript', topic: 'all types of functions', difficulty: 'standard', title: 'IIFE', functionName: 'f4',
        explanation: 'Immediately Invoked Function Expressions run as soon as they are defined. Great for data encapsulation.',
        description: 'Return value from an IIFE', template: 'function f4() {\n  return (function(){\n    return 1;\n  })();\n}',
        testCases: [{ input: [], expected: 1 }], points: 10
    },
    {
        id: 'func-5', lang: 'javascript', topic: 'all types of functions', difficulty: 'standard', title: 'Rest Parameters', functionName: 'f5',
        explanation: 'Use `...args` to collect any number of inputs into a single array.',
        description: 'Return the number of arguments passed using rest params', template: 'function f5(...args) {\n  return args.length;\n}',
        testCases: [{ input: [1, 2, 3], expected: 3 }], points: 10
    },
    {
        id: 'func-6', lang: 'javascript', topic: 'all types of functions', difficulty: 'standard', title: 'Default Parameters', functionName: 'f6',
        explanation: 'You can provide default values for parameters in case the caller forgets them.',
        description: 'Set default of x to 10', template: 'function f6(x = 10) {\n  return x;\n}',
        testCases: [{ input: [], expected: 10 }], points: 5
    },
    {
        id: 'func-7', lang: 'javascript', topic: 'all types of functions', difficulty: 'standard', title: 'Higher Order Functions', functionName: 'f7',
        explanation: 'A function that takes another function as an argument is called a "Higher Order Function".',
        description: 'Call the passed function f and return its result', template: 'function f7(f) {\n  return f();\n}',
        testCases: [{ input: [() => 1], expected: 1 }], points: 10
    },
    {
        id: 'func-8', lang: 'javascript', topic: 'all types of functions', difficulty: 'standard', title: 'Constructors', functionName: 'f8',
        explanation: 'Constructor functions (used with `new`) help create objects. They usually set values on `this`.',
        description: 'Define a simple constructor f8 setting a=1', template: 'function f8() {\n  this.a = 1;\n}',
        testCases: [{ input: [], expected: undefined }], points: 10
    },
    {
        id: 'func-9', lang: 'javascript', topic: 'all types of functions', difficulty: 'standard', title: 'Object Methods', functionName: 'f9',
        explanation: 'Functions inside objects are called "Methods". Modern JS allows a shorthand syntax.',
        description: 'Define an object method f9 returning 1', template: 'const obj = {\n  f9() {\n     return 1;\n  }\n};',
        testCases: [{ input: [], expected: 1 }], points: 5
    },
    {
        id: 'func-10', lang: 'javascript', topic: 'all types of functions', difficulty: 'standard', title: 'Recursion Basics', functionName: 'f10',
        explanation: 'Recursion is a function calling itself. You always need a **Base Case** to stop the loop, otherwise you\'ll crash the browser!',
        description: 'Complete the recursive factorial check', template: 'function f10(n) {\n  if(n<=1) return 1;\n  return n * f10(n-1);\n}',
        testCases: [{ input: [3], expected: 6 }], points: 15
    },

    // --- PREDICT THIS (10) ---
    {
        id: 'pred-1', lang: 'javascript', topic: 'predict this', difficulty: 'standard', title: 'This Global', functionName: 'p1',
        explanation: 'In a regular function called in the global context, `this` refers to the **Global Object** (`window` in browsers, `global` in Node).',
        description: 'Does this point to global/window?', template: 'function p1() {\n  return (this === global || this === window);\n}',
        testCases: [{ input: [], expected: true }], points: 15
    },
    {
        id: 'pred-2', lang: 'javascript', topic: 'predict this', difficulty: 'standard', title: 'Method This', functionName: 'p2',
        explanation: 'When a function is called as a method (e.g., `obj.method()`), `this` points to the object the method belongs to.',
        description: 'Predict what obj.p2() returns', template: 'const obj = {\n  a: 1,\n  p2() { return this.a; }\n};',
        testCases: [{ input: [], expected: 1 }], points: 15
    },
    {
        id: 'pred-3', lang: 'javascript', topic: 'predict this', difficulty: 'standard', title: 'Arrow This', functionName: 'p3',
        explanation: 'Arrow functions DO NOT have their own `this`. They inherit it from the surrounding code where they were created.',
        description: 'Does an arrow function inside an object get the object as this?', template: 'const obj2 = {\n  a: 1,\n  p3: () => this.a\n};',
        testCases: [{ input: [], expected: undefined }], points: 20
    },
    {
        id: 'pred-4', lang: 'javascript', topic: 'predict this', difficulty: 'standard', title: 'Explicit Call', functionName: 'p4',
        explanation: '`.call()` allows you to manually set the `this` value for a single function execution.',
        description: 'Set this to {a:10} using call', template: 'function f(){ return this.a; }\nfunction p4(){ return f.call({a:10}); }',
        testCases: [{ input: [], expected: 10 }], points: 15
    },
    {
        id: 'pred-5', lang: 'javascript', topic: 'predict this', difficulty: 'standard', title: 'Explicit Apply', functionName: 'p5',
        explanation: '`.apply()` works like `.call()`, but it takes the function arguments as an array.',
        description: 'Use apply to call f with this={a:5}', template: 'function f(x) { return this.a + x; }\nfunction p5() { return f.apply({a: 5}, [10]); }',
        testCases: [{ input: [], expected: 15 }], points: 15
    },
    {
        id: 'pred-6', lang: 'javascript', topic: 'predict this', difficulty: 'standard', title: 'Bind', functionName: 'p6',
        explanation: '`.bind()` creates a NEW function that is permanently "glued" to a specific `this` value.',
        description: 'Return a bound function result', template: 'function f(){ return this.a; } \nfunction p6(){ const g = f.bind({a: 10}); return g(); }',
        testCases: [{ input: [], expected: 10 }], points: 15
    },
    {
        id: 'pred-7', lang: 'javascript', topic: 'predict this', difficulty: 'standard', title: 'New Context', functionName: 'p7',
        explanation: 'When using `new`, JS creates a blank object, sets `this` to point to it, and then returns it automatically.',
        description: 'What is o.a in a new F()?', template: 'function F() { this.a = 1; }\nfunction p7() {\n  const o = new F();\n  return o.a;\n}',
        testCases: [{ input: [], expected: 1 }], points: 15
    },
    {
        id: 'pred-8', lang: 'javascript', topic: 'predict this', difficulty: 'standard', title: 'Lost Context', functionName: 'p8',
        explanation: 'If you extract a method from an object and call it separately, the connection to the object is LOST. `this` reverts to global.',
        description: 'What happens when you extract and call the method?', template: 'function p8() {\n  const obj = {\n    a: 1,\n    f() { return this.a; }\n  };\n  const g = obj.f;\n  try {\n    return g();\n  } catch(e){ return "err"; }\n}',
        testCases: [{ input: [], expected: undefined }], points: 20
    },
    {
        id: 'pred-9', lang: 'javascript', topic: 'predict this', difficulty: 'standard', title: 'Strict This', functionName: 'p9',
        explanation: 'In `"use strict"`, `this` in a regular function call is `undefined` instead of the global object.',
        description: 'What is this in strict mode?', template: 'function p9() {\n  "use strict";\n  function f() { return this; }\n  return f();\n}',
        testCases: [{ input: [], expected: undefined }], points: 15
    },
    {
        id: 'pred-10', lang: 'javascript', topic: 'predict this', difficulty: 'standard', title: 'Class This', functionName: 'p10',
        explanation: 'Classes are syntactical sugar over constructor functions. `this` inside methods refers to the class instance.',
        description: 'Predict result from class method', template: 'function p10() {\n  class C {\n    constructor(){this.a=1;}\n    f(){return this.a;}\n  }\n  return new C().f();\n}',
        testCases: [{ input: [], expected: 1 }], points: 15
    },

    // --- OBJECTS (10) ---
    {
        id: 'obj-1', lang: 'javascript', topic: 'objects', difficulty: 'standard', title: 'Literal', functionName: 'o1',
        explanation: 'An object is a collection of related data and/or functionality. Use curly braces `{}` to create one.',
        description: 'Return an object with property a = 1', template: 'function o1() {\n  return { a: 1 };\n}',
        testCases: [{ input: [], expected: { a: 1 } }], points: 5
    },
    {
        id: 'obj-2', lang: 'javascript', topic: 'objects', difficulty: 'standard', title: 'Access', functionName: 'o2',
        explanation: 'Use the "dot" operator `.` to access properties on an object.',
        description: 'Return the value of property "a" from the input obj', template: 'function o2(obj) {\n  return obj.a;\n}',
        testCases: [{ input: [{ a: 1 }], expected: 1 }], points: 5
    },
    {
        id: 'obj-3', lang: 'javascript', topic: 'objects', difficulty: 'standard', title: 'Bracket', functionName: 'o3',
        explanation: 'If the property name is stored in a variable, you must use square brackets `[]` instead of dot access.',
        description: 'Access the property named by the input "key"', template: 'function o3(obj, key) {\n  return obj[key];\n}',
        testCases: [{ input: [{ a: 1 }, "a"], expected: 1 }], points: 5
    },
    {
        id: 'obj-4', lang: 'javascript', topic: 'objects', difficulty: 'standard', title: 'Keys', functionName: 'o4',
        explanation: '`Object.keys(obj)` returns an array containing all the property names (keys) of an object.',
        description: 'Return an array of all keys in the obj', template: 'function o4(obj) {\n  return Object.keys(obj);\n}',
        testCases: [{ input: [{ a: 1, b: 2 }], expected: ["a", "b"] }], points: 10
    },
    {
        id: 'obj-5', lang: 'javascript', topic: 'objects', difficulty: 'standard', title: 'Values', functionName: 'o5',
        explanation: 'Similarly, `Object.values(obj)` returns an array of all the values inside the object.',
        description: 'Return an array of all values in the obj', template: 'function o5(obj) {\n  return Object.values(obj);\n}',
        testCases: [{ input: [{ a: 1, b: 2 }], expected: [1, 2] }], points: 10
    },
    {
        id: 'obj-6', lang: 'javascript', topic: 'objects', difficulty: 'standard', title: 'Assign', functionName: 'o6',
        explanation: '`Object.assign()` copies properties from one or more source objects to a target object. It is great for merging data.',
        description: 'Merge object a and b into a new object', template: 'function o6(a, b) {\n  return Object.assign({}, a, b);\n}',
        testCases: [{ input: [{ a: 1 }, { b: 2 }], expected: { a: 1, b: 2 } }], points: 10
    },
    {
        id: 'obj-7', lang: 'javascript', topic: 'objects', difficulty: 'standard', title: 'Freeze', functionName: 'o7',
        explanation: '`Object.freeze(obj)` makes an object "immutable", meaning you can no longer add, remove, or change its properties.',
        description: 'Freeze the object and try to change it. What is returned?', template: 'function o7(obj) {\n  Object.freeze(obj);\n  obj.a = 2;\n  return obj.a;\n}',
        testCases: [{ input: [{ a: 1 }], expected: 1 }], points: 15
    },
    {
        id: 'obj-8', lang: 'javascript', topic: 'objects', difficulty: 'standard', title: 'Delete', functionName: 'o8',
        explanation: 'Use the `delete` keyword to permanently remove a property from an object.',
        description: 'Delete property "a" and return what remains of it', template: 'function o8(obj) {\n  delete obj.a;\n  return obj.a;\n}',
        testCases: [{ input: [{ a: 1 }], expected: undefined }], points: 10
    },
    {
        id: 'obj-9', lang: 'javascript', topic: 'objects', difficulty: 'standard', title: 'Has Own', functionName: 'o9',
        explanation: 'This method checks if an object has a specific property of its own (not one inherited from its prototype).',
        description: 'Check if obj has property "a"', template: 'function o9(obj, k) {\n  return obj.hasOwnProperty(k);\n}',
        testCases: [{ input: [{ a: 1 }, "a"], expected: true }], points: 5
    },
    {
        id: 'obj-10', lang: 'javascript', topic: 'objects', difficulty: 'standard', title: 'Shorthand', functionName: 'o10',
        explanation: 'In ES6, if the variable name matches the property name, you can just write it once!',
        description: 'Return an object {a: a} using shorthand', template: 'function o10(a) {\n  return { a };\n}',
        testCases: [{ input: [1], expected: { a: 1 } }], points: 5
    },

    // --- ARRAY (10) ---
    {
        id: 'arr-1', lang: 'javascript', topic: 'array', difficulty: 'standard', title: 'Array Literal', functionName: 'a1',
        explanation: 'An Array is an ordered list of values. You create one using square brackets `[]`.',
        description: 'Return an array containing numbers 1, 2, and 3', template: 'function a1() {\n  return [1, 2, 3];\n}',
        testCases: [{ input: [], expected: [1, 2, 3] }], points: 5
    },
    {
        id: 'arr-2', lang: 'javascript', topic: 'array', difficulty: 'standard', title: 'Length Property', functionName: 'a2',
        explanation: 'Every array has a `.length` property that tells you how many items are inside.',
        description: 'Return the length of the input array', template: 'function a2(arr) {\n  return arr.length;\n}',
        testCases: [{ input: [[1, 2]], expected: 2 }], points: 5
    },
    {
        id: 'arr-3', lang: 'javascript', topic: 'array', difficulty: 'standard', title: 'Array Indexing', functionName: 'a3',
        explanation: 'Arrays are **zero-indexed**, meaning the first item is at index `0`, the second at `1`, and so on.',
        description: 'Return the second item (index 1) of the array', template: 'function a3(arr) {\n  return arr[1];\n}',
        testCases: [{ input: [[1, 2]], expected: 2 }], points: 5
    },
    {
        id: 'arr-4', lang: 'javascript', topic: 'array', difficulty: 'standard', title: 'push()', functionName: 'a4',
        explanation: '`.push()` adds one or more items to the END of an array and returns the new length.',
        description: 'Add the number 1 to the end of the input array', template: 'function a4(arr) {\n  arr.push(1);\n  return arr;\n}',
        testCases: [{ input: [[]], expected: [1] }], points: 5
    },
    {
        id: 'arr-5', lang: 'javascript', topic: 'array', difficulty: 'standard', title: 'pop()', functionName: 'a5',
        explanation: '`.pop()` removes the LAST item from an array and returns that item.',
        description: 'Remove and return the last item from the array', template: 'function a5(arr) {\n  return arr.pop();\n}',
        testCases: [{ input: [[1, 2]], expected: 2 }], points: 10
    },
    {
        id: 'arr-6', lang: 'javascript', topic: 'array', difficulty: 'standard', title: 'unshift()', functionName: 'a6',
        explanation: '`.unshift()` adds an item to the BEGINNING of an array.',
        description: 'Add the input "val" to the start of the array', template: 'function a6(arr, val) {\n  arr.unshift(val);\n  return arr;\n}',
        testCases: [{ input: [[1], 0], expected: [0, 1] }], points: 10
    },
    {
        id: 'arr-7', lang: 'javascript', topic: 'array', difficulty: 'standard', title: 'shift()', functionName: 'a7',
        explanation: '`.shift()` removes the FIRST item from an array.',
        description: 'Remove and return the first item from the array', template: 'function a7(arr) {\n  return arr.shift();\n}',
        testCases: [{ input: [[1, 2]], expected: 1 }], points: 10
    },
    {
        id: 'arr-8', lang: 'javascript', topic: 'array', difficulty: 'standard', title: 'indexOf()', functionName: 'a8',
        explanation: '`.indexOf(val)` searches the array for a specific value and returns its first index location. If not found, it returns `-1`.',
        description: 'Find at what index the "val" is located', template: 'function a8(arr, val) {\n  return arr.indexOf(val);\n}',
        testCases: [{ input: [[1, 2, 3], 2], expected: 1 }], points: 10
    },
    {
        id: 'arr-9', lang: 'javascript', topic: 'array', difficulty: 'standard', title: 'join()', functionName: 'a9',
        explanation: '`.join("-")` combines all array items into one string, separated by the string you provide.',
        description: 'Join array items with a hyphen "-"', template: 'function a9(arr) {\n  return arr.join("-");\n}',
        testCases: [{ input: [[1, 2]], expected: "1-2" }], points: 5
    },
    {
        id: 'arr-10', lang: 'javascript', topic: 'array', difficulty: 'standard', title: 'reverse()', functionName: 'a10',
        explanation: '`.reverse()` flips the order of an array in place.',
        description: 'Reverse the input array', template: 'function a10(arr) {\n  return arr.reverse();\n}',
        testCases: [{ input: [[1, 2]], expected: [2, 1] }], points: 10
    },

    // --- ARRAY METHODS (10) ---
    {
        id: 'meth-1', lang: 'javascript', topic: 'array methods', difficulty: 'standard', title: 'map()', functionName: 'm1',
        explanation: '`.map()` creates a NEW array by transforming every item in the original array. It is the heart of functional programming!',
        description: 'Double every number in the input array', template: 'function m1(arr) {\n  return arr.map(x => x * 2);\n}',
        testCases: [{ input: [[1, 2]], expected: [2, 4] }], points: 15
    },
    {
        id: 'meth-2', lang: 'javascript', topic: 'array methods', difficulty: 'standard', title: 'filter()', functionName: 'm2',
        explanation: '`.filter()` creates a new array containing ONLY the items that pass a specific test.',
        description: 'Keep only even numbers from the array', template: 'function m2(arr) {\n  return arr.filter(x => x % 2 === 0);\n}',
        testCases: [{ input: [[1, 2, 3, 4]], expected: [2, 4] }], points: 15
    },
    {
        id: 'meth-3', lang: 'javascript', topic: 'array methods', difficulty: 'standard', title: 'reduce()', functionName: 'm3',
        explanation: '`.reduce()` boils an entire array down to a single value (like a sum or average). It takes an "accumulator" and the current item.',
        description: 'Sum all numbers in the array using reduce', template: 'function m3(arr) {\n  return arr.reduce((acc, current) => acc + current, 0);\n}',
        testCases: [{ input: [[1, 2, 3]], expected: 6 }], points: 20
    },
    {
        id: 'meth-4', lang: 'javascript', topic: 'array methods', difficulty: 'standard', title: 'forEach()', functionName: 'm4',
        explanation: '`.forEach()` runs a piece of code for every item. Unlike `map`, it does NOT return anything.',
        description: 'Use forEach to sum items into a separate variable s', template: 'function m4(arr) {\n  let s = 0;\n  arr.forEach(x => s += x);\n  return s;\n}',
        testCases: [{ input: [[1, 2]], expected: 3 }], points: 10
    },
    {
        id: 'meth-5', lang: 'javascript', topic: 'array methods', difficulty: 'standard', title: 'find()', functionName: 'm5',
        explanation: '`.find()` returns the FIRST item that matches your condition.',
        description: 'Find the first number greater than 10', template: 'function m5(arr) {\n  return arr.find(x => x > 10);\n}',
        testCases: [{ input: [[1, 20, 5]], expected: 20 }], points: 15
    },
    {
        id: 'meth-6', lang: 'javascript', topic: 'array methods', difficulty: 'standard', title: 'every()', functionName: 'm6',
        explanation: '`.every()` returns true only if ALL items in the array pass the test.',
        description: 'Are all numbers in the array positive (> 0)?', template: 'function m6(arr) {\n  return arr.every(x => x > 0);\n}',
        testCases: [{ input: [[1, 2]], expected: true }], points: 10
    },
    {
        id: 'meth-7', lang: 'javascript', topic: 'array methods', difficulty: 'standard', title: 'some()', functionName: 'm7',
        explanation: '`.some()` returns true if at least ONE item in the array passes the test.',
        description: 'Is there any number greater than 10?', template: 'function m7(arr) {\n  return arr.some(x => x > 10);\n}',
        testCases: [{ input: [[1, 2]], expected: false }], points: 10
    },
    {
        id: 'meth-8', lang: 'javascript', topic: 'array methods', difficulty: 'standard', title: 'sort()', functionName: 'm8',
        explanation: '`.sort()` sorts an array. By default, it sorts as strings "10" comes before "2"! Always provide a comparison function like `(a, b) => a - b` for numbers.',
        description: 'Sort the array of numbers in ascending order', template: 'function m8(arr) {\n  return arr.sort((a, b) => a - b);\n}',
        testCases: [{ input: [[3, 1, 2]], expected: [1, 2, 3] }], points: 15
    },
    {
        id: 'meth-9', lang: 'javascript', topic: 'array methods', difficulty: 'standard', title: 'flat()', functionName: 'm9',
        explanation: '`.flat()` "unpacks" nested arrays into a single flat array.',
        description: 'Flatten a 2D array [[1], [2]] into [1, 2]', template: 'function m9(arr) {\n  return arr.flat();\n}',
        testCases: [{ input: [[[1], [2]]], expected: [1, 2] }], points: 15
    },
    {
        id: 'meth-10', lang: 'javascript', topic: 'array methods', difficulty: 'standard', title: 'concat()', functionName: 'm10',
        explanation: '`.concat()` joins two or more arrays and returns a brand new array.',
        description: 'Merge array a and array b', template: 'function m10(a, b) {\n  return a.concat(b);\n}',
        testCases: [{ input: [[1], [2]], expected: [1, 2] }], points: 10
    },

    // --- EQUALITY (10) ---
    {
        id: 'eq-1', lang: 'javascript', topic: 'equal/comparison', difficulty: 'standard', title: 'Strict Equality', functionName: 'eq1',
        explanation: '`===` is the **Strict Equality** operator. It only returns true if both the value AND the type (like number vs string) are exactly the same.',
        description: 'Is 1 strictly equal to "1"?', template: 'function eq1() {\n  return 1 === "1";\n}',
        testCases: [{ input: [], expected: false }], points: 10
    },
    {
        id: 'eq-2', lang: 'javascript', topic: 'equal/comparison', difficulty: 'standard', title: 'Loose Equality', functionName: 'eq2',
        explanation: '`==` is **Loose Equality**. JS will try to convert types to match before comparing (e.g., it turns string "1" into a number 1). This is often confusing, so `===` is usually safer!',
        description: 'Is 1 loosely equal to "1"?', template: 'function eq2() {\n  return 1 == "1";\n}',
        testCases: [{ input: [], expected: true }], points: 10
    },
    {
        id: 'eq-3', lang: 'javascript', topic: 'equal/comparison', difficulty: 'standard', title: 'Object Comparison', functionName: 'eq3',
        explanation: 'When you compare two objects (or arrays), JS checks if they are the SAME exact instance in memory, not if they "look" the same.',
        description: 'Are two different empty objects strictly equal?', template: 'function eq3() {\n  const a = {};\n  const b = {};\n  return a === b;\n}',
        testCases: [{ input: [], expected: false }], points: 15
    },
    {
        id: 'eq-4', lang: 'javascript', topic: 'equal/comparison', difficulty: 'standard', title: 'Reference Equality', functionName: 'eq4',
        explanation: 'If two variables point to the exact same object in memory, they are equal.',
        description: 'If b points to object a, are they equal?', template: 'function eq4() {\n  const a = {};\n  const b = a;\n  return a === b;\n}',
        testCases: [{ input: [], expected: true }], points: 15
    },
    {
        id: 'eq-5', lang: 'javascript', topic: 'equal/comparison', difficulty: 'standard', title: 'NaN is Weird', functionName: 'eq5',
        explanation: '`NaN` (Not a Number) is the only value in JS that is NOT equal to itself! `NaN === NaN` is false.',
        description: 'Predict the result of NaN === NaN', template: 'function eq5() {\n  return NaN === NaN;\n}',
        testCases: [{ input: [], expected: false }], points: 15
    },
    {
        id: 'eq-6', lang: 'javascript', topic: 'equal/comparison', difficulty: 'standard', title: 'Object.is()', functionName: 'eq6',
        explanation: '`Object.is()` is a more reliable way to check equality. Unlike `===`, it correctly identifies that `NaN` is equal to `NaN`.',
        description: 'Use Object.is to compare NaN and NaN', template: 'function eq6() {\n  return Object.is(NaN, NaN);\n}',
        testCases: [{ input: [], expected: true }], points: 15
    },
    {
        id: 'eq-7', lang: 'javascript', topic: 'equal/comparison', difficulty: 'standard', title: 'Null & Undefined', functionName: 'eq7',
        explanation: 'Loosely, `null` and `undefined` are equal. This is one of the few times `==` is actually useful!',
        description: 'Is null loosely equal to undefined?', template: 'function eq7() {\n  return null == undefined;\n}',
        testCases: [{ input: [], expected: true }], points: 10
    },
    {
        id: 'eq-8', lang: 'javascript', topic: 'equal/comparison', difficulty: 'standard', title: 'Strict Null Check', functionName: 'eq8',
        explanation: 'Strictly, `null` and `undefined` are DIFFERENT types.',
        description: 'Is null strictly equal to undefined?', template: 'function eq8() {\n  return null === undefined;\n}',
        testCases: [{ input: [], expected: false }], points: 10
    },
    {
        id: 'eq-9', lang: 'javascript', topic: 'equal/comparison', difficulty: 'standard', title: 'The Empty String', functionName: 'eq9',
        explanation: 'In loose comparison, an empty string `""` is considered equal to number `0`. Be careful!',
        description: 'Is "" loosely equal to 0?', template: 'function eq9() {\n  return "" == 0;\n}',
        testCases: [{ input: [], expected: true }], points: 10
    },
    {
        id: 'eq-10', lang: 'javascript', topic: 'equal/comparison', difficulty: 'standard', title: 'Truthiness', functionName: 'eq10',
        explanation: 'The double-bang `!!` is a shortcut to convert any value into its Boolean (true/false) equivalent.',
        description: 'What is !!1 (the truthiness of 1)?', template: 'function eq10() {\n  return !!1;\n}',
        testCases: [{ input: [], expected: true }], points: 10
    },

    // --- CONDITIONS (10) ---
    {
        id: 'cond-1', lang: 'javascript', topic: 'conditions and workflow', difficulty: 'standard', title: 'If Else', functionName: 'co1',
        explanation: 'The `if` statement runs code only if a condition is true. `else` provides a fallback plan.',
        description: 'Return "yes" if x is truthy, otherwise "no"', template: 'function co1(x) {\n  if(x) return "yes";\n  else return "no";\n}',
        testCases: [{ input: [true], expected: "yes" }], points: 5
    },
    {
        id: 'cond-2', lang: 'javascript', topic: 'conditions and workflow', difficulty: 'standard', title: 'Comparison Ops', functionName: 'co2',
        explanation: 'Use `>` (greater than) and `<` (less than) to compare numbers in your conditions.',
        description: 'If x > 10 return "big", else "small"', template: 'function co2(x) {\n  if(x > 10) return "big";\n  else return "small";\n}',
        testCases: [{ input: [15], expected: "big" }], points: 5
    },
    {
        id: 'cond-3', lang: 'javascript', topic: 'conditions and workflow', difficulty: 'standard', title: 'Nested Ifs', functionName: 'co3',
        explanation: 'You can put an `if` inside another `if` to check multiple related requirements.',
        description: 'Check a and then b. Return 2 if both true, 1 if only a, 0 if neither.', template: 'function co3(a, b) {\n  if(a) {\n    if(b) return 2;\n    return 1;\n  }\n  return 0;\n}',
        testCases: [{ input: [true, true], expected: 2 }], points: 10
    },
    {
        id: 'cond-4', lang: 'javascript', topic: 'conditions and workflow', difficulty: 'standard', title: 'Logical AND (&&)', functionName: 'co4',
        explanation: 'The `&&` (AND) operator returns true only if BOTH conditions on either side are true.',
        description: 'Return true if both a and b are true', template: 'function co4(a, b) {\n  return a && b;\n}',
        testCases: [{ input: [true, false], expected: false }], points: 5
    },
    {
        id: 'cond-5', lang: 'javascript', topic: 'conditions and workflow', difficulty: 'standard', title: 'Logical OR (||)', functionName: 'co5',
        explanation: 'The `||` (OR) operator returns true if AT LEAST ONE of the conditions is true.',
        description: 'Return true if either a or b is true', template: 'function co5(a, b) {\n  return a || b;\n}',
        testCases: [{ input: [true, false], expected: true }], points: 5
    },
    {
        id: 'cond-6', lang: 'javascript', topic: 'conditions and workflow', difficulty: 'standard', title: 'Logical NOT (!)', functionName: 'co6',
        explanation: 'The `!` (NOT) operator "flips" a boolean. True becomes false, and false becomes true.',
        description: 'Return the opposite of boolean a', template: 'function co6(a) {\n  return !a;\n}',
        testCases: [{ input: [true], expected: false }], points: 5
    },
    {
        id: 'cond-7', lang: 'javascript', topic: 'conditions and workflow', difficulty: 'standard', title: 'Operator Precedence', functionName: 'co7',
        explanation: 'Like math, logical operators have an order! `&&` is usually calculated BEFORE `||`. Use parentheses `()` to control exactly how code runs.',
        description: 'Is it (a or b) AND c?', template: 'function co7(a, b, c) {\n  return (a || b) && c;\n}',
        testCases: [{ input: [true, false, true], expected: true }], points: 10
    },
    {
        id: 'cond-8', lang: 'javascript', topic: 'conditions and workflow', difficulty: 'standard', title: 'The Zero Case', functionName: 'co8',
        explanation: 'In JS, `0` is considered "falsy". If you want to check if a number is specifically zero, use a direct comparison `x === 0`.',
        description: 'Strictly check if x is zero', template: 'function co8(x) {\n  return x === 0;\n}',
        testCases: [{ input: [0], expected: true }], points: 5
    },
    {
        id: 'cond-9', lang: 'javascript', topic: 'conditions and workflow', difficulty: 'standard', title: 'Empty String Check', functionName: 'co9',
        explanation: 'Empty strings `""` are also "falsy".',
        description: 'Check if string is empty', template: 'function co9(x) {\n  return x === "";\n}',
        testCases: [{ input: [""], expected: true }], points: 5
    },
    {
        id: 'cond-10', lang: 'javascript', topic: 'conditions and workflow', difficulty: 'standard', title: 'Boolean Logic', functionName: 'co10',
        explanation: 'Combining multiple NOT, AND, and OR operators lets you build very complex logic gates.',
        description: 'XOR simulation: return true if ONLY one of a or b is true.', template: 'function co10(a, b) {\n  return (a && !b) || (!a && b);\n}',
        testCases: [{ input: [true, false], expected: true }], points: 15
    },

    // --- SWITCH (10) ---
    {
        id: 'sw-1', lang: 'javascript', topic: 'switch', difficulty: 'standard', title: 'Basic Switch', functionName: 'sw1',
        explanation: 'A `switch` statement is a cleaner way to write many `if-else` checks against a single value.',
        description: 'Map 1 to "one", otherwise "other"', template: 'function sw1(x) {\n  switch(x) {\n    case 1: return "one";\n    default: return "other";\n  }\n}',
        testCases: [{ input: [1], expected: "one" }], points: 10
    },
    {
        id: 'sw-2', lang: 'javascript', topic: 'switch', difficulty: 'standard', title: 'The Default Case', functionName: 'sw2',
        explanation: 'The `default` block runs if none of the other cases match. It is like the final `else` in an if-chain.',
        description: 'If case 1 is not matched, return 0', template: 'function sw2(x) {\n  switch(x) {\n    case 1: return 1;\n    default: return 0;\n  }\n}',
        testCases: [{ input: [5], expected: 0 }], points: 10
    },
    {
        id: 'sw-3', lang: 'javascript', topic: 'switch', difficulty: 'standard', title: 'Falling Through', functionName: 'sw3',
        explanation: 'You can "stack" multiple cases to run the same code for different inputs.',
        description: 'Return "low" for 1 or 2, otherwise "high"', template: 'function sw3(x) {\n  switch(x) {\n    case 1:\n    case 2: return "low";\n    default: return "high";\n  }\n}',
        testCases: [{ input: [2], expected: "low" }], points: 10
    },
    {
        id: 'sw-4', lang: 'javascript', topic: 'switch', difficulty: 'standard', title: 'Type Checking', functionName: 'sw4',
        explanation: 'Switching on `typeof` is a great way to handle dynamic inputs.',
        description: 'Return "S" if x is a string, else "N"', template: 'function sw4(x) {\n  switch(typeof x) {\n    case "string": return "S";\n    default: return "N";\n  }\n}',
        testCases: [{ input: ["hi"], expected: "S" }], points: 10
    },
    {
        id: 'sw-5', lang: 'javascript', topic: 'switch', difficulty: 'standard', title: 'Switch(true) Hack', functionName: 'sw5',
        explanation: 'A common trick! `switch(true)` lets you check ranges or complex conditions inside your `case` labels.',
        description: 'Return "neg" if x < 0, else "pos"', template: 'function sw5(x) {\n  switch(true) {\n    case x < 0: return "neg";\n    default: return "pos";\n  }\n}',
        testCases: [{ input: [-1], expected: "neg" }], points: 15
    },
    {
        id: 'sw-6', lang: 'javascript', topic: 'switch', difficulty: 'standard', title: 'Missing Break', functionName: 'sw6',
        explanation: 'Be careful! If you don\'t `return` or `break`, execution will "fall through" into the next case, even if it doesn\'t match.',
        description: 'What is res if x=1? (Notice there is no return inside case 1)', template: 'function sw6(x) {\n  let res = "";\n  switch(x) {\n    case 1: res += "a";\n    case 2: res += "b";\n  }\n  return res;\n}',
        testCases: [{ input: [1], expected: "ab" }], points: 15
    },
    {
        id: 'sw-7', lang: 'javascript', topic: 'switch', difficulty: 'standard', title: 'Minimal Switch', functionName: 'sw7',
        explanation: 'A switch can be empty, though it won\'t do much!',
        description: 'Confirm a switch on x returns "ok"', template: 'function sw7(x) {\n  switch(x) {}\n  return "ok";\n}',
        testCases: [{ input: [1], expected: "ok" }], points: 5
    },
    {
        id: 'sw-8', lang: 'javascript', topic: 'switch', difficulty: 'standard', title: 'Nested Switches', functionName: 'sw8',
        explanation: 'You can nest a switch inside another switch case.',
        description: 'Return 2 if x=1 and y=1', template: 'function sw8(x, y) {\n  switch(x) {\n    case 1:\n      switch(y) {\n        case 1: return 2;\n      }\n  }\n  return 0;\n}',
        testCases: [{ input: [1, 1], expected: 2 }], points: 15
    },
    {
        id: 'sw-9', lang: 'javascript', topic: 'switch', difficulty: 'standard', title: 'Enum Simulation', functionName: 'sw9',
        explanation: 'Switches are perfect for processing "action types" or state machines.',
        description: 'Check OP.ADD case', template: 'const OP = { ADD: 1 };\nfunction sw9(op) {\n  switch(op) {\n    case OP.ADD: return "+";\n  }\n}',
        testCases: [{ input: [1], expected: "+" }], points: 10
    },
    {
        id: 'sw-10', lang: 'javascript', topic: 'switch', difficulty: 'standard', title: 'Dynamic Cases', functionName: 'sw10',
        explanation: 'Case values don\'t have to be literals; they can be variables too.',
        description: 'Predict result if x matches y', template: 'function sw10(x, y) {\n  switch(x) {\n    case y: return "match";\n  }\n}',
        testCases: [{ input: [1, 1], expected: "match" }], points: 10
    },

    // --- TERNARY (10) ---
    {
        id: 'ter-10', lang: 'javascript', topic: 'ternary operator', difficulty: 'standard', title: 'Complex Chain', functionName: 't10',
        explanation: 'The Ternary Operator `condition ? trueVal : falseVal` is a one-line shortcut for `if-else`. You can even chain them, though it can get hard to read!',
        description: 'Predict result of the chained ternary', template: 'function t10(x) {\n  return x === 1 ? "a" : x === 2 ? "b" : "c";\n}',
        testCases: [{ input: [2], expected: "b" }], points: 15
    },

    // --- FN BORROWING (10) ---
    {
        id: 'borr-1', lang: 'javascript', topic: 'practical with fn borrowing', difficulty: 'standard', title: 'Borrow join()', functionName: 'b1',
        explanation: 'You can "borrow" array methods for objects that *look* like arrays (have numeric keys and a length) by using `Array.prototype.method.call(obj)`.',
        description: 'Borrow join for an object', template: 'function b1() {\n  return Array.prototype.join.call({0:"a", 1:"b", length:2}, "-");\n}',
        testCases: [{ input: [], expected: "a-b" }], points: 15
    },
    {
        id: 'borr-2', lang: 'javascript', topic: 'practical with fn borrowing', difficulty: 'standard', title: 'Borrow map()', functionName: 'b2',
        explanation: 'Even mapping works on array-like objects if you borrow it!',
        description: 'Borrow map to double values in an object', template: 'function b2() {\n  return Array.prototype.map.call({0:1, length:1}, x => x*2);\n}',
        testCases: [{ input: [], expected: [2] }], points: 20
    },
    {
        id: 'borr-3', lang: 'javascript', topic: 'practical with fn borrowing', difficulty: 'standard', title: 'Borrow slice()', functionName: 'b3',
        explanation: 'A classic trick: `Array.prototype.slice.call(arguments)` converts the array-like `arguments` object into a real array.',
        description: 'Convert arguments to array using slice borrow', template: 'function b3() {\n  return Array.prototype.slice.call(arguments);\n}',
        testCases: [{ input: [], expected: [] }], points: 15
    },
    {
        id: 'borr-4', lang: 'javascript', topic: 'practical with fn borrowing', difficulty: 'standard', title: 'Borrow find()', functionName: 'b4',
        explanation: 'Borrowing keeps your utility functions generic and powerful.',
        description: 'Borrow find for an object', template: 'function b4() {\n  return Array.prototype.find.call({0:5, length:1}, x => x>0);\n}',
        testCases: [{ input: [], expected: 5 }], points: 20
    },
    {
        id: 'borr-5', lang: 'javascript', topic: 'practical with fn borrowing', difficulty: 'standard', title: 'Borrow filter()', functionName: 'b5',
        explanation: 'Filter objects that mimic array structure.',
        description: 'Borrow filter to get even numbers from object', template: 'function b5() {\n  return Array.prototype.filter.call({0:1, 1:2, length:2}, x => x%2===0);\n}',
        testCases: [{ input: [], expected: [2] }], points: 20
    },
    {
        id: 'borr-6', lang: 'javascript', topic: 'practical with fn borrowing', difficulty: 'standard', title: 'Borrow reduce()', functionName: 'b6',
        explanation: 'Reduce works anywhere there is a `length` and indexed properties.',
        description: 'Borrow reduce for an object', template: 'function b6() {\n  return Array.prototype.reduce.call({0:1, length:1}, (a,b)=>a+b);\n}',
        testCases: [{ input: [], expected: 1 }], points: 20
    },
    {
        id: 'borr-7', lang: 'javascript', topic: 'practical with fn borrowing', difficulty: 'standard', title: 'Borrow some()', functionName: 'b7',
        explanation: 'Check if any item in the array-like object matches.',
        description: 'Borrow some for an object', template: 'function b7() {\n  return Array.prototype.some.call({0:1, length:1}, x => x>0);\n}',
        testCases: [{ input: [], expected: true }], points: 20
    },
    {
        id: 'borr-8', lang: 'javascript', topic: 'practical with fn borrowing', difficulty: 'standard', title: 'Borrow every()', functionName: 'b8',
        explanation: 'Check if all items in the array-like object match.',
        description: 'Borrow every for an object', template: 'function b8() {\n  return Array.prototype.every.call({0:1, length:1}, x => x>0);\n}',
        testCases: [{ input: [], expected: true }], points: 20
    },
    {
        id: 'borr-9', lang: 'javascript', topic: 'practical with fn borrowing', difficulty: 'standard', title: 'Borrow forEach()', functionName: 'b9',
        explanation: 'Iterate over non-array items using borrowed forEach.',
        description: 'Borrow forEach and update s', template: 'function b9() {\n  let s=0;\n  Array.prototype.forEach.call({0:1, length:1}, x=>s=x);\n  return s;\n}',
        testCases: [{ input: [], expected: 1 }], points: 20
    },
    {
        id: 'borr-10', lang: 'javascript', topic: 'practical with fn borrowing', difficulty: 'standard', title: 'Shorthand Borrow', functionName: 'b10',
        explanation: 'You can even use an empty array literal `[]` to borrow methods instead of typing the full `Array.prototype`. It\'s shorter!',
        description: 'Use the [].method shorthand to borrow join', template: 'function b10() {\n  const o = {a:1};\n  return [].join.call(o);\n}',
        testCases: [{ input: [], expected: "" }], points: 15
    },

    // --- COERCION (10) ---
    {
        id: 'coer-1', lang: 'javascript', topic: 'type coercion', difficulty: 'standard', title: 'String Addition', functionName: 'c1',
        explanation: 'In JS, adding a number and a string results in **Concatenation**. The number is implicitly converted (coerced) into a string.',
        description: 'What is 1 + "2"?', template: 'function c1() {\n  return 1 + "2";\n}',
        testCases: [{ input: [], expected: "12" }], points: 5
    },
    {
        id: 'coer-2', lang: 'javascript', topic: 'type coercion', difficulty: 'standard', title: 'String Subtraction', functionName: 'c2',
        explanation: 'Unlike addition, the minus `-` operator ONLY works with numbers. So JS coerces the string into a number first!',
        description: 'What is "5" - 2?', template: 'function c2() {\n  return "5" - 2;\n}',
        testCases: [{ input: [], expected: 3 }], points: 10
    },
    {
        id: 'coer-3', lang: 'javascript', topic: 'type coercion', difficulty: 'standard', title: 'Boolean Coercion', functionName: 'c3',
        explanation: 'When using math operators on Booleans, `true` is coerced to `1` and `false` to `0`.',
        description: 'What is true + 1?', template: 'function c3() {\n  return true + 1;\n}',
        testCases: [{ input: [], expected: 2 }], points: 10
    },
    {
        id: 'coer-4', lang: 'javascript', topic: 'type coercion', difficulty: 'standard', title: 'Implicit Boolean', functionName: 'c4',
        explanation: 'The double-not `!!` is a common pattern to force any value into its base boolean form.',
        description: 'What is !! "" (is empty string truthy or falsy)?', template: 'function c4() {\n  return !! "";\n}',
        testCases: [{ input: [], expected: false }], points: 5
    },
    {
        id: 'coer-5', lang: 'javascript', topic: 'type coercion', difficulty: 'standard', title: 'Unary Plus', functionName: 'c5',
        explanation: 'Putting a `+` before a string is the fastest way to turn it into a Number.',
        description: 'What is +"5"?', template: 'function c5() {\n  return +"5";\n}',
        testCases: [{ input: [], expected: 5 }], points: 5
    },
    {
        id: 'coer-6', lang: 'javascript', topic: 'type coercion', difficulty: 'standard', title: 'Null to Number', functionName: 'c6',
        explanation: 'In a math context, `null` is coerced into `0`.',
        description: 'What is null + 1?', template: 'function c6() {\n  return null + 1;\n}',
        testCases: [{ input: [], expected: 1 }], points: 10
    },
    {
        id: 'coer-7', lang: 'javascript', topic: 'type coercion', difficulty: 'standard', title: 'Undefined to Number', functionName: 'c7',
        explanation: 'Unlike `null`, `undefined` results in `NaN` (Not a Number) when you try to use it in math.',
        description: 'What is undefined + 1?', template: 'function c7() {\n  return undefined + 1;\n}',
        testCases: [{ input: [], expected: NaN }], points: 10
    },
    {
        id: 'coer-8', lang: 'javascript', topic: 'type coercion', difficulty: 'standard', title: 'Array Coercion', functionName: 'c8',
        explanation: 'When added to a string, arrays are coerced into a string of their elements separated by commas.',
        description: 'What is [1] + 2?', template: 'function c8() {\n  return [1] + 2;\n}',
        testCases: [{ input: [], expected: "12" }], points: 10
    },
    {
        id: 'coer-9', lang: 'javascript', topic: 'type coercion', difficulty: 'standard', title: 'Object Coercion', functionName: 'c9',
        explanation: 'Objects usually coerce into the string `"[object Object]"`. If you add it to an empty array (which is `""`), that\'s what you get!',
        description: 'Predict the result of {}.toString() + [].toString()', template: 'function c9() {\n  return ({}.toString() + [].toString());\n}',
        testCases: [{ input: [], expected: "[object Object]" }], points: 15
    },
    {
        id: 'coer-10', lang: 'javascript', topic: 'type coercion', difficulty: 'standard', title: 'Equality and Coercion', functionName: 'c10',
        explanation: 'Remember: `null == 0` is false! Even though both are somewhat "empty", they are not equal in JS loose equality.',
        description: 'Is null loosely equal to 0?', template: 'function c10() {\n  return null == 0;\n}',
        testCases: [{ input: [], expected: false }], points: 10
    },

    // --- CONVERSIONS (10) ---
    {
        id: 'conv-1', lang: 'javascript', topic: 'conversions', difficulty: 'standard', title: 'Number()', functionName: 'v1',
        explanation: 'While `+` is a shortcut, `Number()` is the explicit way to convert a value into a number.',
        description: 'Explicitly convert "123" to a number', template: 'function v1() {\n  return Number("123");\n}',
        testCases: [{ input: [], expected: 123 }], points: 5
    },
    {
        id: 'conv-2', lang: 'javascript', topic: 'conversions', difficulty: 'standard', title: 'parseInt()', functionName: 'v2',
        explanation: '`parseInt()` extracts the integer from a string. It stops at the first non-numeric character it sees (like a decimal point).',
        description: 'Parse 10 from the string "10.5"', template: 'function v2() {\n  return parseInt("10.5");\n}',
        testCases: [{ input: [], expected: 10 }], points: 5
    },
    {
        id: 'conv-3', lang: 'javascript', topic: 'conversions', difficulty: 'standard', title: 'parseFloat()', functionName: 'v3',
        explanation: 'Use `parseFloat()` if you want to keep the decimals (the "floating point") of a number.',
        description: 'Parse 10.5 from the string "10.5"', template: 'function v3() {\n  return parseFloat("10.5");\n}',
        testCases: [{ input: [], expected: 10.5 }], points: 5
    },
    {
        id: 'conv-4', lang: 'javascript', topic: 'conversions', difficulty: 'standard', title: 'String()', functionName: 'v4',
        explanation: '`String()` is the explicit way to convert anything into a string.',
        description: 'Convert number 123 to a string', template: 'function v4() {\n  return String(123);\n}',
        testCases: [{ input: [], expected: "123" }], points: 5
    },
    {
        id: 'conv-5', lang: 'javascript', topic: 'conversions', difficulty: 'standard', title: 'Boolean()', functionName: 'v5',
        explanation: '`Boolean()` explicitly checks if a value is "Truthy" or "Falsy".',
        description: 'What is the boolean of number 1?', template: 'function v5() {\n  return Boolean(1);\n}',
        testCases: [{ input: [], expected: true }], points: 5
    },
    {
        id: 'conv-6', lang: 'javascript', topic: 'conversions', difficulty: 'standard', title: '.toString()', functionName: 'v6',
        explanation: 'Almost every value in JS has a `.toString()` method you can call.',
        description: 'Convert 123 to string using .toString()', template: 'function v6() {\n  return (123).toString();\n}',
        testCases: [{ input: [], expected: "123" }], points: 5
    },
    {
        id: 'conv-7', lang: 'javascript', topic: 'conversions', difficulty: 'standard', title: 'JSON.parse()', functionName: 'v7',
        explanation: '`JSON.parse()` takes a raw JSON string and turns it into a working JS Object.',
        description: 'Parse the string \'{"a":1}\' into an object', template: 'function v7() {\n  return JSON.parse(\'{"a":1}\');\n}',
        testCases: [{ input: [], expected: { a: 1 } }], points: 5
    },
    {
        id: 'conv-8', lang: 'javascript', topic: 'conversions', difficulty: 'standard', title: 'JSON.stringify()', functionName: 'v8',
        explanation: 'The reverse of `parse`. This turns an object into a string for sending over the internet.',
        description: 'Turn the object {a:1} into a JSON string', template: 'function v8() {\n  return JSON.stringify({a:1});\n}',
        testCases: [{ input: [], expected: '{"a":1}' }], points: 5
    },
    {
        id: 'conv-9', lang: 'javascript', topic: 'conversions', difficulty: 'standard', title: 'Parsing Hex', functionName: 'v9',
        explanation: '`parseInt(str, radix)` allows you to parse numbers in different bases! 16 is for Hexadecimal (0-9, a-f).',
        description: 'Parse "ff" in base 16 (Hex)', template: 'function v9() {\n  return parseInt("ff", 16);\n}',
        testCases: [{ input: [], expected: 255 }], points: 10
    },
    {
        id: 'conv-10', lang: 'javascript', topic: 'conversions', difficulty: 'standard', title: 'Comparison Conversion', functionName: 'v10',
        explanation: 'Comparing two strings checks if they are literally identical.',
        description: 'Check if string "true" is strictly "true"', template: 'function v10() {\n  return "true" === "true";\n}',
        testCases: [{ input: [], expected: true }], points: 5
    },

    // --- SHORT CIRCUIT (10) ---
    {
        id: 'shrt-1', lang: 'javascript', topic: 'short-circuiting', difficulty: 'standard', title: 'AND Circuit', functionName: 'h1',
        explanation: 'The `&&` operator "short-circuits". If the first value is false, it returns that value immediately. If the first is true, it returns the second value!',
        description: 'What does true && 5 return?', template: 'function h1() {\n  return true && 5;\n}',
        testCases: [{ input: [], expected: 5 }], points: 10
    },
    {
        id: 'shrt-2', lang: 'javascript', topic: 'short-circuiting', difficulty: 'standard', title: 'OR Circuit', functionName: 'h2',
        explanation: 'The `||` operator returns the FIRST truthy value it finds. This is great for setting default values.',
        description: 'What does false || 10 return?', template: 'function h2() {\n  return false || 10;\n}',
        testCases: [{ input: [], expected: 10 }], points: 10
    },
    {
        id: 'shrt-3', lang: 'javascript', topic: 'short-circuiting', difficulty: 'standard', title: 'Null Coalesce', functionName: 'h3',
        explanation: 'The `??` operator ONLY falls back if the value is `null` or `undefined`. Unlike `||`, it treats `0` and `""` as valid values!',
        description: 'What does null ?? "ok" return?', template: 'function h3() {\n  return null ?? "ok";\n}',
        testCases: [{ input: [], expected: "ok" }], points: 10
    },
    {
        id: 'shrt-4', lang: 'javascript', topic: 'short-circuiting', difficulty: 'standard', title: 'Zero Coalesce', functionName: 'h4',
        explanation: 'Check the difference: `0 || 1` would be `1`, but `0 ?? 1` is `0`!',
        description: 'What does 0 ?? 1 return?', template: 'function h4() {\n  return 0 ?? 1;\n}',
        testCases: [{ input: [], expected: 0 }], points: 15
    },
    {
        id: 'shrt-5', lang: 'javascript', topic: 'short-circuiting', difficulty: 'standard', title: 'AND Guard', functionName: 'h5',
        explanation: 'Using `&&` as a "guard" means the second part only runs if the first part is true.',
        description: 'If ok is true, return "go"', template: 'function h5(ok) {\n  return ok && "go";\n}',
        testCases: [{ input: [true], expected: "go" }], points: 10
    },
    {
        id: 'shrt-6', lang: 'javascript', topic: 'short-circuiting', difficulty: 'standard', title: 'OR Fallback', functionName: 'h6',
        explanation: 'A classic pattern to ensure a variable always has a value.',
        description: 'Return x or "def" if x is falsy', template: 'function h6(x) {\n  return x || "def";\n}',
        testCases: [{ input: [0], expected: "def" }], points: 10
    },
    {
        id: 'shrt-7', lang: 'javascript', topic: 'short-circuiting', difficulty: 'standard', title: 'Chain Short', functionName: 'h7',
        explanation: 'You can chain many `&&` together. It will return the first falsy one it finds, or the very last value.',
        description: 'What is true && 1 && "hi"?', template: 'function h7() {\n  return true && 1 && "hi";\n}',
        testCases: [{ input: [], expected: "hi" }], points: 10
    },
    {
        id: 'shrt-8', lang: 'javascript', topic: 'short-circuiting', difficulty: 'standard', title: 'Deep OR', functionName: 'h8',
        explanation: 'Chain many `||` to find the first valid value in a list of possibilities.',
        description: 'Predict result: false || 0 || null || 5', template: 'function h8() {\n  return false || 0 || null || 5;\n}',
        testCases: [{ input: [], expected: 5 }], points: 10
    },
    {
        id: 'shrt-9', lang: 'javascript', topic: 'short-circuiting', difficulty: 'standard', title: 'Boolean Cast', functionName: 'h9',
        explanation: 'One more look at the `!!` trick! It effectively uses short-circuit logic under the hood to cast to boolean.',
        description: 'Cast 1 to boolean', template: 'function h9(x) {\n  return !!x;\n}',
        testCases: [{ input: [1], expected: true }], points: 5
    },
    {
        id: 'shrt-10', lang: 'javascript', topic: 'short-circuiting', difficulty: 'standard', title: 'Optional Chaining', functionName: 'h10',
        explanation: 'The `?.` operator stops and returns `undefined` if the object before it is null or undefined, preventing "cannot read property of null" errors!',
        description: 'Safely access o.a when o is null', template: 'function h10(o) {\n  return o?.a;\n}',
        testCases: [{ input: [null], expected: undefined }], points: 15
    },

    // --- GUARD CLAUSES (10) ---
    {
        id: 'grd-1', lang: 'javascript', topic: 'guard clauses', difficulty: 'standard', title: 'Simple Guard', functionName: 'g1',
        explanation: 'A **Guard Clause** is an early `return` that exits a function if something is wrong. This keeps the "happy path" of your code clean and flat.',
        description: 'Return early if x is nullish', template: 'function g1(x) {\n  if(!x) return;\n  return "ok";\n}',
        testCases: [{ input: [null], expected: undefined }], points: 10
    },
    {
        id: 'grd-2', lang: 'javascript', topic: 'guard clauses', difficulty: 'standard', title: 'Value Guard', functionName: 'g2',
        explanation: 'Use guards to filter out invalid inputs before you start processing them.',
        description: 'If x < 0 return "err", else return x', template: 'function g2(x) {\n  if(x < 0) return "err";\n  return x;\n}',
        testCases: [{ input: [-1], expected: "err" }], points: 10
    },
    {
        id: 'grd-3', lang: 'javascript', topic: 'guard clauses', difficulty: 'standard', title: 'Type Guard', functionName: 'g3',
        explanation: 'Checking `typeof` at the top of a function is a great way to prevent errors later.',
        description: 'If not a string, return 0. Else return length.', template: 'function g3(x) {\n  if(typeof x !== "string") return 0;\n  return x.length;\n}',
        testCases: [{ input: [5], expected: 0 }], points: 10
    },
    {
        id: 'grd-4', lang: 'javascript', topic: 'guard clauses', difficulty: 'standard', title: 'Multi Guard', functionName: 'g4',
        explanation: 'You can have multiple guards in a row, each checking one specific rule.',
        description: 'Check a then b. Return 1 if !a, 2 if !b, 3 if both ok.', template: 'function g4(a, b) {\n  if(!a) return 1;\n  if(!b) return 2;\n  return 3;\n}',
        testCases: [{ input: [true, false], expected: 2 }], points: 15
    },
    {
        id: 'grd-5', lang: 'javascript', topic: 'guard clauses', difficulty: 'standard', title: 'Identity Guard', functionName: 'g5',
        explanation: 'Explicitly check for special "trigger" values.',
        description: 'If x is 1 return "one", else "other"', template: 'function g5(x) {\n  if(x === 1) return "one";\n  return "other";\n}',
        testCases: [{ input: [1], expected: "one" }], points: 10
    },
    {
        id: 'grd-6', lang: 'javascript', topic: 'guard clauses', difficulty: 'standard', title: 'Array Guard', functionName: 'g6',
        explanation: 'Always check if an array has items before accessing index 0!',
        description: 'If array is empty, return "empty"', template: 'function g6(arr) {\n  if(!arr.length) return "empty";\n  return arr[0];\n}',
        testCases: [{ input: [[]], expected: "empty" }], points: 10
    },
    {
        id: 'grd-7', lang: 'javascript', topic: 'guard clauses', difficulty: 'standard', title: 'Object Guard', functionName: 'g7',
        explanation: 'Ensure the object and the property both exist.',
        description: 'Check if o.a exists', template: 'function g7(o) {\n  if(!o || !o.a) return "no";\n  return o.a;\n}',
        testCases: [{ input: [{}], expected: "no" }], points: 10
    },
    {
        id: 'grd-8', lang: 'javascript', topic: 'guard clauses', difficulty: 'standard', title: 'Inverse Guard', functionName: 'g8',
        explanation: 'Sometimes it\'s clearer to guard for the *absence* of the correct value.',
        description: 'If s is NOT "secret", return "fail"', template: 'function g8(x) {\n  if(x !== "secret") return "fail";\n  return "win";\n}',
        testCases: [{ input: ["hi"], expected: "fail" }], points: 10
    },
    {
        id: 'grd-9', lang: 'javascript', topic: 'guard clauses', difficulty: 'standard', title: 'Regex Guard', functionName: 'g9',
        explanation: 'Regex is powerful for complex input validation at the start of a function.',
        description: 'If not only digits, return "invalid"', template: 'function g9(s) {\n  if(!/^[0-9]+$/.test(s)) return "invalid";\n  return Number(s);\n}',
        testCases: [{ input: ["abc"], expected: "invalid" }], points: 15
    },
    {
        id: 'grd-10', lang: 'javascript', topic: 'guard clauses', difficulty: 'standard', title: 'Deep Guard', functionName: 'g10',
        explanation: 'Combined with optional chaining, guards are extremely safe.',
        description: 'Return -1 if user.id is missing', template: 'function g10(o) {\n  if(!o?.user?.id) return -1;\n  return o.user.id;\n}',
        testCases: [{ input: [{}], expected: -1 }], points: 15
    },

    // --- LABELED STATEMENTS (10) ---
    {
        id: 'lab-1', lang: 'javascript', topic: 'labeled statements', difficulty: 'standard', title: 'Break Label', functionName: 'l1',
        explanation: 'Labels allow you to name a loop. You can then use `break labelName` to exit that specific loop, even from deep inside a nested loop!',
        description: 'Break the outer loop from the inner one', template: 'function l1() {\n  let s = "";\n  outer: for(let i=0; i<2; i++){\n    for(let j=0; j<2; j++){\n      s += "a";\n      break outer;\n    }\n  }\n  return s;\n}',
        testCases: [{ input: [], expected: "a" }], points: 15
    },
    {
        id: 'lab-2', lang: 'javascript', topic: 'labeled statements', difficulty: 'standard', title: 'Continue Label', functionName: 'l2',
        explanation: 'Similarly, `continue labelName` jumps to the next iteration of the marked loop.',
        description: 'Continue the outer loop', template: 'function l2() {\n  let c = 0;\n  o: for(let i=0; i<2; i++){\n    for(let j=0; j<2; j++){\n      c++;\n      continue o;\n    }\n  }\n  return c;\n}',
        testCases: [{ input: [], expected: 2 }], points: 15
    },
    {
        id: 'lab-3', lang: 'javascript', topic: 'labeled statements', difficulty: 'standard', title: 'Block Label', functionName: 'l3',
        explanation: 'You can even label plain `{}` code blocks! Breaking a block label skips the rest of the code inside that block.',
        description: 'Break a labeled code block', template: 'function l3() {\n  b: {\n    break b;\n    return 1;\n  }\n  return 2;\n}',
        testCases: [{ input: [], expected: 2 }], points: 15
    },
    {
        id: 'lab-4', lang: 'javascript', topic: 'labeled statements', difficulty: 'standard', title: 'Deep nesting', functionName: 'l4',
        explanation: 'Labels are often the only way to escape complex multi-level loops without messy boolean flags.',
        description: 'Escape from inner-most loop to outer-most', template: 'function l4() {\n  let r = "";\n  a: for(let i=0; i<1; i++){\n    b: for(let j=0; j<1; j++){\n      r+="x";\n      break a;\n    }\n  }\n  return r;\n}',
        testCases: [{ input: [], expected: "x" }], points: 15
    },
    {
        id: 'lab-5', lang: 'javascript', topic: 'labeled statements', difficulty: 'standard', title: 'Label Scoping', functionName: 'l5',
        explanation: 'Labels are separate from variables. You can reuse a label name as long as they aren\'t nested inside each other.',
        description: 'Can we reuse label "a"?', template: 'function l5() {\n  a: {\n    break a;\n  }\n  a: {\n    return 1;\n  }\n}',
        testCases: [{ input: [], expected: 1 }], points: 15
    },
    {
        id: 'lab-6', lang: 'labeled statements', topic: 'labeled statements', difficulty: 'standard', title: 'Switch Label', functionName: 'l6',
        explanation: 'You can label a `switch` statement too, though `break` inside a switch usually just breaks the switch itself anyway!',
        description: 'Label a switch statement', template: 'function l6(x) {\n  s: switch(x){\n    case 1: break s;\n  }\n  return "ok";\n}',
        testCases: [{ input: [1], expected: "ok" }], points: 15
    },
    {
        id: 'lab-7', lang: 'labeled statements', topic: 'labeled statements', difficulty: 'standard', title: 'Labeled While', functionName: 'l7',
        explanation: 'While loops can also be labeled.',
        description: 'Break a labeled while loop', template: 'function l7() {\n  let i=0;\n  w: while(i<10){\n    i++;\n    break w;\n  }\n  return i;\n}',
        testCases: [{ input: [], expected: 1 }], points: 15
    },
    {
        id: 'lab-8', lang: 'labeled statements', topic: 'labeled statements', difficulty: 'standard', title: 'Skipping Inner', functionName: 'l8',
        explanation: 'Using `continue` to jump past logic in nested loops.',
        description: 'Continue outer if inner starts', template: 'function l8() {\n  let s="";\n  l: for(let i=0; i<2; i++){\n    for(let j=0; j<2; j++){\n      if(j===0) continue l;\n      s+="a";\n    }\n  }\n  return s;\n}',
        testCases: [{ input: [], expected: "" }], points: 15
    },
    {
        id: 'lab-9', lang: 'labeled statements', topic: 'labeled statements', difficulty: 'standard', title: 'Counter Logic', functionName: 'l9',
        explanation: 'Predicting how many times a loop runs when labels are involved.',
        description: 'Count iterations before global break', template: 'function l9() {\n  let x=0;\n  f: for(let i=0; i<5; i++){\n    for(let j=0; j<5; j++){\n      x++;\n      if(x===3) break f;\n    }\n  }\n  return x;\n}',
        testCases: [{ input: [], expected: 3 }], points: 15
    },
    {
        id: 'lab-10', lang: 'labeled statements', topic: 'labeled statements', difficulty: 'standard', title: 'Identity Label', functionName: 'l10',
        explanation: 'Labels are just helpful bookmarks for the JS engine.',
        description: 'Basic labeled block flow', template: 'function l10() {\n  let x = 1;\n  b: {\n    x = 2;\n    break b;\n    x = 3;\n  }\n  return x;\n}',
        testCases: [{ input: [], expected: 2 }], points: 10
    },

    // --- LOOPS (10) ---
    {
        id: 'loop-1', lang: 'javascript', topic: 'all type loops', difficulty: 'standard', title: 'For Loop', functionName: 'lp1',
        explanation: 'The `for` loop is the classic way to repeat code a specific number of times.',
        description: 'Sum numbers 1 to 3', template: 'function lp1() {\n  let s=0;\n  for(let i=1; i<=3; i++) s+=i;\n  return s;\n}',
        testCases: [{ input: [], expected: 6 }], points: 5
    },
    {
        id: 'loop-2', lang: 'javascript', topic: 'all type loops', difficulty: 'standard', title: 'While Loop', functionName: 'lp2',
        explanation: 'A `while` loop runs as long as a condition is true. Be careful not to create an infinite loop!',
        description: 'Sum 1 to 3 using while', template: 'function lp2() {\n  let s=0, i=1;\n  while(i<=3){\n    s+=i;\n    i++;\n  }\n  return s;\n}',
        testCases: [{ input: [], expected: 6 }], points: 5
    },
    {
        id: 'loop-3', lang: 'javascript', topic: 'all type loops', difficulty: 'standard', title: 'Do While', functionName: 'lp3',
        explanation: 'A `do while` loop always runs AT LEAST ONCE, because the check happens at the end.',
        description: 'Confirm do-while runs once', template: 'function lp3() {\n  let i=0;\n  do {\n    i++;\n  } while(false);\n  return i;\n}',
        testCases: [{ input: [], expected: 1 }], points: 10
    },
    {
        id: 'loop-4', lang: 'javascript', topic: 'all type loops', difficulty: 'standard', title: 'For...In', functionName: 'lp4',
        explanation: '`for...in` is used to iterate over the **keys** of an object.',
        description: 'Concatenate all keys of object o', template: 'function lp4(o) {\n  let s="";\n  for(let k in o) s+=k;\n  return s;\n}',
        testCases: [{ input: [{ a: 1, b: 2 }], expected: "ab" }], points: 10
    },
    {
        id: 'loop-5', lang: 'javascript', topic: 'all type loops', difficulty: 'standard', title: 'For...Of', functionName: 'lp5',
        explanation: '`for...of` is used to iterate over the **values** of an array (or any iterable). It\'s much cleaner than a regular for-loop!',
        description: 'Sum all values in array a', template: 'function lp5(a) {\n  let s=0;\n  for(let v of a) s+=v;\n  return s;\n}',
        testCases: [{ input: [[1, 2, 3]], expected: 6 }], points: 5
    },
    {
        id: 'loop-6', lang: 'javascript', topic: 'all type loops', difficulty: 'standard', title: 'Break', functionName: 'lp6',
        explanation: 'The `break` statement kills the loop immediately.',
        description: 'Stop when i is 2', template: 'function lp6() {\n  for(let i=0; i<10; i++) {\n    if(i===2) break;\n    else return i;\n  }\n}',
        testCases: [{ input: [], expected: 0 }], points: 5
    },
    {
        id: 'loop-7', lang: 'javascript', topic: 'all type loops', difficulty: 'standard', title: 'Continue', functionName: 'lp7',
        explanation: 'The `continue` statement skips the rest of the current loop and jumps to the next iteration.',
        description: 'Skip even numbers between 0-3', template: 'function lp7() {\n  let s="";\n  for(let i=0; i<4; i++){\n    if(i%2===0) continue;\n    s+=i;\n  }\n  return s;\n}',
        testCases: [{ input: [], expected: "13" }], points: 10
    },
    {
        id: 'loop-8', lang: 'javascript', topic: 'all type loops', difficulty: 'standard', title: 'Nested Loops', functionName: 'lp8',
        explanation: 'Loops inside loops! The inner loop completes all its iterations for every single iteration of the outer loop.',
        description: 'Count total iterations in a 2x2 grid', template: 'function lp8() {\n  let c=0;\n  for(let i=0; i<2; i++) {\n    for(let j=0; j<2; j++) c++;\n  }\n  return c;\n}',
        testCases: [{ input: [], expected: 4 }], points: 10
    },
    {
        id: 'loop-9', lang: 'javascript', topic: 'all type loops', difficulty: 'standard', title: 'Reverse Loop', functionName: 'lp9',
        explanation: 'You can count downwards by changing the update to `i--`.',
        description: 'Count down from 2 to 1', template: 'function lp9() {\n  let s="";\n  for(let i=2; i>0; i--) s+=i;\n  return s;\n}',
        testCases: [{ input: [], expected: "21" }], points: 5
    },
    {
        id: 'loop-10', lang: 'javascript', topic: 'all type loops', difficulty: 'standard', title: 'Infinite Escape', functionName: 'lp10',
        explanation: '`while(true)` creates an infinite loop. You MUST have a `return` or `break` inside to ever get out!',
        description: 'Escape an infinite loop when i is 3', template: 'function lp10() {\n  let i=0;\n  while(true){\n    i++;\n    if(i===3) return i;\n  }\n}',
        testCases: [{ input: [], expected: 3 }], points: 10
    },

    // --- ERROR HANDLING (10) ---
    {
        id: 'err-1', lang: 'javascript', topic: 'error handling', difficulty: 'standard', title: 'Try Catch', functionName: 'er1',
        explanation: 'The `try...catch` block lets you handle errors gracefully. If code inside `try` crashes, the `catch` block runs instead of the whole program stopping.',
        description: 'Catch a thrown error', template: 'function er1() {\n  try {\n    throw new Error("x");\n  } catch(e) {\n    return "ok";\n  }\n}',
        testCases: [{ input: [], expected: "ok" }], points: 10
    },
    {
        id: 'err-2', lang: 'javascript', topic: 'error handling', difficulty: 'standard', title: 'Finally', functionName: 'er2',
        explanation: 'The `finally` block ALWAYS runs, regardless of whether there was an error or not. It\'s perfect for cleanup (like closing a file).',
        description: 'Predict result with a finally block', template: 'function er2() {\n  let x=0;\n  try {\n    return x;\n  } finally {\n    x=1;\n  }\n}',
        testCases: [{ input: [], expected: 0 }], points: 15
    },
    {
        id: 'err-3', lang: 'javascript', topic: 'error handling', difficulty: 'standard', title: 'Throw Value', functionName: 'er3',
        explanation: 'You can `throw` anything in JS: strings, numbers, or even objects. Usually, throwing a `new Error()` is best practice.',
        description: 'Throw a string and catch it', template: 'function er3() {\n  try {\n    throw "err";\n  } catch(e) {\n    return e;\n  }\n}',
        testCases: [{ input: [], expected: "err" }], points: 10
    },
    {
        id: 'err-4', lang: 'javascript', topic: 'error handling', difficulty: 'standard', title: 'Error Type', functionName: 'er4',
        explanation: 'Errors are objects! You can check their type using `instanceof` to handle different mistakes differently.',
        description: 'Check if error is a TypeError', template: 'function er4() {\n  try {\n    null.f();\n  } catch(e) {\n    return e instanceof TypeError;\n  }\n}',
        testCases: [{ input: [], expected: true }], points: 15
    },
    {
        id: 'err-5', lang: 'javascript', topic: 'error handling', difficulty: 'standard', title: 'Nested Try', functionName: 'er5',
        explanation: 'You can nest try blocks. Note how `finally` can override return values if it uses a `return` itself (though that\'s usually avoided!).',
        description: 'Predict result of nested try-finally', template: 'function er5() {\n  try {\n    try {\n      throw 1;\n    } finally {\n      return 2;\n    }\n  } catch(e) {\n    return 3;\n  }\n}',
        testCases: [{ input: [], expected: 2 }], points: 20
    },
    {
        id: 'err-6', lang: 'javascript', topic: 'error handling', difficulty: 'standard', title: 'Error Message', functionName: 'er6',
        explanation: 'Standard error objects have a `.message` property describing what went wrong.',
        description: 'Get the message from the error object', template: 'function er6() {\n  try {\n    throw new Error("msg");\n  } catch(e) {\n    return e.message;\n  }\n}',
        testCases: [{ input: [], expected: "msg" }], points: 10
    },
    {
        id: 'err-7', lang: 'javascript', topic: 'error handling', difficulty: 'standard', title: 'Re-throwing', functionName: 'er7',
        explanation: 'Sometimes you want to catch an error, do something, and then `throw` it again for a higher-level handler.',
        description: 'Catch and throw a new value', template: 'function er7() {\n  try {\n    try {\n      throw 1;\n    } catch(e) {\n      throw 2;\n    }\n  } catch(e) {\n    return e;\n  }\n}',
        testCases: [{ input: [], expected: 2 }], points: 15
    },
    {
        id: 'err-8', lang: 'javascript', topic: 'error handling', difficulty: 'standard', title: 'Syntax Errors', functionName: 'er8',
        explanation: 'Some errors, like those from `eval()`, can be caught if they happen at runtime.',
        description: 'Catch a syntax error from eval', template: 'function er8() {\n  try {\n    eval("+++");\n  } catch(e) {\n    return true;\n  }\n}',
        testCases: [{ input: [], expected: true }], points: 15
    },
    {
        id: 'err-9', lang: 'javascript', topic: 'error handling', difficulty: 'standard', title: 'Reference Errors', functionName: 'er9',
        explanation: 'A `ReferenceError` happens when you try to use a variable that hasn\'t been defined.',
        description: 'Catch a reference error', template: 'function er9() {\n  try {\n    x;\n  } catch(e) {\n    return e instanceof ReferenceError;\n  }\n}',
        testCases: [{ input: [], expected: true }], points: 15
    },
    {
        id: 'err-10', lang: 'javascript', topic: 'error handling', difficulty: 'standard', title: 'Finally Priority', functionName: 'er10',
        explanation: 'Crucial: if `finally` returns a value, it becomes the overall function return value, ignoring any previous returns!',
        description: 'What is returned if finally has a return?', template: 'function er10() {\n  try {\n    return 1;\n  } finally {\n    return 2;\n  }\n}',
        testCases: [{ input: [], expected: 2 }], points: 20
    },

    // --- ASYNC JS (10) ---
    {
        id: 'asnc-1', lang: 'javascript', topic: 'async js', difficulty: 'standard', title: 'setTimeout()', functionName: 'as1',
        explanation: '`setTimeout()` tells JS to run a piece of code after a certain number of milliseconds. It doesn\'t stop the rest of the code from running though—that\'s why we call it "asynchronous"!',
        description: 'Call cb after 10ms', template: 'function as1(cb) {\n  setTimeout(() => cb("ok"), 10);\n}',
        testCases: [{ input: [() => { }], expected: undefined }], points: 15
    },
    {
        id: 'asnc-2', lang: 'javascript', topic: 'async js', difficulty: 'standard', title: 'setInterval()', functionName: 'as2',
        explanation: '`setInterval()` repeats code on a fixed schedule. Always remember to use `clearInterval()` to stop it!',
        description: 'Set and then immediately clear an interval', template: 'function as2() {\n  const id = setInterval(()=>{}, 100);\n  clearInterval(id);\n  return "cleared";\n}',
        testCases: [{ input: [], expected: "cleared" }], points: 15
    },
    {
        id: 'asnc-3', lang: 'javascript', topic: 'async js', difficulty: 'standard', title: 'Microtasks', functionName: 'as3',
        explanation: 'Promises use a special priority queue called the **Microtask Queue**. They usually run *before* things like `setTimeout`.',
        description: 'Return a resolved promise value', template: 'function as3() {\n  return Promise.resolve(1);\n}',
        testCases: [{ input: [], expected: 1 }], points: 15
    },
    {
        id: 'asnc-4', lang: 'javascript', topic: 'async js', difficulty: 'standard', title: 'Race Conditions', functionName: 'as4',
        explanation: 'If you try to use a variable that is updated inside a timeout *before* the timeout finishes, it will still have its old value!',
        description: 'Predict order: will x be 0 or 1 when returned?', template: 'function as4() {\n  let x=0;\n  setTimeout(()=>x=1, 0);\n  return x;\n}',
        testCases: [{ input: [], expected: 0 }], points: 20
    },
    {
        id: 'asnc-5', lang: 'javascript', topic: 'async js', difficulty: 'standard', title: 'Promise.all()', functionName: 'as5',
        explanation: '`Promise.all()` lets you wait for many asynchronous tasks to finish at the same time.',
        description: 'Wait for both values to resolve', template: 'function as5() {\n  return Promise.all([1, 2]);\n}',
        testCases: [{ input: [], expected: [1, 2] }], points: 20
    },
    {
        id: 'asnc-6', lang: 'javascript', topic: 'async js', difficulty: 'standard', title: 'Sync vs Async', functionName: 'as6',
        explanation: 'Synchronous code (regular lines) ALWAYS finishes before asynchronous code (timeouts/promises) even starts.',
        description: 'What is s after a sync add and an async add?', template: 'function as6() {\n  let s="";\n  s+="a";\n  setTimeout(()=>s+="b", 0);\n  return s;\n}',
        testCases: [{ input: [], expected: "a" }], points: 15
    },
    {
        id: 'asnc-7', lang: 'javascript', topic: 'async js', difficulty: 'standard', title: 'Nested Timeouts', functionName: 'as7',
        explanation: 'You can nest timeouts, but it can lead to "Callback Hell" if you aren\'t careful!',
        description: 'Predict behavior of nested timeouts', template: 'function as7(cb) {\n  setTimeout(()=>setTimeout(()=>cb(), 0), 0);\n}',
        testCases: [{ input: [() => { }], expected: undefined }], points: 20
    },
    {
        id: 'asnc-8', lang: 'javascript', topic: 'async js', difficulty: 'standard', title: 'Async Errors', functionName: 'as8',
        explanation: 'Errors in promises must be caught with `.catch()`. If they aren\'t, your program might crash silently!',
        description: 'Catch a rejected promise', template: 'function as8() {\n  return Promise.reject(1).catch(e=>e);\n}',
        testCases: [{ input: [], expected: 1 }], points: 20
    },
    {
        id: 'asnc-9', lang: 'javascript', topic: 'async js', difficulty: 'standard', title: 'Async Returns', functionName: 'as9',
        explanation: 'An `async` function always returns a Promise, even if you return a simple value like `1`.',
        description: 'Confirm an async function returns the value', template: 'async function as9() {\n  return 1;\n}',
        testCases: [{ input: [], expected: 1 }], points: 15
    },
    {
        id: 'asnc-10', lang: 'javascript', topic: 'async js', difficulty: 'standard', title: 'Instant Resolve', functionName: 'as10',
        explanation: 'Sometimes we want a promise that is already "done". `Promise.resolve()` does exactly that.',
        description: 'Resolve "done" immediately', template: 'function as10() {\n  return Promise.resolve("done");\n}',
        testCases: [{ input: [], expected: "done" }], points: 10
    },

    // --- CALLBACKS (10) ---
    {
        id: 'call-1', lang: 'javascript', topic: 'callback', difficulty: 'standard', title: 'Basic Callback', functionName: 'cb1',
        explanation: 'A **Callback** is just a function that you pass as an argument to another function, to be called later.',
        description: 'Run the passed function f with input 1', template: 'function cb1(f) {\n  return f(1);\n}',
        testCases: [{ input: [(x) => x * 2], expected: 2 }], points: 10
    },
    {
        id: 'call-2', lang: 'javascript', topic: 'callback', difficulty: 'standard', title: 'Data Passing', functionName: 'cb2',
        explanation: 'Callbacks are great for processing data in a flexible way.',
        description: 'Pass d into function f', template: 'function cb2(d, f) {\n  return f(d);\n}',
        testCases: [{ input: [5, (x) => x], expected: 5 }], points: 10
    },
    {
        id: 'call-3', lang: 'javascript', topic: 'callback', difficulty: 'standard', title: 'Anonymous Callbacks', functionName: 'cb3',
        explanation: 'You don\'t always have to name your callbacks; you can define them right where you use them.',
        description: 'Run a callback that returns "hi"', template: 'function cb3(f) {\n  return f();\n}',
        testCases: [{ input: [() => "hi"], expected: "hi" }], points: 10
    },
    {
        id: 'call-4', lang: 'javascript', topic: 'callback', difficulty: 'standard', title: 'Callback Hell', functionName: 'cb4',
        explanation: 'When you start nesting many callbacks, your code starts looking like a pyramid. This is "Callback Hell"!',
        description: 'Run f1 with the result of f2(1)', template: 'function cb4(f1, f2) {\n  return f1(f2(1));\n}',
        testCases: [{ input: [(x) => x + 1, (x) => x * 2], expected: 3 }], points: 15
    },
    {
        id: 'call-5', lang: 'javascript', topic: 'callback', difficulty: 'standard', title: 'Error-First Pattern', functionName: 'cb5',
        explanation: 'In Node.js, the first argument of a callback is almost always the `error`. If it\'s `null`, everything went fine!',
        description: 'Run Node-style callback with no error', template: 'function cb5(f) {\n  return f(null, "ok");\n}',
        testCases: [{ input: [(e, d) => d], expected: "ok" }], points: 15
    },
    {
        id: 'call-6', lang: 'javascript', topic: 'callback', difficulty: 'standard', title: 'Optional Callbacks', functionName: 'cb6',
        explanation: 'It\'s good practice to check if a callback exists before you try to call it.',
        description: 'If f is provided, call it. Else return 0.', template: 'function cb6(f) {\n  if(f) return f();\n  return 0;\n}',
        testCases: [{ input: [null], expected: 0 }], points: 10
    },
    {
        id: 'call-7', lang: 'javascript', topic: 'callback', difficulty: 'standard', title: 'Callback Scope', functionName: 'cb7',
        explanation: 'Be careful! If your callback uses `this`, you might need to use `.call()` or `.bind()` to make it work correctly.',
        description: 'Run f using o as its context (this)', template: 'function cb7(o, f) {\n  return f.call(o);\n}',
        testCases: [{ input: [{ a: 1 }, function () { return this.a }], expected: 1 }], points: 20
    },
    {
        id: 'call-8', lang: 'javascript', topic: 'callback', difficulty: 'standard', title: 'Array Callbacks', functionName: 'cb8',
        explanation: 'Many built-in array methods like `.map()` use callbacks to work on every item.',
        description: 'Map array a using function f', template: 'function cb8(a, f) {\n  return a.map(f);\n}',
        testCases: [{ input: [[1], (x) => x + 1], expected: [2] }], points: 15
    },
    {
        id: 'call-9', lang: 'javascript', topic: 'callback', difficulty: 'standard', title: 'Success/Fail Pattern', functionName: 'cb9',
        explanation: 'You can pass TWO callbacks: one for success and one for failure.',
        description: 'If ok is true, run s. Else run f.', template: 'function cb9(ok, s, f) {\n  if(ok) return s();\n  return f();\n}',
        testCases: [{ input: [true, () => 1, () => 0], expected: 1 }], points: 15
    },
    {
        id: 'call-10', lang: 'javascript', topic: 'callback', difficulty: 'standard', title: 'Asynchronous Callback', functionName: 'cb10',
        explanation: 'A callback inside a `setTimeout` will run later, after the rest of your current code finishes.',
        description: 'Run f after a delay', template: 'function cb10(f) {\n  setTimeout(f, 0);\n}',
        testCases: [{ input: [() => { }], expected: undefined }], points: 15
    },

    // --- PROMISES (10) ---
    {
        id: 'prom-1', lang: 'javascript', topic: 'promise', difficulty: 'standard', title: 'New Promise', functionName: 'pr1',
        explanation: 'A **Promise** is a placeholder for a value that will exist in the future. You "resolve" it when your task succeeds.',
        description: 'Resolve a promise with the value 1', template: 'function pr1() {\n  return new Promise(resolve => resolve(1));\n}',
        testCases: [{ input: [], expected: 1 }], points: 10
    },
    {
        id: 'prom-2', lang: 'javascript', topic: 'promise', difficulty: 'standard', title: 'Promise Chaining', functionName: 'pr2',
        explanation: 'You can chain `.then()` calls! Each one receives the result of the previous one.',
        description: 'Chain two then blocks: return x + 1 then result * 2', template: 'function pr2() {\n  return Promise.resolve(1)\n    .then(x => x + 1)\n    .then(x => x * 2);\n}',
        testCases: [{ input: [], expected: 4 }], points: 15
    },
    {
        id: 'prom-3', lang: 'javascript', topic: 'promise', difficulty: 'standard', title: 'Promise Rejection', functionName: 'pr3',
        explanation: 'If something goes wrong, you "reject" the promise. This triggers the `.catch()` block.',
        description: 'Reject with an error "fail"', template: 'function pr3() {\n  return new Promise((resolve, reject) => reject("fail"));\n}',
        testCases: [{ input: [], expected: "fail" }], points: 10
    },
    {
        id: 'prom-4', lang: 'javascript', topic: 'promise', difficulty: 'standard', title: '.catch() Handlers', functionName: 'pr4',
        explanation: 'The `.catch()` method is where you handle any errors that happened earlier in the promise chain.',
        description: 'Catch a rejection and return its value', template: 'function pr4() {\n  return Promise.reject("err").catch(e => e);\n}',
        testCases: [{ input: [], expected: "err" }], points: 10
    },
    {
        id: 'prom-5', lang: 'javascript', topic: 'promise', difficulty: 'standard', title: 'Multiple Resolves', functionName: 'pr5',
        explanation: 'A promise can only be resolved or rejected ONCE. Any further calls to resolve or reject are simply ignored.',
        description: 'Predict result: resolving twice', template: 'function pr5() {\n  return new Promise(r => {\n    r(1);\n    r(2);\n  });\n}',
        testCases: [{ input: [], expected: 1 }], points: 15
    },
    {
        id: 'prom-6', lang: 'javascript', topic: 'promise', difficulty: 'standard', title: 'Nested Promises', functionName: 'pr6',
        explanation: 'If you return a promise inside a `.then()`, the chain waits for *that* promise to finish before moving to the next link.',
        description: 'Return a promise inside a .then', template: 'function pr6() {\n  return Promise.resolve(1).then(v => Promise.resolve(v + 1));\n}',
        testCases: [{ input: [], expected: 2 }], points: 20
    },
    {
        id: 'prom-7', lang: 'javascript', topic: 'promise', difficulty: 'standard', title: 'Promise.race()', functionName: 'pr7',
        explanation: '`Promise.race()` takes several promises and returns the result of the FIRST one that finishes, whether it succeeds or fails.',
        description: 'Find out which promise finishes first', template: 'function pr7() {\n  return Promise.race([\n    new Promise(r => setTimeout(()=>r(1), 10)),\n    new Promise(r => setTimeout(()=>r(2), 5))\n  ]);\n}',
        testCases: [{ input: [], expected: 2 }], points: 20
    },
    {
        id: 'prom-8', lang: 'javascript', topic: 'promise', difficulty: 'standard', title: '.finally()', functionName: 'pr8',
        explanation: 'Similar to try-finally, `.finally()` always runs at the end of a promise chain, no matter if it succeeded or failed.',
        description: 'Verify .finally runs', template: 'function pr8() {\n  let x = 0;\n  return Promise.resolve(1)\n    .finally(() => x = 1)\n    .then(() => x);\n}',
        testCases: [{ input: [], expected: 1 }], points: 15
    },
    {
        id: 'prom-9', lang: 'javascript', topic: 'promise', difficulty: 'standard', title: 'The then-promise', functionName: 'pr9',
        explanation: 'Crucially, every `.then()` actually returns a NEW promise itself! This is why you can chain them.',
        description: 'Predict type of result of .then()', template: 'function pr9() {\n  const p = Promise.resolve(1).then(() => { });\n  return p instanceof Promise;\n}',
        testCases: [{ input: [], expected: true }], points: 15
    },
    {
        id: 'prom-10', lang: 'javascript', topic: 'promise', difficulty: 'standard', title: 'Promise Casting', functionName: 'pr10',
        explanation: 'You can use `Promise.resolve(val)` to turn any normal value into a promise that is already finished.',
        description: 'Cast 123 into a promise', template: 'function pr10() {\n  return Promise.resolve(123);\n}',
        testCases: [{ input: [], expected: 123 }], points: 10
    },

    // --- ASYNC AWAIT (10) ---
    {
        id: 'awa-1', lang: 'javascript', topic: 'async await', difficulty: 'standard', title: 'Basic await', functionName: 'aw1',
        explanation: 'The `await` keyword makes JS wait for a promise to finish. It makes your asynchronous code look and feel like normal synchronous code!',
        description: 'Await a plain number 1', template: 'async function aw1() {\n  return await 1;\n}',
        testCases: [{ input: [], expected: 1 }], points: 10
    },
    {
        id: 'awa-2', lang: 'javascript', topic: 'async await', difficulty: 'standard', title: 'Await Promise', functionName: 'aw2',
        explanation: 'When you `await` a promise, the function pauses until the promise resolves, then returns the result.',
        description: 'Await a resolved promise of 2', template: 'async function aw2() {\n  return await Promise.resolve(2);\n}',
        testCases: [{ input: [], expected: 2 }], points: 15
    },
    {
        id: 'awa-3', lang: 'javascript', topic: 'async await', difficulty: 'standard', title: 'Async Try/Catch', functionName: 'aw3',
        explanation: 'With `async/await`, you can use regular `try...catch` blocks to handle errors in your promises!',
        description: 'Catch a thrown value in an async function', template: 'async function aw3() {\n  try {\n    throw 1;\n  } catch(e){\n    return e;\n  }\n}',
        testCases: [{ input: [], expected: 1 }], points: 15
    },
    {
        id: 'awa-4', lang: 'javascript', topic: 'async await', difficulty: 'standard', title: 'Sequential Await', functionName: 'aw4',
        explanation: 'Be careful! If you `await` many things one after another, they will run sequentially (one by one).',
        description: 'Sum two awaits', template: 'async function aw4() {\n  const a = await 1;\n  const b = await 2;\n  return a+b;\n}',
        testCases: [{ input: [], expected: 3 }], points: 20
    },
    {
        id: 'awa-5', lang: 'javascript', topic: 'async await', difficulty: 'standard', title: 'Async Loop', functionName: 'aw5',
        explanation: 'You can use `await` inside a for-loop to process items one at a time.',
        description: 'Await in a for...of loop', template: 'async function aw5(a) {\n  let s=0;\n  for(let p of a) s+= await p;\n  return s;\n}',
        testCases: [{ input: [[Promise.resolve(1)]], expected: 1 }], points: 20
    },
    {
        id: 'awa-6', lang: 'javascript', topic: 'async await', difficulty: 'standard', title: 'Concurrent Wait', functionName: 'aw6',
        explanation: 'To run multiple promises at the same time and wait for all of them, use `await Promise.all()`.',
        description: 'Wait for mixed values in an array', template: 'async function aw6() {\n  return await Promise.all([1, 2]);\n}',
        testCases: [{ input: [], expected: [1, 2] }], points: 20
    },
    {
        id: 'awa-7', lang: 'javascript', topic: 'async await', difficulty: 'standard', title: 'Mixed Async', functionName: 'aw7',
        explanation: 'Combining normal math with awaited values.',
        description: 'Add a number to an awaited value', template: 'async function aw7(x) {\n  return x + (await 1);\n}',
        testCases: [{ input: [10], expected: 11 }], points: 15
    },
    {
        id: 'awa-8', lang: 'javascript', topic: 'async await', difficulty: 'standard', title: 'Return Await', functionName: 'aw8',
        explanation: 'Note: `return await` is usually redundant because `async` functions already return a promise!',
        description: 'Awaiting a string before returning', template: 'async function aw8() {\n  return await "done";\n}',
        testCases: [{ input: [], expected: "done" }], points: 10
    },
    {
        id: 'awa-9', lang: 'javascript', topic: 'async await', difficulty: 'standard', title: 'Await Void', functionName: 'aw9',
        explanation: 'Waiting for nothing is fine; it just resolves to `undefined`.',
        description: 'Await undefined', template: 'async function aw9() {\n  return await undefined;\n}',
        testCases: [{ input: [], expected: undefined }], points: 10
    },
    {
        id: 'awa-10', lang: 'javascript', topic: 'async await', difficulty: 'standard', title: 'Deep Await', functionName: 'aw10',
        explanation: 'If a promise resolves to another promise, `await` will automatically unwrap it until it finds a real value.',
        description: 'Await a nested promise', template: 'async function aw10() {\n  return await (await Promise.resolve(Promise.resolve(1)));\n}',
        testCases: [{ input: [], expected: 1 }], points: 20
    },

    // --- EVENT LOOP (10) ---
    {
        id: 'ev-1', lang: 'javascript', topic: 'event loop', difficulty: 'standard', title: 'Macro Order', functionName: 'ev1',
        explanation: 'Synchronous code runs first, then the browser handles "tasks" from the callback queue. This is why `setTimeout(..., 0)` always runs *after* your current function finishes!',
        description: 'Predict order of sync vs macrotask', template: 'function ev1() {\n  let s="";\n  setTimeout(()=>s+="b",0);\n  s+="a";\n  return s;\n}',
        testCases: [{ input: [], expected: "a" }], points: 20
    },
    {
        id: 'ev-2', lang: 'javascript', topic: 'event loop', difficulty: 'standard', title: 'Micro Order', functionName: 'ev2',
        explanation: 'Promises go to the **Microtask Queue**. They run immediately after the current script finishes, but BEFORE any rendering or next macrotask (like setTimeout).',
        description: 'Predict order of sync vs microtask', template: 'function ev2() {\n  let s="";\n  Promise.resolve().then(()=>s+="p");\n  s+="s";\n  return s;\n}',
        testCases: [{ input: [], expected: "s" }], points: 20
    },
    {
        id: 'ev-3', lang: 'javascript', topic: 'event loop', difficulty: 'standard', title: 'Mixed Order', functionName: 'ev3',
        explanation: 'Microtasks (Promises) always beat Macrotasks (timeouts) in the race to the CPU!',
        description: 'What is x after a timeout and a then?', template: 'function ev3() {\n  let x=0;\n  setTimeout(()=>x=1,0);\n  Promise.resolve().then(()=>x=2);\n  return x;\n}',
        testCases: [{ input: [], expected: 0 }], points: 25
    },
    {
        id: 'ev-4', lang: 'javascript', topic: 'event loop', difficulty: 'standard', title: 'Sync Block', functionName: 'ev4',
        explanation: 'Because JS is single-threaded, a long loop will "block" the event loop. Nothing else (like event handlers or timeouts) can run until the loop finishes.',
        description: 'Verify sync block holds up timeout', template: 'function ev4() {\n  let x=0;\n  setTimeout(()=>x=1, 0);\n  let i=0;\n  while(i<1000) i++;\n  return x;\n}',
        testCases: [{ input: [], expected: 0 }], points: 20
    },
    {
        id: 'ev-5', lang: 'javascript', topic: 'event loop', difficulty: 'standard', title: 'Recursive Micro', functionName: 'ev5',
        explanation: 'If you keep adding microtasks recursively, you can "starve" the event loop, preventing rendering and macrotasks from ever running!',
        description: 'Identify the starving loop', template: 'function ev5() {\n  let x=0;\n  function f(){ Promise.resolve().then(f); }\n  // f(); // DANGEROUS: this would crash the game!\n  return "starve";\n}',
        testCases: [{ input: [], expected: "starve" }], points: 25
    },
    {
        id: 'ev-6', lang: 'javascript', topic: 'event loop', difficulty: 'standard', title: 'Immediate Order', functionName: 'ev6',
        explanation: '`setImmediate` is a Node-specific macrotask that runs after the current poll phase finishes.',
        description: 'Basic order acknowledgement', template: 'function ev6() {\n  return "order";\n}',
        testCases: [{ input: [], expected: "order" }], points: 10
    },
    {
        id: 'ev-7', lang: 'javascript', topic: 'event loop', difficulty: 'standard', title: 'Multiple Macro', functionName: 'ev7',
        explanation: 'Macrotasks are executed one-by-one, with the event loop checking for microtasks in between each one.',
        description: 'Order of two timeouts', template: 'function ev7() {\n  let s="";\n  setTimeout(()=>s+="1",0);\n  setTimeout(()=>s+="2",0);\n  return s;\n}',
        testCases: [{ input: [], expected: "" }], points: 15
    },
    {
        id: 'ev-8', lang: 'javascript', topic: 'event loop', difficulty: 'standard', title: 'Multiple Micro', functionName: 'ev8',
        explanation: 'The microtask queue is emptied ENTIRELY before control is handed back to the event loop.',
        description: 'Order of two promises', template: 'function ev8() {\n  let s="";\n  Promise.resolve().then(()=>s+="1");\n  Promise.resolve().then(()=>s+="2");\n  return s;\n}',
        testCases: [{ input: [], expected: "" }], points: 15
    },
    {
        id: 'ev-9', lang: 'javascript', topic: 'event loop', difficulty: 'standard', title: 'Task Interleave', functionName: 'ev9',
        explanation: 'Understanding how different queues interact is key to building responsive apps.',
        description: 'Complex flow acknowledgment', template: 'function ev9() {\n  return "complex";\n}',
        testCases: [{ input: [], expected: "complex" }], points: 15
    },
    {
        id: 'ev-10', lang: 'javascript', topic: 'event loop', difficulty: 'standard', title: 'Callstack first', functionName: 'ev10',
        explanation: 'The callstack must be EMPTY before the event loop starts looking at the queues.',
        description: 'Identify callstack priority', template: 'function ev10() {\n  return 1;\n}',
        testCases: [{ input: [], expected: 1 }], points: 10
    },

    // --- MODULES (10) ---
    {
        id: 'mod-1', lang: 'javascript', topic: 'modules', difficulty: 'standard', title: 'Export Default', functionName: 'm1',
        explanation: '`export default` identifies the "main" value of a module. You can only have ONE default export per file.',
        description: 'Identity of a default export', template: 'export default function m1() {\n  return 1;\n}',
        testCases: [{ input: [], expected: 1 }], points: 10
    },
    {
        id: 'mod-2', lang: 'javascript', topic: 'modules', difficulty: 'standard', title: 'Named Export', functionName: 'm2',
        explanation: 'Named exports allow you to export many things from one file. You must use the exact name when importing them!',
        description: 'Identify a named export', template: 'export const m2 = 1;',
        testCases: [{ input: [], expected: 1 }], points: 10
    },
    {
        id: 'mod-3', lang: 'javascript', topic: 'modules', difficulty: 'standard', title: 'Import All', functionName: 'm3',
        explanation: 'The `import * as name` syntax grabs EVERYTHING exported from a module and puts it into one object.',
        description: 'Import as wildcard syntax', template: 'import * as mod from "./mod";',
        testCases: [{ input: [], expected: undefined }], points: 10
    },
    {
        id: 'mod-4', lang: 'javascript', topic: 'modules', difficulty: 'standard', title: 'Re-exporting', functionName: 'm4',
        explanation: 'You can export things that you\'ve imported from other files. This is great for creating "index" files.',
        description: 'Proxy export syntax', template: 'export { a } from "./other";',
        testCases: [{ input: [], expected: undefined }], points: 15
    },
    {
        id: 'mod-5', lang: 'javascript', topic: 'modules', difficulty: 'standard', title: 'Dynamic Import', functionName: 'm5',
        explanation: '`import()` (the function) lets you load modules only when you need them. It returns a Promise!',
        description: 'Syntax for async module loading', template: 'async function m5() {\n  const m = await import("./m.js");\n  return m;\n}',
        testCases: [{ input: [], expected: undefined }], points: 20
    },
    {
        id: 'mod-6', lang: 'javascript', topic: 'modules', difficulty: 'standard', title: 'Aliasing', functionName: 'm6',
        explanation: 'Use the `as` keyword to rename an import if it conflicts with a local variable.',
        description: 'Import with name change', template: 'import { a as b } from "./m";',
        testCases: [{ input: [], expected: undefined }], points: 10
    },
    {
        id: 'mod-7', lang: 'javascript', topic: 'modules', difficulty: 'standard', title: 'Side Effects', functionName: 'm7',
        explanation: 'A module with no variable names just runs the code inside it. This is called a "side-effect import".',
        description: 'Bare import syntax', template: 'import "./m";',
        testCases: [{ input: [], expected: undefined }], points: 15
    },
    {
        id: 'mod-8', lang: 'javascript', topic: 'modules', difficulty: 'standard', title: 'Singletons', functionName: 'm8',
        explanation: 'Modules only run ONCE. If two files import the same module, they share the same state. They are singletons!',
        description: 'Module state persistency', template: 'let x=0;\nexport const getX = ()=>x;\nexport const incX = ()=>x++;',
        testCases: [{ input: [], expected: 0 }], points: 20
    },
    {
        id: 'mod-9', lang: 'javascript', topic: 'modules', difficulty: 'standard', title: 'Top Level Await', functionName: 'm9',
        explanation: 'In modern ESM modules, you can use `await` at the top level, without needing to be inside an async function!',
        description: 'Wait in a module directly', template: 'const d = await fetch("");\nexport default d;',
        testCases: [{ input: [], expected: undefined }], points: 20
    },
    {
        id: 'mod-10', lang: 'javascript', topic: 'modules', difficulty: 'standard', title: 'CJS vs ESM', functionName: 'm10',
        explanation: '`require()` is the old CommonJS style (Node.js). `import` is the modern ES Modules standard.',
        description: 'Old-school require syntax', template: 'const m = require("./m");',
        testCases: [{ input: [], expected: undefined }], points: 15
    },

    // --- PROTOTYPE (10) ---
    {
        id: 'proto-1', lang: 'javascript', topic: 'prototype', difficulty: 'standard', title: 'Proto Chain', functionName: 'pt1',
        explanation: 'The **Prototype Chain** is like a family tree for objects. If you look for a property on an object and it\'s not there, JS will look at its parent (prototype), then its grandparent, and so on.',
        description: 'Access a property from the parent object', template: 'function pt1() {\n  const obj = Object.create({a:1});\n  return obj.a;\n}',
        testCases: [{ input: [], expected: 1 }], points: 15
    },
    {
        id: 'proto-2', lang: 'javascript', topic: 'prototype', difficulty: 'standard', title: 'hasOwn', functionName: 'pt2',
        explanation: '`hasOwnProperty()` (or `Object.hasOwn()`) checks if a property belongs to the object itself, rather than being inherited from the prototype chain.',
        description: 'Check if property "a" is local or inherited', template: 'function pt2() {\n  const obj = Object.create({a:1});\n  return obj.hasOwnProperty("a");\n}',
        testCases: [{ input: [], expected: false }], points: 10
    },
    {
        id: 'proto-3', lang: 'javascript', topic: 'prototype', difficulty: 'standard', title: 'Constructor Links', functionName: 'pt3',
        explanation: 'Every function has a `.prototype` property. When you use `new`, the resulting object gets linked to that prototype.',
        description: 'Access property from constructor prototype', template: 'function F(){}\nF.prototype.a=1;\nfunction pt3(){\n  return new F().a;\n}',
        testCases: [{ input: [], expected: 1 }], points: 15
    },
    {
        id: 'proto-4', lang: 'javascript', topic: 'prototype', difficulty: 'standard', title: 'Dunder Proto', functionName: 'pt4',
        explanation: '`__proto__` is a hidden property that points to the object\'s prototype. It\'s better to use `Object.getPrototypeOf()` nowadays!',
        description: 'Confirm the link between {} and Object', template: 'function pt4() {\n  return {}.__proto__ === Object.prototype;\n}',
        testCases: [{ input: [], expected: true }], points: 15
    },
    {
        id: 'proto-5', lang: 'javascript', topic: 'prototype', difficulty: 'standard', title: 'Assigning Proto', functionName: 'pt5',
        explanation: '`Object.setPrototypeOf()` lets you change an object\'s parent after it has already been created (though this can be slow!).',
        description: 'Change the prototype of an empty object', template: 'function pt5() {\n  const p={a:1};\n  return Object.setPrototypeOf({}, p).a;\n}',
        testCases: [{ input: [], expected: 1 }], points: 20
    },
    {
        id: 'proto-6', lang: 'javascript', topic: 'prototype', difficulty: 'standard', title: 'Null Prototype', functionName: 'pt6',
        explanation: 'You can create an object with NO parent by using `Object.create(null)`. It won\'t even have standard methods like `.toString()`.',
        description: 'Verify an object has no toString', template: 'function pt6() {\n  return Object.create(null).toString === undefined;\n}',
        testCases: [{ input: [], expected: true }], points: 20
    },
    {
        id: 'proto-7', lang: 'javascript', topic: 'prototype', difficulty: 'standard', title: 'Property Overrides', functionName: 'pt7',
        explanation: 'If you set a property on an object that it was previously inheriting, you "shadow" (hide) the inherited version.',
        description: 'Modify local property without affecting prototype', template: 'function F(){}\nF.prototype.a=1;\nfunction pt7(){\n  const o=new F();\n  o.a=2;\n  return F.prototype.a;\n}',
        testCases: [{ input: [], expected: 1 }], points: 15
    },
    {
        id: 'proto-8', lang: 'javascript', topic: 'prototype', difficulty: 'standard', title: 'Function Proto', functionName: 'pt8',
        explanation: 'Functions are objects too! They inherit from `Function.prototype`.',
        description: 'Verify function prototype link', template: 'function pt8() {\n  return (function(){}).__proto__ === Function.prototype;\n}',
        testCases: [{ input: [], expected: true }], points: 15
    },
    {
        id: 'proto-9', lang: 'javascript', topic: 'prototype', difficulty: 'standard', title: 'Deleting Local Props', functionName: 'pt9',
        explanation: 'If you delete a local property that was shadowing an inherited one, the inherited one becomes visible again!',
        description: 'Delete shadowed property to reveal prototype', template: 'function pt9() {\n  const p={a:1};\n  const o=Object.create(p);\n  o.a=2;\n  delete o.a;\n  return o.a;\n}',
        testCases: [{ input: [], expected: 1 }], points: 20
    },
    {
        id: 'proto-10', lang: 'javascript', topic: 'prototype', difficulty: 'standard', title: 'Final Shadowing', functionName: 'pt10',
        explanation: 'The proto chain always starts at the local object first. Local always wins!',
        description: 'Local shadowing priority', template: 'function pt10() {\n  const p={a:1};\n  const o=Object.create(p);\n  o.a=2;\n  return o.a;\n}',
        testCases: [{ input: [], expected: 2 }], points: 15
    }
];

async function seed() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zoho');
        console.log("Connected to MongoDB...");

        for (const q of manualQuests) {
            await Quest.findOneAndUpdate({ id: q.id }, q, { upsert: true });
            console.log(`Seeded: ${q.title} (${q.topic})`);
        }

        console.log("Manual seeding complete!");
        process.exit(0);
    } catch (err) {
        console.error("Seeding error:", err);
        process.exit(1);
    }
}

seed();
