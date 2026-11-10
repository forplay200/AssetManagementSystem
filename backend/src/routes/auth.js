const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const auth = require("../middleware/auth");
const { validate } = require("../middleware/validate");

const registerSchema = {
  body: {
    username: { type: "string", required: true, minLength: 2, maxLength: 60 },
    email: { type: "string", required: true, email: true, maxLength: 254 },
    password: { type: "string", required: true, minLength: 10, maxLength: 72 }
  }
}

const forgotPasswordSchema = {
  body: {
    email: { type: "string", required: true, email: true, maxLength: 254 }
  }
}

const resetPasswordSchema = {
  body: {
    token: { type: "string", required: true, minLength: 32 },
    password: { type: "string", required: true, minLength: 10, maxLength: 72 }
  }
}

const loginSchema = {
  body: {
    email: { type: "string", required: true, email: true, maxLength: 254 },
    password: { type: "string", required: true }
  }
}

const rateLimit = require('express-rate-limit');
const accountLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many account attempts. Please try again later.' } });
const registrationLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many registrations from this connection. Please try later.' } });
router.get('/registration-policy', (_req, res) => res.json({ mode: process.env.REGISTRATION_MODE || 'open', recoveryAvailable: false }));
router.use(accountLimiter);
// Public routes
router.post('/register', registrationLimiter, validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);

// Protected route (example)
router.post('/logout', auth, authController.logout);

module.exports = router;
