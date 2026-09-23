const mongoose = require('mongoose');
const User = require('../models/User');
const Note = require('../models/Note');

async function createLocalAmbarishExam() {
    console.log('--- Creating Ambarish Live Review in LOCAL MongoDB for Fayas KP ---');
    await mongoose.connect('mongodb://localhost:27017/zoho');

    const fayas = await User.findOne({
        $or: [
            { email: 'fayaskpktr@gmail.com' },
            { username: 'fayas kp' },
            { username: 'fayas' }
        ]
    });

    if (!fayas) {
        console.error('Fayas user not found locally!');
        process.exit(1);
    }

    console.log(`Found Fayas user: ${fayas.username} (${fayas.email}) ID: ${fayas._id}`);

    const existing = await Note.findOne({ folder: 'Ambarish', title: 'first mock review', isTrashed: false });
    if (existing) {
        console.log(`Note already exists locally: ${existing.id}`);
        existing.owner = fayas._id;
        existing.isLive = true;
        await existing.save();
        console.log('Updated owner to Fayas KP.');
        process.exit(0);
    }

    const newId = 'live-' + Date.now() + '-amb1';
    const shareCode = 'collab-amb' + Math.random().toString(36).substring(2, 8);

    const markdown = `# 🎯 JavaScript Mock Review 1 - Ambarish

**Candidate:** Ambarish  
**Reviewer:** Fayas KP  
**Folder:** Ambarish  
**Session:** First Mock Review (Live Collaboration)  

---

### 📋 Instructions for Ambarish:
1. **Prediction Boxes:** Read the code snippet and write your expected output and *why* in comments BEFORE running the cell.
2. **Theory Boxes:** Provide clear, precise technical explanations in comments.
3. **Practical Logic Boxes:** Write clean, efficient JavaScript functions to solve each problem and verify with the console test cases.
4. Test all edge cases.

Good luck! 🚀`;

    const codeCells = [
        {
            id: 'cell-p1',
            type: 'code',
            title: '1. Scope & Variable Shadowing (Prediction)',
            language: 'javascript',
            content: `// =============================================================\n// QUESTION 1: SCOPE & SHADOWING (Prediction)\n// =============================================================\nlet a = 10;\n\n{\n    var a = 20;\n    console.log("Inside block:", a);\n}\n\nconsole.log("Outside block:", a);\n\n// YOUR PREDICTION:\n// EXPLANATION (Why does this happen? What is illegal shadowing?):\n`
        },
        {
            id: 'cell-p2',
            type: 'code',
            title: '2. Hoisting & Temporal Dead Zone (Prediction)',
            language: 'javascript',
            content: `// =============================================================\n// QUESTION 2: HOISTING & TDZ (Prediction)\n// =============================================================\n// --- Section A ---\nconsole.log("Value of x:", x);\nvar x = 100;\n\nconsole.log("Value of y:", y);\nlet y = 200;\n\n// --- Section B ---\nsayHello();\nconst sayHello = function() {\n    console.log("Hello from inside sayHello!");\n};\n\n// YOUR PREDICTION FOR SECTION A:\n// YOUR PREDICTION FOR SECTION B:\n// EXPLANATION (TDZ vs Hoisting mechanism):\n`
        },
        {
            id: 'cell-p3',
            type: 'code',
            title: '3. Implicit Type Coercion & Equality (Prediction)',
            language: 'javascript',
            content: `// =============================================================\n// QUESTION 3: TYPE COERCION & EQUALITY (Prediction)\n// =============================================================\nconsole.log("5" + 2);            // Line 1: ?\nconsole.log("5" - 2);            // Line 2: ?\nconsole.log("5" * 2);            // Line 3: ?\nconsole.log("5" == 5);           // Line 4: ?\nconsole.log("5" === 5);          // Line 5: ?\nconsole.log(true + 1);           // Line 6: ?\nconsole.log(false - 1);          // Line 7: ?\nconsole.log([] + {});            // Line 8: ?\nconsole.log(null == undefined);  // Line 9: ?\nconsole.log(null === undefined); // Line 10: ?\n\n// WRITE YOUR PREDICTIONS FOR LINES 1-10:\n// EXPLAIN WHY "5" + 2 AND "5" - 2 BEHAVE DIFFERENTLY:\n`
        },
        {
            id: 'cell-p4',
            type: 'code',
            title: '4. Pass-By-Value vs Pass-By-Reference (Prediction)',
            language: 'javascript',
            content: `// =============================================================\n// QUESTION 4: PRIMITIVE vs REFERENCE MUTATION (Prediction)\n// =============================================================\nlet user1 = { name: "Ambarish", score: 85 };\nlet user2 = user1;\n\nuser2.name = "Fayas";\n\nconsole.log("user1.name:", user1.name); // ?\nconsole.log("user2.name:", user2.name); // ?\n\nlet score1 = 50;\nlet score2 = score1;\nscore2 = 100;\n\nconsole.log("score1:", score1); // ?\nconsole.log("score2:", score2); // ?\n\n// YOUR PREDICTION & EXPLANATION:\n`
        },
        {
            id: 'cell-p5',
            type: 'code',
            title: '5. Closures & Multiple Instances (Prediction)',
            language: 'javascript',
            content: `// =============================================================\n// QUESTION 5: CLOSURES & INDEPENDENT SCOPES (Prediction)\n// =============================================================\nfunction createCounter() {\n    let count = 0;\n    return function() {\n        count++;\n        console.log(count);\n    };\n}\n\nconst counter1 = createCounter();\nconst counter2 = createCounter();\n\ncounter1(); // Call 1: ?\ncounter1(); // Call 2: ?\ncounter2(); // Call 3: ?\ncounter1(); // Call 4: ?\ncounter2(); // Call 5: ?\n\n// YOUR PREDICTED SEQUENCE:\n// WHY DOES counter2 NOT START AT 2 OR 3?\n`
        },
        {
            id: 'cell-p6',
            type: 'code',
            title: '6. Event Loop & Microtasks vs Macrotasks (Prediction)',
            language: 'javascript',
            content: `// =============================================================\n// QUESTION 6: EVENT LOOP ORDER OF EXECUTION (Prediction)\n// =============================================================\nconsole.log("1: Synchronous Start");\n\nsetTimeout(() => {\n    console.log("2: setTimeout Callback (0ms)");\n}, 0);\n\nPromise.resolve().then(() => {\n    console.log("3: Promise Microtask Resolved");\n});\n\nconsole.log("4: Synchronous End");\n\n// YOUR PREDICTED LOG ORDER:\n// EXPLANATION:\n`
        },
        {
            id: 'cell-t7',
            type: 'code',
            title: '7. Core JavaScript Checklist (Theory)',
            language: 'javascript',
            content: `// =============================================================\n// QUESTION 7: CORE JAVASCRIPT CONCEPTS (Theory)\n// =============================================================\n// 1. Compilation vs Interpretation:\n//    Ans:\n\n// 2. var vs let vs const:\n//    Ans:\n\n// 3. Operators (&&, ||, ??, ternary):\n//    Ans:\n\n// 4. Function Declaration vs Expression vs Arrow Function:\n//    Ans:\n\n// 5. Shallow Copy vs Deep Copy:\n//    Ans:\n`
        },
        {
            id: 'cell-t8',
            type: 'code',
            title: '8. Falsy Values & Type Conversion (Theory)',
            language: 'javascript',
            content: `// =============================================================\n// QUESTION 8: FALSY VALUES & TYPE SYSTEM (Theory)\n// =============================================================\n// 1. List ALL 8 falsy values in JavaScript:\n//    Ans:\n\n// 2. Explicit Type Conversion vs Implicit Coercion:\n//    Ans:\n\n// 3. Temporal Dead Zone (TDZ):\n//    Ans:\n`
        },
        {
            id: 'cell-t9',
            type: 'code',
            title: '9. Loops: for...in vs for...of (Theory)',
            language: 'javascript',
            content: `// =============================================================\n// QUESTION 9: FOR...IN vs FOR...OF (Theory & Examples)\n// =============================================================\n// 1. What does 'for...in' iterate over?:\n//    Ans:\n\n// 2. What does 'for...of' iterate over?:\n//    Ans:\n\n// 3. What happens if you run 'for...of' on a plain Object?:\n//    Ans:\n`
        },
        {
            id: 'cell-t10',
            type: 'code',
            title: '10. Asynchronous JavaScript (Theory)',
            language: 'javascript',
            content: `// =============================================================\n// QUESTION 10: ASYNCHRONOUS JAVASCRIPT (Theory)\n// =============================================================\n// 1. Callback Function and "Callback Hell":\n//    Ans:\n\n// 2. Promise and its 3 states:\n//    Ans:\n\n// 3. Why async/await is preferred over .then() chains:\n//    Ans:\n`
        },
        {
            id: 'cell-c11',
            type: 'code',
            title: '11. Rest Parameters - Sum All Arguments (Practical)',
            language: 'javascript',
            content: `// =============================================================\n// QUESTION 11: REST PARAMETERS (Practical Logic)\n// =============================================================\nfunction sumAll(...numbers) {\n    // Write your logic here:\n    \n}\n\n// --- TEST CASES ---\nconsole.log(sumAll(3, 4, 5, 4, 5, 6)); // Expected: 27\nconsole.log(sumAll(10, 20, 30));       // Expected: 60\nconsole.log(sumAll(100));              // Expected: 100\nconsole.log(sumAll());                 // Expected: 0\n`
        },
        {
            id: 'cell-c12',
            type: 'code',
            title: '12. Array Methods - Filter Odd & Sum with Reduce (Practical)',
            language: 'javascript',
            content: `// =============================================================\n// QUESTION 12: FILTER & REDUCE (Practical Logic)\n// =============================================================\nconst arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];\n\n// Write your solution here:\n\n// Expected Odd Numbers: [1, 3, 5, 7, 9]\n// Expected Sum: 25\n`
        },
        {
            id: 'cell-c13',
            type: 'code',
            title: '13. Object Navigation & Dynamic Mark Calculation (Practical)',
            language: 'javascript',
            content: `// =============================================================\n// QUESTION 13: OBJECT MANIPULATION (Practical Logic)\n// =============================================================\nconst student = {\n    name: "Ambarish",\n    batch: "MERN Stack",\n    sub: {\n        maths: 18,\n        english: 15,\n        science: 20,\n        coding: 22\n    }\n};\n\n// 1. Print maths mark:\n\n// 2. Calculate total marks and average dynamically:\n`
        },
        {
            id: 'cell-c14',
            type: 'code',
            title: '14. String Logic - Character Frequency Counter (Practical)',
            language: 'javascript',
            content: `// =============================================================\n// QUESTION 14: CHARACTER FREQUENCY COUNTER (Practical Logic)\n// =============================================================\nfunction charFrequency(str) {\n    // Write your logic here:\n\n}\n\n// --- TEST CASE ---\nconsole.log(charFrequency("Hello World"));\n// Expected output: { h: 1, e: 1, l: 3, o: 2, w: 1, r: 1, d: 1 }\n`
        },
        {
            id: 'cell-c15',
            type: 'code',
            title: '15. Array Logic - Find Second Largest without .sort() (Practical)',
            language: 'javascript',
            content: `// =============================================================\n// QUESTION 15: SECOND LARGEST NUMBER (Practical Logic)\n// =============================================================\nfunction findSecondLargest(arr) {\n    // Write your logic here:\n\n}\n\n// --- TEST CASES ---\nconsole.log(findSecondLargest([12, 35, 1, 10, 34, 1]));   // Expected: 34\nconsole.log(findSecondLargest([10, 5, 10]));              // Expected: 5\nconsole.log(findSecondLargest([50, 50, 50]));             // Expected: null\nconsole.log(findSecondLargest([7]));                      // Expected: null\n`
        },
        {
            id: 'cell-c16',
            type: 'code',
            title: '16. Polyfill - Implement Custom myFilter (Practical)',
            language: 'javascript',
            content: `// =============================================================\n// QUESTION 16: CUSTOM POLYFILL / LOGIC (Practical Logic)\n// =============================================================\nArray.prototype.myFilter = function(callback) {\n    // Write your custom filter logic here:\n\n};\n\n// --- TEST CASES ---\nconst numbers = [10, 15, 20, 25, 30];\nconst greaterThan18 = numbers.myFilter(num => num > 18);\nconsole.log("Filtered > 18:", greaterThan18); // Expected: [20, 25, 30]\n\nconst evens = [1, 2, 3, 4, 5, 6].myFilter(num => num % 2 === 0);\nconsole.log("Evens:", evens); // Expected: [2, 4, 6]\n`
        },
        {
            id: 'cell-c17',
            type: 'code',
            title: '17. Mixed Array Extractor - Sum All Digits (Practical)',
            language: 'javascript',
            content: `// =============================================================\n// QUESTION 17: MIXED ARRAY DIGIT SUM (Practical Logic)\n// =============================================================\nconst arr = [1, 2, 3, "87", "fa-89", 5];\n\n// Write your extraction and summation logic here:\n\n// Expected digits: 1 + 2 + 3 + 8 + 7 + 8 + 9 + 5 = 43\n// Expected console output: 43\n`
        }
    ];

    const note = new Note({
        id: newId,
        title: 'first mock review',
        folder: 'Ambarish',
        owner: fayas._id,
        isLive: true,
        shareCode: shareCode,
        authorName: fayas.username || 'fayas kp',
        content: {
            id: newId,
            title: 'first mock review',
            folder: 'Ambarish',
            isStarred: false,
            cells: [
                {
                    id: 'cell-header',
                    type: 'markdown',
                    title: 'Instructions',
                    content: markdown,
                    language: 'markdown'
                },
                ...codeCells
            ],
            tags: [],
            isLive: true
        },
        _version: 1,
        updatedAt: new Date()
    });

    await note.save();
    console.log(` Created note in local MongoDB for Fayas KP! Note ID: ${note.id}`);
    process.exit(0);
}

createLocalAmbarishExam().catch(console.error);
