const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// Middleware: Check if Admin
const isAdmin = (req, res, next) => {
    if (req.session.userId && req.session.role === 'admin') {
        return next();
    }
    res.status(403).redirect('/login');
};

router.use(isAdmin);

router.get('/dashboard', adminController.getDashboard);
router.get('/users', adminController.getUsers);
router.post('/users', adminController.createUser);
router.put('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);
router.post('/users/:id/toggle-block', adminController.toggleBlock);
router.get('/users/:id/notes', adminController.getUserNotes);
router.put('/notes/:noteId', adminController.updateUserNote);

module.exports = router;
