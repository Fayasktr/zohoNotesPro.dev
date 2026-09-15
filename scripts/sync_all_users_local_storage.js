#!/usr/bin/env node

/**
 * Zoho Notes Pro - All Users & Notes Local Storage Synchronizer
 * 
 * Features:
 * 1. Connects to MongoDB via MONGODB_URI in .env
 * 2. Extracts all users and their notes/files into a structured local directory:
 *    ./local_storage_backup/<username>/<folder>/<note-title>.json
 * 3. Exports an aggregate dump: ./local_storage_backup/all_users_notes_dump.json
 * 4. Supports --push: Reads local storage files and updates/upserts notes back to MongoDB
 * 5. Supports --git: Commits and pushes the local storage files to the Git repository
 * 
 * Usage:
 *   node scripts/sync_all_users_local_storage.js              # Pull/Dump all users & notes to local storage
 *   node scripts/sync_all_users_local_storage.js --push       # Push local storage notes back to MongoDB
 *   node scripts/sync_all_users_local_storage.js --git        # Pull and push local storage backup to Git
 *   node scripts/sync_all_users_local_storage.js --push --git # Push to MongoDB and push to Git
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const User = require('../models/User');
const Note = require('../models/Note');

// Command line argument flags
const args = process.argv.slice(2);
const isPushMode = args.includes('--push');
const isGitPush = args.includes('--git');
const isHelp = args.includes('--help') || args.includes('-h');

const customDirIdx = args.indexOf('--dir');
const targetBackupDir = customDirIdx !== -1 && args[customDirIdx + 1]
    ? path.resolve(args[customDirIdx + 1])
    : path.join(__dirname, '..', 'local_storage_backup');

if (isHelp) {
    console.log(`
Zoho Notes Pro - All Users & Notes Local Storage Sync Script

Options:
  (no flags)     Pull all users and all notes from MongoDB to local storage disk
  --push         Read local storage backup files and push/upsert to MongoDB
  --git          Commit and push local storage directory to Git remote
  --dir <path>   Specify custom directory path for local storage backup
  --help, -h     Show this help message

Examples:
  node scripts/sync_all_users_local_storage.js
  node scripts/sync_all_users_local_storage.js --push
  node scripts/sync_all_users_local_storage.js --git
`);
    process.exit(0);
}

function sanitizeFileName(name) {
    if (!name) return 'untitled';
    return name.replace(/[/\\?%*:|"<>]/g, '_').trim().slice(0, 80) || 'untitled';
}

async function connectDB() {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zoho';
    const maskedURI = mongoURI.replace(/:([^:@]+)@/, ':****@');
    console.log(`🔌 Connecting to MongoDB at: ${maskedURI}...`);
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB successfully.\n');
}

/**
 * PULL: Connect to MongoDB and write all users and notes to local storage
 */
