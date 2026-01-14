const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');

// Middleware to ensure user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session.userId || req.isAuthenticated()) return next();
    res.redirect('/login');
};

router.get('/game', isAuthenticated, gameController.renderGameDashboard);
router.get('/game/map/:topic/:difficulty', isAuthenticated, gameController.renderGameMap);
router.get('/game/play/:questId', isAuthenticated, gameController.renderPlayPage);
router.post('/api/game/verify', isAuthenticated, gameController.verifySolution);
router.post('/api/game/skip', isAuthenticated, gameController.skipQuest);
router.post('/api/game/hint', isAuthenticated, gameController.askProfessor);

module.exports = router;
