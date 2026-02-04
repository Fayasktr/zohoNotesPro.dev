const Quest = require('../models/Quest');
const User = require('../models/User');
const aiService = require('../services/aiService');
const engine = require('../engine/AntigravityEngine');

exports.renderGameDashboard = (req, res) => {
    res.render('game/dashboard', {
        title: 'New World - Dashboard',
        user: req.user
    });
};

exports.renderGameMap = async (req, res) => {
    const { topic, difficulty } = req.params;
    try {
        // Map URL param 'topic' to Schema field 'language'
        const quests = await Quest.find({ language: topic, difficulty });

        res.render('game/map', {
            title: `Map: ${topic} - ${difficulty}`,
            topic,
            difficulty,
            quests,
            user: req.user
        });
    } catch (err) {
        res.status(500).render('error', { error: 'Failed to load map' });
    }
};

exports.renderPlayPage = async (req, res) => {
    const { questId } = req.params;
    try {
        const quest = await Quest.findOne({ id: questId });
        if (!quest) return res.redirect('/game');

        res.render('game/play', {
            title: `Playing: ${quest.title}`,
            quest,
            user: req.user
        });
    } catch (err) {
        res.status(500).render('error', { error: 'Failed to load quest' });
    }
};

exports.verifySolution = async (req, res) => {
    const { questId, code } = req.body;

    try {
        const quest = await Quest.findOne({ id: questId });
        if (!quest) return res.status(404).json({ error: 'Quest not found' });

        let results = [];
        let allPassed = true;

        for (const testCase of quest.testCases) {
            let passed = false;
            let actual = null;
            let error = null;

            if (quest.language === 'javascript') {
                // JS: Wrap in function call
                const funcName = quest.functionName || 'main';
                const inputArgs = testCase.input.map(arg => JSON.stringify(arg)).join(', ');
                const fullCode = `${code}\n${funcName}(${inputArgs});`;

                const execResult = await engine.execute(fullCode, 'javascript');

                if (execResult.success) {
                    actual = execResult.result;
                    // Loose equality for simplicity (5 == "5")
                    passed = actual == testCase.expected;
                } else {
                    error = execResult.error;
                }
            }
            else if (quest.language === 'python') {
                // Python: Append print call
                const funcName = quest.functionName;
                if (funcName) {
                    const inputArgs = testCase.input.map(arg => JSON.stringify(arg)).join(', ');
                    const driver = `\nprint(${funcName}(${inputArgs}))`;
                    const fullCode = code + driver;

                    const execResult = await engine.execute(fullCode, 'python');
                    if (execResult.success) {
                        const output = execResult.logs.join('').trim();
                        actual = output;
                        passed = output == String(testCase.expected);
                    } else {
                        error = execResult.error;
                    }
                } else {
                    // Script mode
                    const execResult = await engine.execute(code, 'python');
                    if (execResult.success) {
                        const output = execResult.logs.join('').trim();
                        actual = output;
                        passed = output == String(testCase.expected);
                    } else {
                        error = execResult.error;
                    }
                }
            }
            else if (['c', 'java', 'cpp'].includes(quest.language)) {
                // Compiled languages: Check STDOUT
                const execResult = await engine.execute(code, quest.language);
                if (execResult.success) {
                    const output = execResult.logs.join('').trim();
                    actual = output;
                    passed = output == String(testCase.expected);
                } else {
                    error = execResult.error;
                }
            }

            results.push({
                input: testCase.input,
                expected: testCase.expected,
                actual: error ? `Error: ${error}` : actual,
                passed
            });

            if (!passed) allPassed = false;
        }

        if (allPassed) {
            // Update User Stats (Mongoose)
            const user = await User.findById(req.user._id);
            if (!user.completedQuests.includes(questId)) {
                user.completedQuests.push(questId);
                user.points += quest.points;
                user.correctAnswersCount += 1;

                if (user.correctAnswersCount % 5 === 0) {
                    user.skipCredits += 1;
                }
                await user.save();
            }
            return res.json({ success: true, results, pointsEarned: quest.points });
        } else {
            return res.json({ success: false, results });
        }

    } catch (err) {
        console.error('Verification error:', err);
        res.status(400).json({ error: err.message });
    }
};

exports.skipQuest = async (req, res) => {
    const { questId } = req.body;
    try {
        const user = await User.findById(req.user._id);
        if (user.skipCredits > 0) {
            if (!user.completedQuests.includes(questId)) {
                user.completedQuests.push(questId);
                user.skipCredits -= 1;
                await user.save();
                return res.json({ success: true });
            }
            return res.status(400).json({ error: 'Quest already completed/skipped' });
        } else {
            return res.status(400).json({ error: 'No skip credits available' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.askProfessor = async (req, res) => {
    const { questId, code } = req.body;
    try {
        const quest = await Quest.findOne({ id: questId });
        if (!quest) return res.status(404).json({ error: 'Quest not found' });

        const hint = await aiService.getHint(quest, code);
        res.json({ hint });
    } catch (err) {
        res.status(500).json({ error: 'Professor is busy right now.' });
    }
};
