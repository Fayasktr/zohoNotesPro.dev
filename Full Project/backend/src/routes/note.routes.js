const express = require('express');
const router = express.Router();
const noteController = require('../controllers/note.controller');
const authenticate = require('../middlewares/auth.middleware');

router.use(authenticate);

// Notebook CRUD & Actions
router.get('/', (req, res, next) => noteController.listNotes(req, res, next));
router.get('/:id', (req, res, next) => noteController.getNote(req, res, next));
router.post('/', (req, res, next) => noteController.saveNote(req, res, next));
router.put('/:id/rename', (req, res, next) => noteController.renameNote(req, res, next));
router.put('/:id/star', (req, res, next) => noteController.toggleStar(req, res, next));
router.delete('/:id', (req, res, next) => noteController.trashNote(req, res, next));

// Move cell across notes
router.post('/move-cell', (req, res, next) => noteController.moveCell(req, res, next));

module.exports = router;
