const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const authenticate = require('../middlewares/auth.middleware');
const { requireAdmin } = require('../middlewares/role.middleware');

router.use(authenticate, requireAdmin);

router.get('/dashboard', (req, res, next) => adminController.getDashboard(req, res, next));
router.get('/users', (req, res, next) => adminController.getUsers(req, res, next));
router.post('/users/:id/toggle-block', (req, res, next) => adminController.toggleBlock(req, res, next));
router.delete('/users/:id', (req, res, next) => adminController.deleteUser(req, res, next));
router.get('/system-logs', (req, res, next) => adminController.getLogs(req, res, next));
router.post('/system-logs/clear', (req, res, next) => adminController.clearLogs(req, res, next));
router.get('/feedback', (req, res, next) => adminController.getFeedback(req, res, next));
router.put('/feedback/:id/read', (req, res, next) => adminController.markFeedbackRead(req, res, next));
router.post('/toggle-config', (req, res, next) => adminController.toggleConfig(req, res, next));

module.exports = router;
