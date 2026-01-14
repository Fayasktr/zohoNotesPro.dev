const quests = require('../config/quests');
const User = require('../models/User');
const aiService = require('../services/aiService');
const vm = require('vm');

exports.renderGameDashboard = (req, res) => {
    res.render('game/dashboard', {
        title: 'New World - Dashboard',
        user: req.user
    });
};

exports.renderGameMap = (req, res) => {
    const { topic, difficulty } = req.params;
    const filteredQuests = quests.filter(q => q.topic === topic && q.difficulty === difficulty);

    res.render('game/map', {
        title: `Map: ${topic} - ${difficulty}`,
        topic,
        difficulty,
        quests: filteredQuests,
        user: req.user
    });
};

exports.renderPlayPage = (req, res) => {
    const { questId } = req.params;
    const quest = quests.find(q => q.id === questId);

    if (!quest) return res.redirect('/game');

    res.render('game/play', {
        title: `Playing: ${quest.title}`,
        quest,
        user: req.user
    });
};

exports.verifySolution = async (req, res) => {
    const { questId, code } = req.body;
    const quest = quests.find(q => q.id === questId);

    if (!quest) return res.status(404).json({ error: 'Quest not found' });

    try {
        let results = [];
        let allPassed = true;

        for (const testCase of quest.testCases) {
            const sandbox = { console: { log: () => { } } };
            // Using quest.functionName for better reliability
            const funcName = quest.functionName || 'main';

            const fullCode = `${code}\nresult = ${funcName}(...${JSON.stringify(testCase.input)});`;

            const context = vm.createContext(sandbox);
            vm.runInContext(fullCode, context, { timeout: 1000 });

            const actual = context.result;
            const passed = actual === testCase.expected;

            results.push({ input: testCase.input, expected: testCase.expected, actual, passed });
            if (!passed) allPassed = false;
        }

        if (allPassed) {
            // Update User Stats
            const user = await User.findById(req.user._id);
            if (!user.completedQuests.includes(questId)) {
                user.completedQuests.push(questId);
                user.points += quest.points;
                user.correctAnswersCount += 1;

                // 1 skip per 5 answers
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
    const quest = quests.find(q => q.id === questId);

    if (!quest) return res.status(404).json({ error: 'Quest not found' });

    try {
        const hint = await aiService.getHint(quest, code);
        res.json({ hint });
    } catch (err) {
        res.status(500).json({ error: 'Professor is busy right now.' });
    }
};
