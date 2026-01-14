const quests = [
    {
        id: 'js-basic-1',
        topic: 'javascript',
        difficulty: 'basic',
        title: 'Simple Addition',
        functionName: 'add',
        description: 'Create a function `add` that takes two numbers `a` and `b` and returns their sum.',
        template: 'function add(a, b) {\n    // Your code here\n    return \n}',
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
    }
    // More quests can be added here
];

module.exports = quests;
