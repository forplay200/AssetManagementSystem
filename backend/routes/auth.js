const express = require('express');
const router = express.Router();
const authController = require('../src/controllers/authController');
const auth = require('../src/middleware/auth');

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected route (example)
router.post('/logout', auth, authController.logout);

module.exports = router;

