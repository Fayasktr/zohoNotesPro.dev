const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");

class AIService {
    constructor() {
        this.modelsToTry = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-2.0-flash", "gemini-flash-latest"];
        this.currentModelIndex = 0;
        this.genAI = null;
        this.model = null;
        this.lastCallTime = 0; // In-memory fallback
        this.isSeeding = false;
        this.lockFile = path.join(process.cwd(), ".ai_lock");
        this.taskQueue = [];
        this.isProcessing = false;

        this.OFFICIAL_TOPICS = [
            'language fundamentals', 'variables', 'hoisting', 'data types', 'execution model',
            'scope', 'closure', 'all types of functions', 'predict this',
            'practical with fn borrowing', 'objects', 'array', 'array methods',
            'equal/comparison', 'type coercion', 'conversions', 'conditions and workflow',
            'switch', 'ternary operator', 'short-circuiting', 'guard clauses',
            'labeled statements', 'all type loops', 'error handling', 'async js',
            'callback', 'promise', 'async await', 'event loop', 'modules', 'prototype'
        ];
    }

    /**
     * Get the last call time from filesystem (persistent across nodemon restarts)
     */
    _getLastCallTime() {
        try {
            if (fs.existsSync(this.lockFile)) {
                return parseInt(fs.readFileSync(this.lockFile, "utf8")) || 0;
            }
        } catch (e) { }
        return 0;
    }

    /**
     * Save the last call time to filesystem
     */
    _setLastCallTime() {
        try {
            fs.writeFileSync(this.lockFile, Date.now().toString(), "utf8");
        } catch (e) { }
    }

    /**
     * Initialize or switch to the next available model
     */
    async init(forceNext = false) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return false;

        if (!this.genAI) {
            this.genAI = new GoogleGenerativeAI(apiKey);
        }

        if (forceNext) {
            this.currentModelIndex++;
        }

        if (this.currentModelIndex >= this.modelsToTry.length) {
            console.error("[AI SERVICE] All known models failed. Resetting index.");
            this.currentModelIndex = 0;
        }

