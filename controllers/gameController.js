const Quest = require('../models/Quest');
const User = require('../models/User');
const aiService = require('../services/aiService');
const engine = require('../engine/AntigravityEngine');

exports.renderGameDashboard = async (req, res) => {
    try {
        const languages = await Quest.distinct('language');
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        res.render('game/dashboard', {
            title: 'Code Quests & Gamified Learning - Zoho Notes',
            metaTitle: 'Code Quests & Gamified Learning - Zoho Notes',
            metaDescription: 'Level up your coding skills with interactive quests and gamified learning challenges in JavaScript, Python, C, and Java.',
            canonicalUrl: `${baseUrl}/game`,
            user: req.user,
            availableTopics: languages.length > 0 ? languages : ['javascript', 'python', 'c', 'java'] // Fallback
        });
    } catch (err) {
        console.error('Dashboard Error:', err);
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        res.render('game/dashboard', {
            title: 'Code Quests & Gamified Learning - Zoho Notes',
            metaTitle: 'Code Quests & Gamified Learning - Zoho Notes',
            metaDescription: 'Level up your coding skills with interactive quests and gamified learning challenges in JavaScript, Python, C, and Java.',
            canonicalUrl: `${baseUrl}/game`,
            user: req.user,
            availableTopics: ['javascript', 'python', 'c', 'java']
        });
    }
};

exports.renderGameMap = async (req, res) => {
    const { topic } = req.params;
    const { difficulty } = req.query;
    try {
        // Map URL param 'topic' to Schema field 'language'
        const query = { language: topic };
        if (difficulty) query.difficulty = difficulty;

        const quests = await Quest.find(query).lean();
        const baseUrl = `${req.protocol}://${req.get('host')}`;

        res.render('game/map', {
            title: `${topic.toUpperCase()} Quest Map - Zoho Notes`,
            metaTitle: `${topic.toUpperCase()} Quest Map - Zoho Notes`,
            metaDescription: `Master ${topic} with interactive coding quests and challenges on Zoho Notes.`,
            canonicalUrl: `${baseUrl}/game/map/${topic}`,
            topic,
            difficulty,
            quests,
            user: req.user
        });
    } catch (err) {
        res.status(500).render('error', { title: 'Error - Zoho Notes', error: 'Failed to load map' });
    }
};

exports.renderPlayPage = async (req, res) => {
    const { questId } = req.params;
    try {
        const quest = await Quest.findOne({ id: questId }).lean();
        if (!quest) return res.redirect('/game');
        const baseUrl = `${req.protocol}://${req.get('host')}`;

        res.render('game/play', {
            title: `Quest: ${quest.title} - Zoho Notes`,
            metaTitle: `Quest: ${quest.title} - Zoho Notes`,
            metaDescription: `Solve "${quest.title}" coding challenge in ${quest.language} on Zoho Notes.`,
            canonicalUrl: `${baseUrl}/game/play/${questId}`,
            quest,
            user: req.user
        });
    } catch (err) {
        res.status(500).render('error', { title: 'Error - Zoho Notes', error: 'Failed to load quest' });
    }
};

exports.verifySolution = async (req, res) => {
    const { questId, code } = req.body;

    try {
        const quest = await Quest.findOne({ id: questId }).lean();
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
        const quest = await Quest.findOne({ id: questId }).lean();
        if (!quest) return res.status(404).json({ error: 'Quest not found' });

        const hint = await aiService.getHint(quest, code);
        res.json({ hint });
    } catch (err) {
        res.status(500).json({ error: 'Professor is busy right now.' });
    }
};

// Aliases for route compatibility
exports.askMaster = exports.askProfessor;

exports.resumeTopic = (req, res) => {
    const { topic } = req.params;
    // For now, just redirect to the map view for that topic
    res.redirect(`/game/map/${topic}`);
};