async function pullAllUsersAndNotes() {
    console.log(`📦 Fetching all users and notes from MongoDB...`);
    const users = await User.find().lean();
    const notes = await Note.find().lean();

    console.log(`👤 Found ${users.length} user account(s).`);
    console.log(`📝 Found ${notes.length} total note(s).\n`);

    if (!fs.existsSync(targetBackupDir)) {
        fs.mkdirSync(targetBackupDir, { recursive: true });
    }

    // Build user map for fast lookup
    const userMap = new Map();
    users.forEach(u => {
        userMap.set(String(u._id), u);
    });

    // Group notes by user
    const notesByUser = new Map();
    notes.forEach(note => {
        const ownerId = String(note.owner || 'unassigned');
        if (!notesByUser.has(ownerId)) {
            notesByUser.set(ownerId, []);
        }
        notesByUser.get(ownerId).push(note);
    });

    let totalExportedFiles = 0;

    // Export each user's notes
    for (const [userId, userNotes] of notesByUser.entries()) {
        const user = userMap.get(userId);
        const userFolderSlug = user ? sanitizeFileName(user.username || user.email || userId) : `user_${userId}`;
        const userPath = path.join(targetBackupDir, userFolderSlug);

        if (!fs.existsSync(userPath)) {
            fs.mkdirSync(userPath, { recursive: true });
        }

        // Save user profile metadata
        const userMeta = user ? {
            id: String(user._id),
            username: user.username,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt
        } : { id: userId };

        fs.writeFileSync(path.join(userPath, '_user_info.json'), JSON.stringify(userMeta, null, 2), 'utf8');

        for (const note of userNotes) {
            const folderSubPath = note.folder && note.folder !== 'root'
                ? note.folder.split('/').map(sanitizeFileName).join(path.sep)
                : '';
            const finalDir = folderSubPath ? path.join(userPath, folderSubPath) : userPath;

            if (!fs.existsSync(finalDir)) {
                fs.mkdirSync(finalDir, { recursive: true });
            }

            const fileBaseName = `${sanitizeFileName(note.title)}_${note.id}`;
            const jsonPath = path.join(finalDir, `${fileBaseName}.json`);

            fs.writeFileSync(jsonPath, JSON.stringify(note, null, 2), 'utf8');
            totalExportedFiles++;

            // Also create a readable markdown preview file for documentation
            const cells = Array.isArray(note.content?.cells)
                ? note.content.cells
                : (Array.isArray(note.cells) ? note.cells : []);

            let mdContent = `# ${note.title || 'Untitled Note'}\n\n`;
            mdContent += `*ID: \`${note.id}\` | Folder: \`${note.folder || 'root'}\` | Updated: ${new Date(note.updatedAt || Date.now()).toISOString()}*\n\n---\n\n`;

            cells.forEach((cell, idx) => {
                mdContent += `### Cell ${idx + 1} (${cell.type || 'code'}: ${cell.lang || 'javascript'})\n`;
                if (cell.type === 'markdown') {
                    mdContent += `${cell.content || ''}\n\n`;
                } else {
                    mdContent += `\`\`\`${cell.lang || 'javascript'}\n${cell.content || ''}\n\`\`\`\n\n`;
                }
                if (cell.output && cell.output.logs && cell.output.logs.length > 0) {
                    mdContent += `**Output:**\n\`\`\`\n${cell.output.logs.join('')}\n\`\`\`\n\n`;
                }
            });

            const mdPath = path.join(finalDir, `${fileBaseName}.md`);
            fs.writeFileSync(mdPath, mdContent, 'utf8');
        }
    }

    // Export consolidated dump for easy browser LocalStorage/Dexie import
    const consolidatedDump = {
        exportedAt: new Date().toISOString(),
        totalUsers: users.length,
        totalNotes: notes.length,
        users: users.map(u => ({
            id: String(u._id),
            username: u.username,
            email: u.email,
            role: u.role
        })),
        notes: notes.map(n => ({
            id: n.id,
            title: n.title,
            folder: n.folder || 'root',
            isStarred: !!n.isStarred,
            isTrashed: !!n.isTrashed,
            trashedAt: n.trashedAt,
            cells: Array.isArray(n.content?.cells) ? n.content.cells : (Array.isArray(n.cells) ? n.cells : []),
            tags: Array.isArray(n.content?.tags) ? n.content.tags : (Array.isArray(n.tags) ? n.tags : []),
            updatedAt: n.updatedAt,
            _version: n._version || 1,
            owner: n.owner ? String(n.owner) : null
        }))
    };

    const dumpPath = path.join(targetBackupDir, 'all_users_notes_dump.json');
    fs.writeFileSync(dumpPath, JSON.stringify(consolidatedDump, null, 2), 'utf8');

    console.log(`💾 Successfully exported to local storage: ${targetBackupDir}`);
    console.log(`   - Exported ${totalExportedFiles} note files across ${notesByUser.size} user account(s).`);
    console.log(`   - Generated consolidated database dump: ${dumpPath}\n`);
}

/**
 * PUSH: Read local storage directory and update/upsert notes back into MongoDB
 */
