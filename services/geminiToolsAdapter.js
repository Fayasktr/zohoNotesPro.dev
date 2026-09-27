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
            description: 'Retrieve full text content, markdown explanation, and code cells of a specific note by ID or shareCode.',
            parameters: {
                type: 'OBJECT',
                properties: {
                    noteId: { type: 'STRING', description: 'Unique ID or shareCode of the note' }
                },
                required: ['noteId']
            }
        },
        {
            name: 'create_note',
            description: 'Create a new notebook note with a title, folder, markdown explanation, and optional code snippet.',
            parameters: {
                type: 'OBJECT',
                properties: {
                    title: { type: 'STRING', description: 'Title of the note' },
                    folder: { type: 'STRING', description: 'Folder name (default: "root")' },
                    markdown: { type: 'STRING', description: 'Initial markdown notes or explanation' },
                    code: { type: 'STRING', description: 'Optional initial source code' },
                    language: { type: 'STRING', description: 'Programming language (e.g. javascript, python, c, cpp, java)' }
                },
                required: ['title']
            }
        },
        {
            name: 'update_note',
            description: 'Update metadata, update markdown explanation, or append a new code cell to an existing note.',
            parameters: {
                type: 'OBJECT',
                properties: {
                    noteId: { type: 'STRING', description: 'ID of the note to update' },
                    title: { type: 'STRING', description: 'New title' },
                    folder: { type: 'STRING', description: 'New folder name' },
                    markdown: { type: 'STRING', description: 'Updated or appended markdown notes' },
                    appendCode: { type: 'STRING', description: 'Code to append as a new cell' },
                    language: { type: 'STRING', description: 'Language of the new cell (default: javascript)' }
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
                    markdown: note.content?.markdown || '',
                    cells: (note.content?.cells || []).map(c => ({
                        id: c.id,
                        type: c.type || 'code',
                        language: c.language || 'javascript',
                        content: c.content || ''
                    }))
                };
            }

            case 'create_note': {
                const noteId = 'ntbk-' + Date.now();
                const cells = [];
                if (args.code) {
                    cells.push({
                        id: 'cell-' + crypto.randomUUID(),
                        type: 'code',
                        language: args.language || 'javascript',
                        content: args.code
                    });
                }

                const newNote = new Note({
                    id: noteId,
                    title: args.title || 'Untitled Note',
                    folder: args.folder || 'root',
                    owner: user ? user._id : null,
                    authorName: user ? (user.username || user.email) : 'AI Assistant',
                    content: {
                        markdown: args.markdown || '',
                        cells
                    },
                    isLive: false,
                    isStarred: false,
                    isTrashed: false,
                    _version: 1
                });

                await newNote.save();
                return {
                    success: true,
                    message: `Note "${newNote.title}" created successfully.`,
                    id: newNote.id,
                    folder: newNote.folder
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
                if (!note.content) note.content = {};

                if (args.markdown) {
                    note.content.markdown = (note.content.markdown || '') + '\n\n' + args.markdown;
                }

                if (args.appendCode) {
                    if (!Array.isArray(note.content.cells)) note.content.cells = [];
                    note.content.cells.push({
                        id: 'cell-' + crypto.randomUUID(),
                        type: 'code',
                        language: args.language || 'javascript',
                        content: args.appendCode
                    });
                }

                note.markModified('content');
                note._version = (note._version || 1) + 1;
                note.updatedAt = new Date();
                await note.save();

                return {
                    success: true,
                    message: `Note "${note.title}" updated successfully.`,
                    id: note.id,
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
