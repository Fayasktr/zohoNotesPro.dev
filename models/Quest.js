const mongoose = require('mongoose');

const questSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    topic: { type: String, required: true }, // javascript, python, c, java
    difficulty: { type: String, required: true, enum: ['basic', 'intermediate', 'advanced'] },
    title: { type: String, required: true },
    description: { type: String, required: true },
    functionName: { type: String, required: true }, // The function name the user must define or the class name for Java
    template: { type: String, required: true },
    testCases: [{
        input: { type: Array, required: true },
        expected: { type: mongoose.Schema.Types.Mixed, required: true }
    }],
    points: { type: Number, default: 10 }
}, { timestamps: true });

module.exports = mongoose.model('Quest', questSchema);