async function pushLocalNotesToDatabase() {
    console.log(`🚀 Scanning local storage directory for notes to push: ${targetBackupDir}...`);

    if (!fs.existsSync(targetBackupDir)) {
        throw new Error(`Local storage directory does not exist: ${targetBackupDir}`);
    }

    const dumpFile = path.join(targetBackupDir, 'all_users_notes_dump.json');
    let notesToPush = [];

    if (fs.existsSync(dumpFile)) {
        try {
            const raw = fs.readFileSync(dumpFile, 'utf8');
            const data = JSON.parse(raw);
            if (Array.isArray(data.notes)) {
                notesToPush = data.notes;
                console.log(`📄 Loaded ${notesToPush.length} notes from consolidated dump.`);
            }
        } catch (e) {
            console.warn('⚠️ Could not parse all_users_notes_dump.json, scanning file tree instead...');
        }
    }

    // If dump file not available, scan all *.json files recursively
    if (notesToPush.length === 0) {
        function scanDir(dir) {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    scanDir(fullPath);
                } else if (file.endsWith('.json') && !file.startsWith('_') && file !== 'all_users_notes_dump.json') {
                    try {
                        const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
                        if (content && content.id) {
                            notesToPush.push(content);
                        }
                    } catch (_) {}
                }
            }
        }
        scanDir(targetBackupDir);
        console.log(`📁 Scanned directory tree: found ${notesToPush.length} note files.`);
    }

    if (notesToPush.length === 0) {
        console.log('ℹ️ No notes found in local storage to push.');
        return;
    }

    let upsertedCount = 0;
    for (const note of notesToPush) {
        if (!note.id) continue;

        const cells = Array.isArray(note.cells)
            ? note.cells
            : (note.content && Array.isArray(note.content.cells) ? note.content.cells : []);

        const tags = Array.isArray(note.tags)
            ? note.tags
            : (note.content && Array.isArray(note.content.tags) ? note.content.tags : []);

        const updateDoc = {
            id: note.id,
            title: note.title || 'Untitled Notebook',
            folder: note.folder || 'root',
            isStarred: !!note.isStarred,
            isTrashed: !!note.isTrashed,
            trashedAt: note.trashedAt ? new Date(note.trashedAt) : null,
            _version: typeof note._version === 'number' ? note._version : 1,
            content: {
                id: note.id,
                title: note.title || 'Untitled Notebook',
                folder: note.folder || 'root',
                isStarred: !!note.isStarred,
                cells: cells,
                tags: tags
            },
            updatedAt: note.updatedAt ? new Date(note.updatedAt) : new Date()
        };

        if (note.owner && mongoose.Types.ObjectId.isValid(note.owner)) {
            updateDoc.owner = new mongoose.Types.ObjectId(note.owner);
        }

        await Note.findOneAndUpdate(
            { id: note.id },
            { $set: updateDoc },
            { upsert: true, new: true }
        );
        upsertedCount++;
    }

    console.log(`✅ Successfully pushed and upserted ${upsertedCount} note(s) into MongoDB Atlas/database.\n`);
}

/**
 * GIT: Commit and push local storage backup directory to git repository
 */
function pushToGit() {
    console.log(`🐙 Staging and pushing local storage to Git repository...`);
    try {
        const repoRoot = path.join(__dirname, '..');
        execSync(`git add local_storage_backup`, { cwd: repoRoot, stdio: 'inherit' });
        
        try {
            execSync(`git commit -m "chore: sync all users notes local storage backup [${new Date().toISOString()}]"`, {
                cwd: repoRoot,
                stdio: 'inherit'
            });
            console.log('✅ Git commit created.');
        } catch (commitErr) {
            console.log('ℹ️ No changes to commit in git.');
        }

        execSync(`git push`, { cwd: repoRoot, stdio: 'inherit' });
        console.log('🚀 Git push completed successfully!\n');
    } catch (err) {
        console.error('❌ Git push failed:', err.message);
    }
}

async function main() {
    try {
        await connectDB();

        if (isPushMode) {
            await pushLocalNotesToDatabase();
        } else {
            await pullAllUsersAndNotes();
        }

        if (isGitPush) {
            pushToGit();
        }

        console.log('🎉 All operations completed successfully.');
    } catch (err) {
        console.error('❌ Error executing sync script:', err);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB.');
    }
}

main();
