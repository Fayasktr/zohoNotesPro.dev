const { GoogleGenerativeAI } = require("@google/generative-ai");

class AIService {
    constructor() {
        // Load API key from env
        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey) {
            this.genAI = new GoogleGenerativeAI(apiKey);
            // Using 1.5 flash for speed/efficiency
            this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        }
    }

    /**
     * Get a hint for a student based on their current code and the quest
     */
    async getHint(quest, currentCode) {
        if (!this.model) return "AI Help is unavailable (API key missing).";

        const prompt = `
            You are a wise AI Professor helping a student with a coding challenge.
            Quest Title: ${quest.title}
            Description: ${quest.description}
            Student's Current Code:
            \`\`\`javascript
            ${currentCode}
            \`\`\`
            Goal: Give a helpful, concise hint without providing the full answer. 
            Focus on logic errors or syntax issues you see. Limit to 2 sentences.
        `;

        try {
            const result = await this.model.generateContent(prompt);
            return result.response.text().trim();
        } catch (err) {
            console.error("AI Hint Error:", err);
            return "Even professors have bad days. Try again in a bit!";
        }
    }

    /**
     * Generate a new quest dynamically (Future expansion)
     */
    async generateQuest(topic, difficulty) {
        if (!this.model) return null;

        const prompt = `
            Generate a new coding challenge for a platform like LeetCode.
            Topic: ${topic}
            Difficulty: ${difficulty}
            Return ONLY a valid JSON object with the following structure:
            {
                "title": "Title",
                "functionName": "correctFunctionName",
                "description": "Clear requirements",
                "template": "function template",
                "testCases": [{"input": [args], "expected": value}],
                "points": number (10-50 based on difficulty)
            }
        `;

        try {
            const result = await this.model.generateContent(prompt);
            const text = result.response.text().replace(/```json|```/g, "").trim();
            return JSON.parse(text);
        } catch (err) {
            console.error("AI Quest Gen Error:", err);
            return null;
        }
    }
}

module.exports = new AIService();
