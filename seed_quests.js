require('dotenv').config();
const mongoose = require('mongoose');
const Quest = require('./models/Quest');

const defaultQuests = [
    {
        id: 'javascript-fundamentals-basic-1',
        lang: 'javascript',
        topic: 'fundamentals',
        difficulty: 'basic',
        title: 'Variable Declaration',
        functionName: 'declareVariables',
        description: 'Complete the function to declare a constant named "score" with value 100.',
        template: 'function declareVariables() {\n    // Your code here\n}',
        testCases: [{ input: [], expected: 100 }],
        points: 10,
        isAI: false
    },
    {
        id: 'javascript-fundamentals-basic-2',
        lang: 'javascript',
        topic: 'fundamentals',
        difficulty: 'basic',
        title: 'Simple Addition',
        functionName: 'add',
        description: 'Create a function that returns the sum of two numbers a and b.',
        template: 'function add(a, b) {\n    return a + b;\n}',
        testCases: [{ input: [5, 3], expected: 8 }, { input: [-1, 1], expected: 0 }],
        points: 10,
        isAI: false
    },
    {
        id: 'javascript-fundamentals-basic-3',
        lang: 'javascript',
        topic: 'fundamentals',
        difficulty: 'basic',
        title: 'Check Even',
        functionName: 'isEven',
        description: 'Return true if the number is even, false otherwise.',
        template: 'function isEven(n) {\n    // Your code here\n}',
        testCases: [{ input: [4], expected: true }, { input: [7], expected: false }],
        points: 10,
        isAI: false
    }
];

async function seed() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB for seeding');

        for (const q of defaultQuests) {
            await Quest.findOneAndUpdate({ id: q.id }, q, { upsert: true, new: true });
            console.log(`Seeded/Updated: ${q.title}`);
        }

        console.log('Seeding complete!');
    } catch (err) {
        console.error('Seeding failed:', err);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

seed();