        const modelName = this.modelsToTry[this.currentModelIndex];
        try {
            this.model = this.genAI.getGenerativeModel({ model: modelName });
            return true;
        } catch (err) {
            if (this.currentModelIndex < this.modelsToTry.length - 1) {
                return await this.init(true);
            }
            return false;
        }
    }

    /**
     * Entry point for AI requests - Guaranteed sequential (Queue)
     */
    async executePrompt(prompt, mode = "quest", retryCount = 0) {
        return new Promise((resolve, reject) => {
            this.taskQueue.push({ prompt, mode, retryCount, resolve, reject });
            this._processQueue();
        });
    }

    async _processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        while (this.taskQueue.length > 0) {
            const { prompt, mode, retryCount, resolve, reject } = this.taskQueue.shift();
            try {
                const result = await this._executeSequential(prompt, mode, retryCount);
                resolve(result);
            } catch (err) {
                console.error("[AI QUEUE ERROR]", err);
                resolve(null); // Resolve with null instead of rejecting to keep the app stable
            }
        }

        this.isProcessing = false;
    }

    /**
     * Actual sequential execution logic
     */
    async _executeSequential(prompt, mode, retryCount) {
        if (!this.model) {
            const ok = await this.init();
            if (!ok) return null;
        }

        // --- PERSISTENT COOLING CHECK ---
        const errorFile = path.join(process.cwd(), ".ai_error");
        if (fs.existsSync(errorFile)) {
            const cooldownData = fs.readFileSync(errorFile, "utf-8").split(":");
            const errTimestamp = parseInt(cooldownData[0]);
            const isHardLimit = cooldownData[1] === "hard";

            const cooldown = isHardLimit ? 21600000 : 300000; // 6 HOURS for hard limit, 5 mins for soft
            const timePassed = Date.now() - errTimestamp;

            if (timePassed < cooldown) {
                const waitTime = Math.ceil((cooldown - timePassed) / 60000);
                const format = waitTime > 60 ? `${Math.ceil(waitTime / 60)} hours` : `${waitTime} mins`;
                console.warn(`[AI SERVICE] 🔒 LOCKDOWN ACTIVE: Project Quota Resetting. Please wait ${format}.`);
                return null;
            } else {
                try { fs.unlinkSync(errorFile); } catch (e) { }
            }
        }

        // --- PERSISTENT 75s THROTTLE ---
        const now = Date.now();
        const lastCall = this._getLastCallTime();
        const timeSinceLast = now - lastCall;
        const requiredGap = 80000; // 80 seconds for absolute safety

        if (timeSinceLast < requiredGap) {
            const waitTime = requiredGap - timeSinceLast;
            if (waitTime > 2000) {
                console.log(`[AI SERVICE] Quota Guard: Resting for ${Math.round(waitTime / 1000)}s...`);
            }
            await new Promise(r => setTimeout(r, waitTime));
        }

        this._setLastCallTime();

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            return response.text().trim();
        } catch (err) {
            const errMsg = (err.message || "").toLowerCase();
            const currentModelName = this.modelsToTry[this.currentModelIndex];
            console.error(`[AI ERROR] Mode: ${mode} | Model: ${currentModelName} | Error: ${errMsg}`);

            // Handle 404
            if (errMsg.includes("404") || errMsg.includes("not found")) {
                if (this.currentModelIndex < this.modelsToTry.length - 1) {
                    await this.init(true);
                    return this._executeSequential(prompt, mode, retryCount);
                }
            }

            // Handle Hard Quota (Limit 0) vs Soft 429
            if (errMsg.includes("429") || errMsg.includes("quota exceeded") || errMsg.includes("fetch failed")) {
                const isHard = errMsg.includes("limit: 0") || errMsg.includes("billing");
                const lockType = isHard ? "hard" : "soft";
                console.warn(`[AI SERVICE] 🚨 ${lockType.toUpperCase()} QUOTA HIT. ENTERING LOCKDOWN...`);
                try { fs.writeFileSync(errorFile, `${Date.now()}:${lockType}`, "utf-8"); } catch (e) { }
            }

            return null;
        }
    }

    /**
     * Generate a single quest
     */
    async generateQuest(topic, existingTitles = []) {
        const prompt = `
            Task: Create a high-quality JavaScript coding quest for topic: "${topic}".
            Format: Strict JSON only.
            
            JSON Structure:
            {
                "title": "Clear catchy title",
                "functionName": "camelCase",
                "description": "## Learning Goal\\n...\\n## Quest\\n...\\n## Example Output\\n...",
                "template": "function camelCase() {\\n  // your code\\n}",
                "testCases": [{"input": [], "expected": 0}],
                "points": 15
            }
            
            Avoid duplicating: ${existingTitles.join(", ")}
        `;

        const responseText = await this.executePrompt(prompt, "quest");
        if (!responseText) return null;

        try {
            const cleanJson = responseText.replace(/```json|```/g, "").trim();
            return JSON.parse(cleanJson);
        } catch (e) {
            console.error("[AI SERVICE] JSON Parse Error");
            return null;
        }
    }

    /**
     * The Bulletproof Seeder - Strictly sequential and prioritized
     */
    async startSuperSeeding() {
        if (this.isSeeding) return;
        this.isSeeding = true;

        const Quest = require('../models/Quest');
        const lang = 'javascript';

        console.log("🚀 [SUPER SEEDER] Sequential background mission started (Strict 65s gaps)...");

        while (this.isSeeding) {
            // Manual Pause Check
            if (fs.existsSync(path.join(process.cwd(), ".pause_ai"))) {
                console.log("⏸️ [SUPER SEEDER] Manual pause detected via .pause_ai file. Sleeping for 1 minute...");
                await new Promise(r => setTimeout(r, 60000));
                continue;
            }

            let questAddedInThisLoop = false;

            for (const topic of this.OFFICIAL_TOPICS) {
                // Check current count
                const count = await Quest.countDocuments({ lang, topic });

                if (count < 100) {
                    console.log(`[SUPER SEEDER] Current Topic: ${topic} (${count}/100)`);
                    const existingTitles = await Quest.distinct('title', { lang, topic });

                    // This call will be queued and respect the 65s mandatory gap
                    const questData = await this.generateQuest(topic, existingTitles);

                    if (questData) {
                        const newQuest = new Quest({
                            ...questData,
                            id: `${lang}-${topic.replace(/\s+/g, '-')}-${count + 1}`,
                            lang, topic, difficulty: 'standard', isAI: true
                        });
                        await newQuest.save();
                        console.log(`[SUPER SEEDER] ✅ Generated & Saved: ${newQuest.title}`);
                        questAddedInThisLoop = true;

                        // Break and restart topic loop to ensure we pick the next priority topic
                        // and give the queue a chance to process other (user) requests
                        break;
                    } else {
                        console.warn(`[SUPER SEEDER] ❌ Empty result for ${topic}. Retrying in 2 minutes...`);
                        await new Promise(r => setTimeout(r, 120000));
                        break; // Break loop to retry from priority top
                    }
                }
            }

            if (!questAddedInThisLoop) {
                // Check if we truly finished everything
                const totalMissing = await this._getTotalMissingQuests(Quest, lang);
                if (totalMissing === 0) {
                    console.log("🏁 [SUPER SEEDER] Mission accomplished. All topics have 100 quests.");
                    this.isSeeding = false;
                }
            }

            // Pulse delay (low impact)
            await new Promise(r => setTimeout(r, 10000));
        }
    }

    async _getTotalMissingQuests(Quest, lang) {
        let missing = 0;
        for (const topic of this.OFFICIAL_TOPICS) {
            const count = await Quest.countDocuments({ lang, topic });
            if (count < 100) missing += (100 - count);
        }
        return missing;
    }

    async askMaster(quest, currentCode, userMessage) {
        const prompt = `
            System: You are "The Master", a legendary JS Sensei. 
            Context: Quest "${quest.title}".
            Current Code: \`\`\`javascript\n${currentCode}\n\`\`\`
            User: "${userMessage}"
            Rule: NO CODE SOLUTION. Teach logic only.
        `;

        const response = await this.executePrompt(prompt, "master");
        return response || "The Master is deep in thought. Try again shortly.";
    }
}

module.exports = new AIService();
