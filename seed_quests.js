require('dotenv').config();
const mongoose = require('mongoose');
const Quest = require('./models/Quest');

const quests = [
    // --- JAVASCRIPT ---
    {
        id: 'js-basic-1',
        topic: 'javascript',
        difficulty: 'basic',
        title: 'Simple Addition',
        functionName: 'add',
        description: 'Create a function `add` that takes two numbers `a` and `b` and returns their sum.',
        template: 'function add(a, b) {\n    // Your code here\n    \n}',
        testCases: [
            { input: [2, 3], expected: 5 },
            { input: [-1, 1], expected: 0 },
            { input: [0, 0], expected: 0 }
        ],
        points: 10
    },
    {
        id: 'js-basic-2',
        topic: 'javascript',
        difficulty: 'basic',
        title: 'String Length',
        functionName: 'getLength',
        description: 'Create a function `getLength` that takes a string `str` and returns its length.',
        template: 'function getLength(str) {\n    // Your code here\n    \n}',
        testCases: [
            { input: ["hello"], expected: 5 },
            { input: [""], expected: 0 },
            { input: ["zoho"], expected: 4 }
        ],
        points: 10
    },
    {
        id: 'js-int-1',
        topic: 'javascript',
        difficulty: 'intermediate',
        title: 'Find Maximum',
        functionName: 'findMax',
        description: 'Create a function `findMax` that takes an array of numbers and returns the largest number.',
        template: 'function findMax(arr) {\n    // Your code here\n    \n}',
        testCases: [
            { input: [[1, 2, 3]], expected: 3 },
            { input: [[-10, -5, -2]], expected: -2 },
            { input: [[5]], expected: 5 }
        ],
        points: 20
    },
    {
        id: 'js-int-2',
        topic: 'javascript',
        difficulty: 'intermediate',
        title: 'Reverse String',
        functionName: 'reverseString',
        description: 'Create a function `reverseString` that takes a string and returns it reversed.',
        template: 'function reverseString(str) {\n    // Your code here\n    \n}',
        testCases: [
            { input: ["hello"], expected: "olleh" },
            { input: ["world"], expected: "dlrow" }
        ],
        points: 20
    },

    // --- PYTHON ---
    {
        id: 'py-basic-1',
        topic: 'python',
        difficulty: 'basic',
        title: 'Python Addition',
        functionName: 'add',
        description: 'Write a function `add(a, b)` that returns the sum of two numbers.',
        template: 'def add(a, b):\n    # Your code here\n    pass',
        testCases: [
            { input: [5, 7], expected: 12 },
            { input: [-3, 3], expected: 0 }
        ],
        points: 10
    },
    {
        id: 'py-int-1',
        topic: 'python',
        difficulty: 'intermediate',
        title: 'Square List',
        functionName: 'square_list',
        description: 'Write a function `square_list(nums)` that takes a list of numbers and returns a new list with the squares of those numbers.',
        template: 'def square_list(nums):\n    # Your code here\n    pass',
        testCases: [
            { input: [[1, 2, 3]], expected: [1, 4, 9] },
            { input: [[-1, 0, 1]], expected: [1, 0, 1] }
        ],
        points: 20
    },

    // --- C ---
    {
        id: 'c-basic-1',
        topic: 'c',
        difficulty: 'basic',
        title: 'Sum in C',
        functionName: 'main', // Not used typically in C exec unless structured, but required by schema
        description: 'Write a C program that prints "Hello World". (Test case checks stdout)',
        template: '#include <stdio.h>\n\nint main() {\n    // Your code here\n    return 0;\n}',
        testCases: [
            // Note: C execution in engine usually returns nothing or stdout logic. 
            // For simplicity in this seed, let's assume we want a standard output match.
            // However, the current generic validation logic in gameController might need tweeking for C/Java which returns STDOUT vs Return Value.
            // Since gameController.js uses vm.runInContext for JS, we need to UPDATE verification logic for other languages too.
            // For now, let's stick to adding the data, but acknowledge verifySolution needs an update.
            { input: [], expected: "Hello World" }
        ],
        points: 10
    },

    // --- JAVA ---
    {
        id: 'java-basic-1',
        topic: 'java',
        difficulty: 'basic',
        title: 'Java Hello',
        functionName: 'Main',
        description: 'Write a Java class `Main` with a main method that prints "Hello Java".',
        template: 'public class Main {\n    public static void main(String[] args) {\n        // Your code here\n    }\n}',
        testCases: [
            { input: [], expected: "Hello Java" }
        ],
        points: 10
    }
];

// Note: This seed script assumes the DB is accessible. 
// For C/Java/Python verification, we need to ensure gameController handles them.
// The current gameController.js ONLY handles JS via vm.runInContext.
// I will need to update gameController.js to use engine.execute() which handles all languages.

const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zoho';

mongoose.connect(mongoURI)
    .then(async () => {
        console.log('Connected to MongoDB');

        // Clear existing quests if you want a fresh start, or upsert.
        // Let's upsert.
        for (const quest of quests) {
            await Quest.findOneAndUpdate({ id: quest.id }, quest, { upsert: true, new: true });
            console.log(`Seeded: ${quest.title}`);
        }

        console.log('Done!');
        process.exit(0);
    })
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
