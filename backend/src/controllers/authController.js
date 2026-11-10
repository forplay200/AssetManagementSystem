const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const emailWhere = email => ({ email: { [Op.iLike]: email.replace(/[\\%_]/g, '\\$&') } });
const db = require('../models');
const logger = require('../utils/logger');
const { ACCOUNT_ROLES } = require('../utils/roles');

const policy = require('../services/trialPolicy');
const JWT_SECRET = policy.jwtSecret();
const JWT_EXPIRES_IN = '1h';

async function preferredMembership(userId) {
  if (!db.TeamMember || !db.Team) return null;
  return db.TeamMember.findOne({
    where: { userId },
    include: [{ model: db.Team, as: 'team', attributes: ['id', 'name'] }],
    order: [['createdAt', 'ASC']]
  });
}

async function authResponse(user) {
  const membership = await preferredMembership(user.id);
  const team = membership?.team ? { id: membership.team.id, name: membership.team.name } : null;
  const teamRole = membership?.role || null;
  const token = jwt.sign({
    id: user.id,
    tokenVersion: user.tokenVersion || 0,
    email: user.email,
    role: user.role,
    ...(team ? { teamId: team.id, workspaceId: team.id } : {})
  }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      accountRole: user.role,
      role: teamRole || user.role,
      isActive: user.isActive !== false,
      teamRole,
      team
    }
  };
}

// Register a new user
exports.register = async (req, res) => {
  try {
    const { username, password } = req.body;
    const email = req.body.email.trim().toLowerCase();
    policy.registration(req.body.inviteCode);
    if (Buffer.byteLength(password) > 72) throw policy.fail('Password must be at most 72 UTF-8 bytes.', 400);
    // Check if user already exists
    let user = await db.User.findOne({ where: emailWhere(email) });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    // Create user
    user = await db.sequelize.transaction(async transaction => {
      await policy.admitAccount(db, transaction);
      return db.User.create({
      username,
      email,
      passwordHash,
      role: ACCOUNT_ROLES.USER,
      isActive: true
    }, { transaction });
    });
    res.status(201).json(await authResponse(user));
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ message: 'An account with that username or email already exists.' });
    logger.error(error);
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Server error' });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { password } = req.body;
    const email = req.body.email.trim().toLowerCase();
    const user = await db.User.findOne({ where: emailWhere(email) });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    if (user.isActive === false) {
      return res.status(403).json({ message: 'Account is inactive.' });
    }
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    res.json(await authResponse(user));
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Logout (client-side)
exports.logout = (req, res) => {
  res.json({ message: 'Logged out' });
};

// Recovery remains unavailable until a verified email delivery service is configured.
// Never return a reset credential to a caller who only knows an email address.
exports.forgotPassword = async (_req, res) => {
  res.status(503).json({ message: 'Password recovery is not available during this trial. Use a password you can retain.' });
};

// Reset password: validate token and set new password
exports.resetPassword = async (_req, res) => {
  return res.status(503).json({ message: 'Password recovery is not available during this trial.' });
};
