const express = require('express');
const hbs = require('hbs');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const mongoose = require('mongoose');
const engine = require('./engine/AntigravityEngine');

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/zoho')
    .then(() => console.log('Connected to MongoDB: zoho'))
    .catch(err => console.error('MongoDB connection error:', err));

// Note Schema
const noteSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    title: { type: String, default: 'Untitled' },
    content: { type: mongoose.Schema.Types.Mixed, default: {} },
    folder: { type: String, default: 'root' },
    updatedAt: { type: Date, default: Date.now }
}, { collection: 'notes' });

const Note = mongoose.model('Note', noteSchema);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => {
    console.log('Serving index.hbs');
    res.render('index', { title: 'Zoho Notes' });
});

app.post('/api/execute', async (req, res) => {
    const { code } = req.body;
    try {
        const result = await engine.execute(code);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: List Notebooks (from MongoDB)
app.get('/api/notebooks', async (req, res) => {
    try {
        const notes = await Note.find({}, 'id title folder');
        res.json(notes);
    } catch (err) {
        res.status(500).json({ error: 'Failed to list notebooks', details: err.message });
    }
});

// API: Get Notebook (from MongoDB)
app.get(/^\/api\/notebooks\/(.+)$/, async (req, res) => {
    const notebookId = req.params[0];
    try {
        const note = await Note.findOne({ id: notebookId });
        if (!note) return res.status(404).json({ error: 'Notebook not found' });
        res.json(note.content || note);
    } catch (err) {
        res.status(500).json({ error: 'Failed to read notebook', details: err.message });
    }
});

// API: Save Notebook (to MongoDB)
app.post('/api/notebooks', async (req, res) => {
    const notebookData = req.body;
    if (!notebookData.id) return res.status(400).json({ error: 'No notebook ID provided' });

    try {
        const updateData = {
            id: notebookData.id,
            title: notebookData.title || 'Untitled',
            content: notebookData,
            folder: notebookData.folder || 'root',
            updatedAt: new Date()
        };

        await Note.findOneAndUpdate(
            { id: notebookData.id },
            updateData,
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save notebook', details: err.message });
    }
});

// API: Delete Notebook (from MongoDB)
app.delete(/^\/api\/notebooks\/(.+)$/, async (req, res) => {
    const notebookId = req.params[0];
    try {
        const result = await Note.deleteOne({ id: notebookId });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Notebook not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete notebook', details: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server on http://localhost:${PORT}`);
});
