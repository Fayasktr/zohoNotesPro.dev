const { decrypt } = require('./encryptionService');
const { getGeminiToolDeclarations, executeGeminiTool } = require('./geminiToolsAdapter');

const DEFAULT_MODEL = 'models/gemini-3.5-flash';
const MAX_TURNS = 12;

/**
 * Execute an agentic conversation with Gemini, automatically resolving function calls
 */
async function streamGeminiChat({
    user,
    message,
    history = [],
    onDelta = () => {},
    onToolCall = () => {},
    onToolResult = () => {},
    modelName = DEFAULT_MODEL
}) {
    // 1. Resolve decrypted API key strictly from the user's own saved key (BYOK only)
    let apiKey = null;
    if (user && user.geminiApiKey && user.geminiApiKey.encrypted) {
        apiKey = decrypt(user.geminiApiKey);
    }

    if (!apiKey) {
        const err = new Error('Please add your own Gemini API key in Settings to use Gemini Chat.');
        err.code = 'API_KEY_REQUIRED';
        throw err;
    }

    const isAdmin = user ? (user.role === 'admin' || (user.email && user.email.toLowerCase() === 'fayaskpktr@gmail.com')) : false;
    const tools = getGeminiToolDeclarations(isAdmin);

    // 2. Prepare initial message history
    const contents = [];
    
    if (Array.isArray(history)) {
        for (const item of history) {
            if (item.role && item.text) {
                contents.push({
                    role: item.role === 'user' ? 'user' : 'model',
                    parts: [{ text: item.text }]
                });
            }
        }
    }

    contents.push({
        role: 'user',
        parts: [{ text: message }]
    });

    const displayUser = user?.username || 'User';
    const systemInstruction = {
        role: 'system',
        parts: [
            {
                text: `You are Zoho Notes Pro AI, an intelligent coding assistant, researcher, and pair-programmer assisting ${displayUser}.
You have direct access to Zoho Notes tools:
- search_notes: search notes by keywords
- list_notes: list notes by folder or starred status
- get_note: retrieve full markdown, live status, and code cells of a note
- create_note: create a new note or Live Note/Mock Review (set isLive: true for live notes/reviews, and pass ALL questions/cells together in the codeCells array in a single call!)
- update_note: update markdown or append multiple cells via codeCells array
- run_code_cell: securely execute JavaScript, Python, C, C++, or Java code in the Antigravity sandbox
${isAdmin ? '- list_users: view registered students and candidates\n- get_api_usage: view the daily MCP API usage leaderboard' : ''}

IMPORTANT RULES:
1. When asked to create a note or mock review with multiple questions (e.g., 10 or 15 questions), ALWAYS pass ALL questions at once inside the "codeCells" array of a SINGLE "create_note" call (with "isLive": true if it is a live note or live mock review). Do NOT call update_note 15 separate times.
2. Always provide a clear final confirmation response in Markdown summarizing what you found, created, or updated.`
            }
        ]
    };

    const candidateModels = [
        modelName,
        'models/gemini-3.5-flash',
        'models/gemini-flash-lite-latest',
        'models/gemini-3-flash-preview',
        'models/gemini-flash-latest',
        'models/gemini-3.8-flash'
    ];
    const uniqueModels = [...new Set(candidateModels)];

    async function callGeminiApi(reqBody) {
        let response = null;
        let data = null;
        let lastError = null;

        for (const currentModel of uniqueModels) {
            const url = `https://generativelanguage.googleapis.com/v1beta/${currentModel}:generateContent`;
            try {
                response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-goog-api-key': apiKey
                    },
                    body: JSON.stringify(reqBody)
                });
                data = await response.json();

                if (response.status === 429) {
                    lastError = new Error('⚠️ Gemini Free Tier Rate Limit (15 RPM / 1,500 RPD) reached. Please wait a few seconds before trying again.');
                    await new Promise(r => setTimeout(r, 1500));
                    continue;
                }

                if (response.status === 503 || data.error?.message?.includes('high demand')) {
                    lastError = new Error('Model experiencing high demand, falling back...');
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }

                if (!response.ok || data.error) {
                    lastError = new Error(data.error?.message || `Gemini API returned status ${response.status}`);
                    continue;
                }

                lastError = null;
                break;
            } catch (netErr) {
                lastError = netErr;
            }
        }

        if (lastError || !data || !response?.ok) {
            throw (lastError || new Error('Failed to obtain response from Gemini API'));
        }
        return data;
    }

    let turnCount = 0;
    let finalAnswer = '';
    const executedActionLogs = [];

    while (turnCount < MAX_TURNS) {
        turnCount++;

        const requestBody = {
            contents,
            systemInstruction,
            tools,
            generationConfig: {
                maxOutputTokens: 8192
            }
        };

        const data = await callGeminiApi(requestBody);
        const candidate = data.candidates?.[0];
        if (!candidate || !candidate.content || !Array.isArray(candidate.content.parts)) {
            break;
        }

        const parts = candidate.content.parts;
        // Find ALL functionCall parts in this turn (Gemini can emit multiple parallel tool calls)
        const functionCallParts = parts.filter(p => p.functionCall);

        if (functionCallParts.length > 0) {
            // Preserve the exact model turn (including any thought/thoughtSignature parts)
            contents.push({
                role: 'model',
                parts: parts
            });

            const functionResponseParts = [];

            for (const fcPart of functionCallParts) {
                const fnCall = fcPart.functionCall;
                const toolName = fnCall.name;
                const toolArgs = fnCall.args || {};

                onToolCall({ name: toolName, args: toolArgs });

                const toolResult = await executeGeminiTool(toolName, toolArgs, user, isAdmin);
                onToolResult({ name: toolName, result: toolResult });

                if (toolResult && toolResult.message) {
                    executedActionLogs.push(`- **${toolName}**: ${toolResult.message}`);
                } else if (toolResult && toolResult.count !== undefined) {
                    executedActionLogs.push(`- **${toolName}**: Found ${toolResult.count} item(s)`);
                } else {
                    executedActionLogs.push(`- **${toolName}**: Completed`);
                }

                const fnRespPayload = {
                    name: toolName,
                    response: toolResult
                };
                if (fnCall.id) {
                    fnRespPayload.id = fnCall.id;
                }

                functionResponseParts.push({
                    functionResponse: fnRespPayload
                });
            }

            // Push all function responses in a single user turn to match Gemini's multi-call requirement
            contents.push({
                role: 'user',
                parts: functionResponseParts
            });

            continue;
        }

        // Extract visible text (excluding internal thought blocks)
        const visibleTextParts = parts
            .filter(p => typeof p.text === 'string' && !p.thought)
            .map(p => p.text)
            .join('\n')
            .trim();

        const fallbackTextParts = !visibleTextParts
            ? parts.filter(p => typeof p.text === 'string').map(p => p.text).join('\n').trim()
            : '';

        const chosenText = visibleTextParts || fallbackTextParts;
        if (chosenText) {
            finalAnswer += chosenText;
            onDelta(chosenText);
        }
        break;
    }

    // Safety net: If tool calls ran and exhausted turns (or returned empty final text), generate a final summary so the bubble is NEVER empty!
    if (!finalAnswer.trim()) {
        if (executedActionLogs.length > 0) {
            try {
                // Request a final text summary without tools
                const summaryData = await callGeminiApi({
                    contents: [
                        ...contents,
                        {
                            role: 'user',
                            parts: [{ text: 'Please summarize the actions you just completed for the user in clear Markdown.' }]
                        }
                    ],
                    systemInstruction,
                    generationConfig: { maxOutputTokens: 2048 }
                });
                const sumParts = summaryData.candidates?.[0]?.content?.parts || [];
                const sumText = sumParts.filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('\n').trim();
                if (sumText) {
                    finalAnswer = sumText;
                    onDelta(finalAnswer);
                }
            } catch (_) {
                // Fallback to deterministic action log summary
            }

            if (!finalAnswer.trim()) {
                finalAnswer = `✅ **Completed your request!** Here is what I executed:\n\n${executedActionLogs.join('\n')}`;
                onDelta(finalAnswer);
            }
        } else {
            finalAnswer = '⚠️ Gemini completed the turn without returning text. Please try rephrasing or breaking down your prompt.';
            onDelta(finalAnswer);
        }
    }

    return finalAnswer;
}

module.exports = {
    streamGeminiChat,
    DEFAULT_MODEL
};
