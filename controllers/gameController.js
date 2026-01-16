const Quest = require('../models/Quest');
const User = require('../models/User');
const aiService = require('../services/aiService');
const vm = require('vm');

const getUser = async (req) => {
    if (req.user) return req.user;
    if (req.session.userId) return await User.findById(req.session.userId);
    return null;
};

const smartStringify = (val, maxDepth = 5, seen = new WeakSet()) => {
    if (val === null) return "null";
    if (val === undefined) return "undefined";
    if (typeof val === "string") return `"${val}"`;
    if (typeof val !== "object" && typeof val !== "function") return String(val);

    if (maxDepth < 0) return "[...]";
    if (seen.has(val)) return "[Circular]";
    seen.add(val);

    if (Array.isArray(val)) {
        let parts = [];
        let emptyCount = 0;
        for (let i = 0; i < val.length; i++) {
            if (i in val) {
                if (emptyCount > 0) {
                    parts.push(`<${emptyCount} empty items>`);
                    emptyCount = 0;
                }
                parts.push(smartStringify(val[i], maxDepth - 1, seen));
            } else {
                emptyCount++;
            }
        }
        if (emptyCount > 0) {
            parts.push(`<${emptyCount} empty items>`);
        }
        return `[${parts.join(", ")}]`;
    }

    if (typeof val === "function") return `[Function: ${val.name || "(anonymous)"}]`;

    try {
        const entries = Object.entries(val);
        if (entries.length === 0) return "{}";
        const content = entries
            .map(([k, v]) => `${k}: ${smartStringify(v, maxDepth - 1, seen)}`)
            .join(", ");
        return `{ ${content} }`;
    } catch (e) {
        return "[Object]";
    }
};

const OFFICIAL_TOPICS = aiService.OFFICIAL_TOPICS;

// Growth Trigger: No longer needed here as SuperSeeder handles it globally
const checkAndGenerateQuests = async (lang, topic) => {
    // SuperSeeder is running in background globally
};

exports.renderGameDashboard = async (req, res) => {
    try {
        const user = await getUser(req);
        const defaultLang = user?.settings?.defaultLanguage || 'javascript';

        res.render('game/dashboard', {
            title: 'Learning Path - Dashboard',
            user: user,
            defaultLang,
            availableTopics: OFFICIAL_TOPICS
        });
    } catch (err) {
        console.error('Dashboard Error:', err);
        res.redirect('/');
    }
};

exports.renderGameMap = async (req, res) => {
    try {
        const { topic } = req.params;
        const user = await getUser(req);
        const defaultLang = user?.settings?.defaultLanguage || 'javascript';

        // Check/Seed quests for this topic
        const count = await Quest.countDocuments({ topic, lang: defaultLang });
        if (count === 0) {
            await checkAndGenerateQuests(defaultLang, topic);
        }

        const filteredQuests = await Quest.find({
            topic,
            lang: defaultLang
        }).sort({ createdAt: 1 });

        res.render('game/map', {
            title: `Learning: ${topic}`,
            topic,
            lang: defaultLang,
            quests: filteredQuests,
            user: user
        });
    } catch (err) {
        console.error('Map Error:', err);
        res.redirect('/game');
    }
};

exports.resumeTopic = async (req, res) => {
    try {
        const { topic } = req.params;
        const user = await getUser(req);
        const defaultLang = user?.settings?.defaultLanguage || 'javascript';

        const quests = await Quest.find({ topic, lang: defaultLang }).sort({ createdAt: 1 });
        if (quests.length === 0) return res.redirect('/game');

        // Find first uncompleted quest
        const nextQuest = quests.find(q => !user.completedQuests.includes(q.id)) || quests[0];

        res.redirect(`/game/play/${nextQuest.id}`);
    } catch (err) {
        console.error('Resume Error:', err);
        res.redirect('/game');
    }
};

exports.renderPlayPage = async (req, res) => {
    try {
        const { questId } = req.params;
        const quest = await Quest.findOne({ id: questId });
        const user = await getUser(req);

        if (!quest) return res.redirect('/game');

        // Get context: What index is this quest in the topic?
        const questsInTopic = await Quest.find({ lang: quest.lang, topic: quest.topic })
            .sort({ createdAt: 1 })
            .select('id');
        const questIndex = questsInTopic.findIndex(q => q.id === questId) + 1;

        // When a user starts a quest, check if we should trigger next growth batch
        checkAndGenerateQuests(quest.lang, quest.topic);

        res.render('game/play', {
            title: `Quest ${questIndex}: ${quest.title}`,
            quest,
            user: user,
            questIndex,
            totalQuests: questsInTopic.length
        });
    } catch (err) {
        console.error('Play Page Error:', err);
        res.redirect('/game');
    }
};

exports.verifySolution = async (req, res) => {
    const { questId, code } = req.body;
    const quest = await Quest.findOne({ id: questId });

    if (!quest) return res.status(404).json({ error: 'Quest not found' });

    try {
        let results = [];
        let allPassed = true;

        for (const testCase of quest.testCases) {
            const sandbox = { console: { log: () => { } } };
            const funcName = quest.functionName || 'main';
            const fullCode = `${code}\nresult = ${funcName}(...${JSON.stringify(testCase.input)});`;

            const context = vm.createContext(sandbox);
            vm.runInContext(fullCode, context, { timeout: 1000 });

            const actual = context.result;
            const passed = JSON.stringify(actual) === JSON.stringify(testCase.expected);

            results.push({
                input: testCase.input,
                expected: smartStringify(testCase.expected),
                actual: smartStringify(actual),
                passed
            });
            if (!passed) allPassed = false;
        }

        if (allPassed) {
            const currentUser = await getUser(req);
            if (currentUser) {
                const user = await User.findById(currentUser._id);
                if (user) {
                    user.correctAnswersCount = (user.correctAnswersCount || 0) + 1;
                    if (!user.completedQuests.includes(questId)) {
                        user.completedQuests.push(questId);
                        user.points += (quest.points || 10);
                    }
                    await user.save();
                }
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
        const currentUser = await getUser(req);
        if (!currentUser) return res.status(401).json({ error: 'Auth required' });

        const user = await User.findById(currentUser._id);
        if (user.skipCredits > 0) {
            if (!user.completedQuests.includes(questId)) {
                user.completedQuests.push(questId);
                user.skipCredits -= 1;
                await user.save();
                return res.json({ success: true });
            }
            return res.status(400).json({ error: 'Already completed' });
        } else {
            return res.status(400).json({ error: 'No skip credits' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.askMaster = async (req, res) => {
    const { questId, code, message } = req.body;
    const quest = await Quest.findOne({ id: questId });

    if (!quest) return res.status(404).json({ error: 'Quest not found' });

    try {
        const response = await aiService.askMaster(quest, code, message);
        res.json({ response });
    } catch (err) {
        res.status(500).json({ error: 'Master is busy right now.' });
    }
};
