const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../models');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';
const JWT_EXPIRES_IN = '1h';

// Register a new user
exports.register = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    // Check if user already exists
    let user = await db.User.findOne({ where: { email } });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    // Create user
    user = await db.User.create({
      username,
      email,
      passwordHash,
      role: role || 'collaborator'
    });
    // Generate JWT
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.status(201).json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await db.User.findOne({ where: { email } });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Logout (client-side)
exports.logout = (req, res) => {
  res.json({ message: 'Logged out' });
};

// Forgot password: generate reset token and return it (in real app, send via email)
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await db.User.findOne({ where: { email } });
    if (!user) {
      // To prevent email enumeration, we return a success message even if the email is not found
      return res.json({ message: 'If the email exists, a reset token has been generated.' });
    }
    const resetToken = user.generateResetToken();
    await user.save();
    // In a real app, send the token via email
    // For now, we return it in the response (for testing purposes)
    res.json({ message: 'Reset token generated', resetToken });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Reset password: validate token and set new password
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    const user = await db.User.findOne({ where: { resetToken: token, resetTokenExpiry: { [db.Sequelize.Op.gt]: Date.now() } } });
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    // Update user
    user.passwordHash = passwordHash;
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();
    res.json({ message: 'Password has been reset' });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
