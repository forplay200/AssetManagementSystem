const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const auth = require("../middleware/auth");
const { validate } = require("../middleware/validate");

const registerSchema = {
  body: {
    username: { type: "string", required: true, minLength: 2 },
    email: { type: "string", required: true, email: true },
    password: { type: "string", required: true, minLength: 6 }
  }
}

const forgotPasswordSchema = {
  body: {
    email: { type: "string", required: true, email: true }
  }
}

const resetPasswordSchema = {
  body: {
    token: { type: "string", required: true, minLength: 32 },
    password: { type: "string", required: true, minLength: 6 }
  }
}

const loginSchema = {
  body: {
    email: { type: "string", required: true, email: true },
    password: { type: "string", required: true }
  }
}

// Public routes
router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);

// Protected route (example)
router.post('/logout', auth, authController.logout);

module.exports = router;
