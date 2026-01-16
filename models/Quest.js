const mongoose = require('mongoose');

const questSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    lang: { type: String, required: true },
    topic: { type: String, required: true },
    difficulty: { type: String, required: true },
    title: { type: String, required: true },
    functionName: { type: String, required: true },
    description: { type: String, required: true },
    explanation: { type: String, default: "" }, // Educational content
    template: { type: String, required: true },
    testCases: [{
        input: [mongoose.Schema.Types.Mixed],
        expected: mongoose.Schema.Types.Mixed
    }],
    points: { type: Number, default: 10 },
    isAI: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Quest', questSchema);
