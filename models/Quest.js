const mongoose = require('mongoose');

const questSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    lang: { type: String, required: true }, // javascript, python, c, java
    topic: { type: String, default: 'algorithms' }, // fundamentals, arrays, etc.
    difficulty: { type: String, required: true, enum: ['basic', 'intermediate', 'advanced', 'standard'] },
    title: { type: String, required: true },
    description: { type: String, required: true },
    explanation: { type: String, default: "" }, // Educational content
    functionName: { type: String, required: true }, // The function name
    template: { type: String, required: true },
    testCases: [{
        input: { type: Array, required: true },
        expected: { type: mongoose.Schema.Types.Mixed, required: true }
    }],
    points: { type: Number, default: 10 },
    isAI: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Quest', questSchema);
