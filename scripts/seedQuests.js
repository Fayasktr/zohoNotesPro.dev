const mongoose = require('mongoose');
const Quest = require('../models/Quest');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const initialQuests = [
    {
        id: 'javascript-fundamentals-basic-1',
        lang: 'javascript',
        topic: 'fundamentals',
        difficulty: 'basic',
        title: 'The Great Addition',
        functionName: 'add',
        description: 'Create a function called "add" that takes two numbers and returns their sum.',
        template: 'function add(a, b) {\n  return a + b;\n}',
        testCases: [{ input: [5, 10], expected: 15 }, { input: [-1, 1], expected: 0 }],
        points: 10
    },
    {
        id: 'javascript-fundamentals-basic-2',
        lang: 'javascript',
        topic: 'fundamentals',
        difficulty: 'basic',
        title: 'Reverse the Echo',
        functionName: 'reverseString',
        description: 'Create a function called "reverseString" that takes a string and returns it reversed.',
        template: 'function reverseString(str) {\n  return str.split("").reverse().join("");\n}',
        testCases: [{ input: ["hello"], expected: "olleh" }],
        points: 15
    },
    {
        id: 'javascript-fundamentals-basic-3',
        lang: 'javascript',
        topic: 'fundamentals',
        difficulty: 'basic',
        title: 'Even or Odd',
        functionName: 'isEven',
        description: 'Return true if the number is even, false otherwise.',
        template: 'function isEven(n) {\n  \n}',
        testCases: [{ input: [4], expected: true }, { input: [7], expected: false }],
        points: 10
    },
    {
        id: 'javascript-fundamentals-basic-4',
        lang: 'javascript',
        topic: 'fundamentals',
        difficulty: 'basic',
        title: 'Max of Two',
        functionName: 'maxTwo',
        description: 'Return the larger of two numbers.',
        template: 'function maxTwo(a, b) {\n  \n}',
        testCases: [{ input: [10, 20], expected: 20 }, { input: [5, 5], expected: 5 }],
        points: 10
    },
    {
        id: 'javascript-fundamentals-basic-5',
        lang: 'javascript',
        topic: 'fundamentals',
        difficulty: 'basic',
        title: 'Array Sum',
        functionName: 'sumArray',
        description: 'Return the sum of all numbers in an array.',
        template: 'function sumArray(arr) {\n  \n}',
        testCases: [{ input: [[1, 2, 3]], expected: 6 }, { input: [[10, -5]], expected: 5 }],
        points: 20
    },
    {
        id: 'javascript-fundamentals-basic-6',
        lang: 'javascript',
        topic: 'fundamentals',
        difficulty: 'basic',
        title: 'First Element',
        functionName: 'getFirst',
        description: 'Return the first element of an array.',
        template: 'function getFirst(arr) {\n  \n}',
        testCases: [{ input: [[1, 2, 3]], expected: 1 }],
        points: 5
    },
    {
        id: 'javascript-fundamentals-basic-7',
        lang: 'javascript',
        topic: 'fundamentals',
        difficulty: 'basic',
        title: 'Square Number',
        functionName: 'square',
        description: 'Return the square of a number.',
        template: 'function square(n) {\n  \n}',
        testCases: [{ input: [4], expected: 16 }, { input: [0], expected: 0 }],
        points: 10
    },
    {
        id: 'javascript-fundamentals-basic-8',
        lang: 'javascript',
        topic: 'fundamentals',
        difficulty: 'basic',
        title: 'Contains String',
        functionName: 'contains',
        description: 'Check if string "a" contains string "b".',
        template: 'function contains(a, b) {\n  \n}',
        testCases: [{ input: ["hello", "ell"], expected: true }, { input: ["abc", "def"], expected: false }],
        points: 15
    },
    {
        id: 'javascript-fundamentals-basic-9',
        lang: 'javascript',
        topic: 'fundamentals',
        difficulty: 'basic',
        title: 'Fahrenheit to Celsius',
        functionName: 'toCelsius',
        description: 'Convert F to C formula: (F-32) * 5/9.',
        template: 'function toCelsius(f) {\n  \n}',
        testCases: [{ input: [32], expected: 0 }, { input: [212], expected: 100 }],
        points: 20
    },
    {
        id: 'javascript-fundamentals-basic-10',
        lang: 'javascript',
        topic: 'fundamentals',
        difficulty: 'basic',
        title: 'Counter',
        functionName: 'countUpTo',
        description: 'Return an array of numbers from 1 to n.',
        template: 'function countUpTo(n) {\n  \n}',
        testCases: [{ input: [3], expected: [1, 2, 3] }],
        points: 20
    }
];

async function seed() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected');
        await Quest.deleteMany({});
        await Quest.insertMany(initialQuests);
        console.log('Seeded 10 quests');
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
seed();
