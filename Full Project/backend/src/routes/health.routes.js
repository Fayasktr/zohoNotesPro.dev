const express = require('express');
const router = express.Router();
const healthController = require('../controllers/health.controller');
const noteController = require('../controllers/note.controller');
const authController = require('../controllers/auth.controller');
const authenticate = require('../middlewares/auth.middleware');

// Public Diagnostics
router.get('/ping', (req, res) => healthController.ping(req, res));
router.get('/health', (req, res) => healthController.health(req, res));

// User Feedback
router.post('/feedback', authenticate, (req, res, next) => healthController.submitFeedback(req, res, next));

// User Settings (Alias for backward compatibility)
router.post('/user/settings', authenticate, (req, res, next) => authController.updateSettings(req, res, next));

// Global Trash Endpoints & Legacy Aliases
router.get('/trash', authenticate, (req, res, next) => noteController.getTrash(req, res, next));
router.post('/trash/restore/:id', authenticate, (req, res, next) => noteController.restoreNote(req, res, next));
router.delete('/trash/empty-all', authenticate, (req, res, next) => noteController.emptyTrash(req, res, next));
router.delete('/trash-all', authenticate, (req, res, next) => noteController.emptyTrash(req, res, next)); // Legacy alias
router.delete('/trash/:id', authenticate, (req, res, next) => noteController.deletePermanently(req, res, next));

module.exports = router;
