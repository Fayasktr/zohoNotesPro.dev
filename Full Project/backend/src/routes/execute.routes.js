const express = require('express');
const router = express.Router();
const executeController = require('../controllers/execute.controller');
const authenticate = require('../middlewares/auth.middleware');
const { executionLimiter } = require('../middlewares/rateLimit.middleware');

router.use(authenticate);

router.post('/', executionLimiter, (req, res, next) => executeController.executeCode(req, res, next));
router.get('/languages', (req, res) => executeController.getSupportedLanguages(req, res));

module.exports = router;
