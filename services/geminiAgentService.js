const { decrypt } = require('./encryptionService');
const { getGeminiToolDeclarations, executeGeminiTool } = require('./geminiToolsAdapter');

const DEFAULT_MODEL = 'models/gemini-flash-latest';
const MAX_TURNS = 5;

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
    // 1. Resolve decrypted API key
    let apiKey = null;
    if (user && user.geminiApiKey) {
        apiKey = decrypt(user.geminiApiKey);
    }
    if (!apiKey) {
        apiKey = process.env.GEMINI_API_KEY || 'AIzaSyCIQkbe9yYuAU7CYULPQel9iUwGbIxRG_0';
    }

    if (!apiKey) {
        throw new Error('Gemini API key is not configured. Please add your key in User Settings.');
    }

    const isAdmin = user ? (user.role === 'admin' || (user.email && user.email.toLowerCase() === 'fayaskpktr@gmail.com')) : false;
    const tools = getGeminiToolDeclarations(isAdmin);

    // 2. Prepare initial message history
    const contents = [];
    
    // Add past history if provided
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

    // Add current user prompt
    contents.push({
        role: 'user',
        parts: [{ text: message }]
    });

    const systemInstruction = {
        role: 'system',
        parts: [
            {
                text: `You are Zoho Notes Pro AI, an intelligent coding assistant, researcher, and pair-programmer built specifically for Zoho Notes Pro and Fayas KP.
You have direct access to Zoho Notes tools:
- search_notes: search notes by keywords
- list_notes: list notes by folder or starred status
- get_note: retrieve full markdown and code cells
- create_note: create a new note
- update_note: update markdown or append a code cell
- run_code_cell: securely execute JavaScript, Python, C, C++, or Java code in the Antigravity sandbox
${isAdmin ? '- list_users: view registered students and candidates\n- get_api_usage: view the daily MCP API usage leaderboard' : ''}

When asked to search, query, inspect notes, or run code, ALWAYS call the appropriate tool.
Provide direct, concise, and helpful responses formatted in clean GitHub-flavored markdown with code syntax highlighting.`
            }
        ]
    };

    let turnCount = 0;
    let finalAnswer = '';

    while (turnCount < MAX_TURNS) {
        turnCount++;

        const requestBody = {
            contents,
            systemInstruction,
            tools
        };

        const candidateModels = [modelName, 'models/gemini-3.8-flash', 'models/gemini-flash-latest'];
        const uniqueModels = [...new Set(candidateModels)];

        let response = null;
        let data = null;
        let lastError = null;

        for (const currentModel of uniqueModels) {
            const url = `https://generativelanguage.googleapis.com/v1beta/${currentModel}:generateContent?key=${apiKey}`;
            try {
                response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });
                data = await response.json();

                if (response.status === 429) {
                    lastError = new Error('⚠️ Gemini Free Tier Rate Limit (15 RPM / 1,500 RPD) reached. Please wait a few seconds before trying again.');
                    // Try next model or wait briefly
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

                // Success!
                lastError = null;
                break;
            } catch (netErr) {
                lastError = netErr;
            }
        }

        if (lastError || !data || !response?.ok) {
            throw (lastError || new Error('Failed to obtain response from Gemini API'));
        }

        const candidate = data.candidates?.[0];
        if (!candidate || !candidate.content || !candidate.content.parts) {
            break;
        }

        const parts = candidate.content.parts;
        const functionCallPart = parts.find(p => p.functionCall);

        if (functionCallPart) {
            // Model wants to call a tool
            const fnCall = functionCallPart.functionCall;
            const toolName = fnCall.name;
            const toolArgs = fnCall.args || {};

            onToolCall({ name: toolName, args: toolArgs });

            // Execute tool locally
            const toolResult = await executeGeminiTool(toolName, toolArgs, user, isAdmin);
            onToolResult({ name: toolName, result: toolResult });

            // Push model's tool call turn to contents
            contents.push({
                role: 'model',
                parts: [functionCallPart]
            });

            // Push function response back to Gemini
            const fnRespPayload = {
                name: toolName,
                response: toolResult
            };
            if (fnCall.id) {
                fnRespPayload.id = fnCall.id;
            }

            contents.push({
                role: 'user',
                parts: [
                    {
                        functionResponse: fnRespPayload
                    }
                ]
            });

            // Continue orchestration loop to let Gemini generate the next answer with tool results
            continue;
        }

        // Model returned normal text content
        const textParts = parts.filter(p => p.text).map(p => p.text).join('\n');
        if (textParts) {
            finalAnswer += textParts;
            onDelta(textParts);
        }
        break;
    }

    return finalAnswer;
}

module.exports = {
    streamGeminiChat,
    DEFAULT_MODEL
};
