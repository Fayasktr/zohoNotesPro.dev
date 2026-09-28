const mongoose = require('mongoose');
const Note = require('../models/Note');
const User = require('../models/User');
const engine = require('../engine/AntigravityEngine');
const crypto = require('crypto');

/**
 * Returns Gemini-compatible Function Declarations
 */
function getGeminiToolDeclarations(isAdmin = false) {
    const declarations = [
        {
            name: 'search_notes',
            description: isAdmin
                ? 'Search across all notes in the database (or candidate notes) matching a keyword query.'
                : 'Search through your personal notes matching a keyword query in the title or content.',
            parameters: {
                type: 'OBJECT',
                properties: {
                    query: { type: 'STRING', description: 'Search term or keyword' },
                    limit: { type: 'NUMBER', description: 'Maximum results to return (default: 10)' },
                    onlyMine: { type: 'BOOLEAN', description: 'If true, only search notes created/owned by the current user' }
                },
                required: ['query']
            }
        },
        {
            name: 'list_notes',
            description: isAdmin
                ? 'List notes across the platform (or candidate notes) with optional folder or starred filters. Set onlyMine: true to list only your personal notes.'
                : 'List your personal notes with title, folder name, and last updated timestamp.',
            parameters: {
                type: 'OBJECT',
                properties: {
                    limit: { type: 'NUMBER', description: 'Maximum notes to return (default: 20)' },
                    folder: { type: 'STRING', description: 'Filter by folder name (e.g. "root", "practice")' },
                    isStarred: { type: 'BOOLEAN', description: 'Filter by starred notes only' },
                    onlyMine: { type: 'BOOLEAN', description: 'If true, only returns notes created/owned by the current user' }
                }
            }
        },
        {
            name: 'get_note',
            description: 'Retrieve full text content, markdown explanation, live status, and code cells of a specific note by ID, title, or shareCode.',
            parameters: {
                type: 'OBJECT',
                properties: {
                    noteId: { type: 'STRING', description: 'Unique ID, title, or shareCode of the note' }
                },
                required: ['noteId']
            }
        },
        {
            name: 'create_note',
            description: 'Create a new notebook note or Live Collaborative Note/Mock Review with a title, folder, optional markdown, and an array of codeCells (for multi-question reviews or notebooks). Always pass all questions/cells in the codeCells array in a single call.',
            parameters: {
                type: 'OBJECT',
                properties: {
                    title: { type: 'STRING', description: 'Title of the note' },
                    folder: { type: 'STRING', description: 'Folder name (e.g. "root", "abid", etc.)' },
                    isLive: { type: 'BOOLEAN', description: 'Set to true if creating a Live Note / Live Mock Review in the Live Notes section' },
                    markdown: { type: 'STRING', description: 'Optional initial markdown instructions or overview cell' },
                    code: { type: 'STRING', description: 'Optional single code cell content' },
                    language: { type: 'STRING', description: 'Default programming language (e.g. javascript, python, c, cpp, java)' },
                    codeCells: {
                        type: 'ARRAY',
                        description: 'Array of cells/questions to add to the note at once (use this to add 5, 10, or 15+ questions in one call)',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                title: { type: 'STRING', description: 'Cell title or Question label (e.g. "Q1: For Loop")' },
                                type: { type: 'STRING', description: 'Cell type: "code" or "markdown" (default: "code")' },
                                language: { type: 'STRING', description: 'Programming language (default: "javascript")' },
                                code: { type: 'STRING', description: 'The question prompt, comments, or starter code inside the cell' }
                            }
                        }
                    }
                },
                required: ['title']
            }
        },
        {
            name: 'update_note',
            description: 'Update metadata, update markdown explanation, or append one or multiple code cells (via codeCells array) to an existing note.',
            parameters: {
                type: 'OBJECT',
                properties: {
                    noteId: { type: 'STRING', description: 'ID of the note to update' },
                    title: { type: 'STRING', description: 'New title' },
                    folder: { type: 'STRING', description: 'New folder name' },
                    isLive: { type: 'BOOLEAN', description: 'Set to true to make it a Live Note' },
                    markdown: { type: 'STRING', description: 'Updated or appended markdown notes' },
                    appendCode: { type: 'STRING', description: 'Single code snippet to append as a new cell' },
                    language: { type: 'STRING', description: 'Language of the new cell (default: javascript)' },
                    codeCells: {
                        type: 'ARRAY',
                        description: 'Array of multiple cells/questions to append to the note in one batch',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                title: { type: 'STRING', description: 'Cell title or Question label' },
                                type: { type: 'STRING', description: 'Cell type: "code" or "markdown"' },
                                language: { type: 'STRING', description: 'Programming language (default: "javascript")' },
                                code: { type: 'STRING', description: 'Cell content or code' }
                            }
                        }
                    }
                },
                required: ['noteId']
            }
        },
        {
            name: 'run_code_cell',
            description: 'Execute JavaScript, Python, C, C++, or Java code in the sandboxed AntigravityEngine and return the stdout and execution output.',
            parameters: {
                type: 'OBJECT',
                properties: {
                    language: { type: 'STRING', description: 'Programming language: javascript, python, c, cpp, java' },
                    code: { type: 'STRING', description: 'Source code to execute' },
                    stdin: { type: 'STRING', description: 'Optional standard input' }
                },
                required: ['language', 'code']
            }
        },
        {
            name: 'get_system_stats',
            description: 'Get platform note count, folder breakdown, and sandbox health stats.',
            parameters: {
                type: 'OBJECT',
                properties: {}
            }
        }
    ];

    if (isAdmin) {
        declarations.push(
            {
                name: 'list_users',
                description: 'List registered students and platform users with username, email, and roles (Admin only).',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        limit: { type: 'NUMBER', description: 'Maximum users to return (default: 50)' },
                        query: { type: 'STRING', description: 'Filter by username or email' }
                    }
                }
            },
            {
                name: 'get_api_usage',
                description: 'Get daily MCP token and request usage across all users, ranked with the highest consumers at the top (Admin only).',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        limit: { type: 'NUMBER', description: 'Maximum users to return (default: 20)' }
                    }
                }
            }
        );
    }

    return [{ functionDeclarations: declarations }];
}

/**
 * Dispatcher: Executes a tool called by Gemini
 */
async function executeGeminiTool(name, args = {}, user, isAdmin = false) {
    try {
        switch (name) {
            case 'search_notes': {
                const query = (args.query || '').trim();
                const limit = Math.min(Math.max(1, args.limit || 10), 50);
                const filter = { isTrashed: false };

                if (args.onlyMine || !isAdmin) {
                    if (user && user._id) {
                        filter.owner = user._id;
                    }
                }

                if (query) {
                    filter.$or = [
                        { title: { $regex: query, $options: 'i' } },
                        { folder: { $regex: query, $options: 'i' } },
                        { 'content.cells.content': { $regex: query, $options: 'i' } },
                        { 'content.markdown': { $regex: query, $options: 'i' } }
                    ];
                }

                const notes = await Note.find(filter)
                    .select('id title folder isStarred updatedAt authorName')
                    .sort({ updatedAt: -1 })
                    .limit(limit)
                    .lean();

                return {
                    count: notes.length,
                    query,
                    results: notes.map(n => ({
                        id: n.id,
                        title: n.title,
                        folder: n.folder || 'root',
                        author: n.authorName || 'User',
                        updatedAt: n.updatedAt
                    }))
                };
            }

            case 'list_notes': {
                const limit = Math.min(Math.max(1, args.limit || 20), 100);
                const filter = { isTrashed: false };

                if (args.onlyMine || !isAdmin) {
                    if (user && user._id) {
                        filter.owner = user._id;
                    }
                }
                if (args.folder) {
                    filter.folder = args.folder;
                }
                if (typeof args.isStarred === 'boolean') {
                    filter.isStarred = args.isStarred;
                }

                const notes = await Note.find(filter)
                    .select('id title folder isStarred updatedAt authorName')
                    .sort({ updatedAt: -1 })
                    .limit(limit)
                    .lean();

                return {
                    count: notes.length,
                    notes: notes.map(n => ({
                        id: n.id,
                        title: n.title,
                        folder: n.folder || 'root',
                        isStarred: !!n.isStarred,
                        author: n.authorName || 'User',
                        updatedAt: n.updatedAt
                    }))
                };
            }

            case 'get_note': {
                const noteIdentifier = (args.noteId || '').trim();
                const queryConditions = [
                    { id: noteIdentifier },
                    { shareCode: noteIdentifier }
                ];
                if (mongoose.Types.ObjectId.isValid(noteIdentifier)) {
                    queryConditions.push({ _id: noteIdentifier });
                }
                // Allow matching by exact or case-insensitive title
                queryConditions.push({ title: { $regex: '^' + noteIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', $options: 'i' } });

                const note = await Note.findOne({
                    $or: queryConditions,
                    isTrashed: false
                }).lean();

                if (!note) {
                    return { error: `Note not found for: ${args.noteId}` };
                }

                if (!isAdmin && user && note.owner && note.owner.toString() !== user._id.toString()) {
                    return { error: 'Forbidden: You do not have permission to view this note.' };
                }

                return {
                    id: note.id,
                    title: note.title,
                    folder: note.folder || 'root',
                    isLive: Boolean(note.isLive || (note.id && note.id.startsWith('live-'))),
                    shareCode: note.shareCode || null,
                    markdown: note.content?.markdown || '',
                    cells: (note.content?.cells || []).map(c => ({
                        id: c.id,
                        title: c.title || '',
                        type: c.type || 'code',
                        language: c.language || 'javascript',
                        content: c.content || ''
                    }))
                };
            }

            case 'create_note': {
                const isLive = Boolean(args.isLive || (args.title && /live|mock\s*review/i.test(args.title) && args.isLive !== false));
                const noteId = (isLive ? 'live-' : 'ntbk-') + Date.now() + (isLive ? '-' + crypto.randomBytes(2).toString('hex') : '');
                const shareCode = isLive ? ('collab-' + crypto.randomBytes(6).toString('hex')) : undefined;
                const cells = [];

                if (args.markdown) {
                    cells.push({
                        id: 'cell-' + crypto.randomBytes(4).toString('hex'),
                        type: 'markdown',
                        title: 'Instructions',
                        language: 'markdown',
                        content: args.markdown
                    });
                }

                if (Array.isArray(args.codeCells)) {
                    for (const cell of args.codeCells) {
                        cells.push({
                            id: 'cell-' + crypto.randomBytes(4).toString('hex'),
                            type: cell.type || 'code',
                            title: cell.title || '',
                            language: cell.language || args.language || 'javascript',
                            content: cell.code || cell.content || '',
                            output: null
                        });
                    }
                } else if (args.code) {
                    cells.push({
                        id: 'cell-' + crypto.randomBytes(4).toString('hex'),
                        type: 'code',
                        title: '',
                        language: args.language || 'javascript',
                        content: args.code,
                        output: null
                    });
                }

                const newNote = new Note({
                    id: noteId,
                    title: args.title || 'Untitled Note',
                    folder: args.folder || 'root',
                    owner: user ? user._id : null,
                    authorName: user ? (user.username || user.email) : 'AI Assistant',
                    isLive,
                    shareCode,
                    content: {
                        id: noteId,
                        title: args.title || 'Untitled Note',
                        folder: args.folder || 'root',
                        isStarred: false,
                        markdown: args.markdown || '',
                        cells,
                        tags: [],
                        isLive
                    },
                    isStarred: false,
                    isTrashed: false,
                    _version: 1,
                    updatedAt: new Date()
                });

                await newNote.save();
                return {
                    success: true,
                    message: `${isLive ? 'Live Note' : 'Note'} "${newNote.title}" created successfully in folder "${newNote.folder}" with ${cells.length} cells.`,
                    id: newNote.id,
                    folder: newNote.folder,
                    isLive,
                    cellCount: cells.length,
                    shareCode: newNote.shareCode || null
                };
            }

            case 'update_note': {
                const note = await Note.findOne({ id: args.noteId });
                if (!note) {
                    return { error: `Note not found for ID: ${args.noteId}` };
                }

                if (!isAdmin && user && note.owner && note.owner.toString() !== user._id.toString()) {
                    return { error: 'Forbidden: You do not have permission to update this note.' };
                }

                if (args.title) note.title = args.title;
                if (args.folder) note.folder = args.folder;
                if (typeof args.isLive === 'boolean') {
                    note.isLive = args.isLive;
                    if (note.content) note.content.isLive = args.isLive;
                }
                if (!note.content) note.content = {};
                if (!Array.isArray(note.content.cells)) note.content.cells = [];

                if (args.markdown) {
                    note.content.markdown = (note.content.markdown || '') + '\n\n' + args.markdown;
                }

                if (Array.isArray(args.codeCells)) {
                    for (const cell of args.codeCells) {
                        note.content.cells.push({
                            id: 'cell-' + crypto.randomBytes(4).toString('hex'),
                            type: cell.type || 'code',
                            title: cell.title || '',
                            language: cell.language || args.language || 'javascript',
                            content: cell.code || cell.content || '',
                            output: null
                        });
                    }
                }

                if (args.appendCode) {
                    note.content.cells.push({
                        id: 'cell-' + crypto.randomBytes(4).toString('hex'),
                        type: 'code',
                        title: '',
                        language: args.language || 'javascript',
                        content: args.appendCode,
                        output: null
                    });
                }

                note.markModified('content');
                note._version = (note._version || 1) + 1;
                note.updatedAt = new Date();
                await note.save();

                return {
                    success: true,
                    message: `Note "${note.title}" updated successfully (Total cells: ${note.content.cells.length}).`,
                    id: note.id,
                    cellCount: note.content.cells.length,
                    version: note._version
                };
            }

            case 'run_code_cell': {
                const executionResult = await engine.execute(args.code, args.language, {
                    stdin: args.stdin || ''
                });

                return {
                    language: args.language,
                    success: executionResult.success !== false,
                    stdout: executionResult.output || '',
                    stderr: executionResult.error || '',
                    executionTime: executionResult.executionTime || '0ms'
                };
            }

            case 'get_system_stats': {
                const totalNotes = await Note.countDocuments({ isTrashed: false });
                const starredNotes = await Note.countDocuments({ isStarred: true, isTrashed: false });
                const folders = await Note.distinct('folder', { isTrashed: false });

                return {
                    totalNotes,
                    starredNotes,
                    folders,
                    sandboxStatus: 'online'
                };
            }

            case 'list_users': {
                if (!isAdmin) return { error: 'Admin privileges required' };
                const limit = Math.min(Math.max(1, args.limit || 50), 100);
                const filter = {};
                if (args.query) {
                    const regex = new RegExp(args.query, 'i');
                    filter.$or = [{ username: regex }, { email: regex }];
                }

                const users = await User.find(filter)
                    .select('_id username email role isBlocked apiKey createdAt')
                    .sort({ createdAt: 1 })
                    .limit(limit)
                    .lean();

                return {
                    count: users.length,
                    users: users.map(u => ({
                        id: u._id,
                        username: u.username,
                        email: u.email,
                        role: u.role || 'user',
                        hasApiKey: !!u.apiKey
                    }))
                };
            }

            case 'get_api_usage': {
                if (!isAdmin) return { error: 'Admin privileges required' };
                const todayStr = new Date().toISOString().slice(0, 10);
                const users = await User.find({}).lean();
                const limit = Math.min(Math.max(1, args.limit || 20), 50);

                const enriched = users.map(u => {
                    const isUnlimited = u.role === 'admin' || (u.email && u.email.toLowerCase() === 'fayaskpktr@gmail.com');
                    const todayCount = (u.mcpUsage && u.mcpUsage.lastResetDate === todayStr) ? (u.mcpUsage.dailyCount || 0) : 0;
                    return {
                        username: u.username,
                        email: u.email,
                        isUnlimited,
                        todayRequests: todayCount,
                        isCapped: !isUnlimited && todayCount >= 50
                    };
                });

                enriched.sort((a, b) => b.todayRequests - a.todayRequests);

                return {
                    date: todayStr,
                    totalUsers: users.length,
                    leaderboard: enriched.slice(0, limit).map((u, i) => ({ rank: i + 1, ...u }))
                };
            }

            default:
                return { error: `Unknown tool requested: ${name}` };
        }
    } catch (err) {
        console.error(`[GeminiToolsAdapter] Error executing tool "${name}":`, err);
        return { error: `Tool execution failed: ${err.message}` };
    }
}

module.exports = {
    getGeminiToolDeclarations,
    executeGeminiTool
};
