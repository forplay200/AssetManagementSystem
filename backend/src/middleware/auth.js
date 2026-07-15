const jwt = require('jsonwebtoken');
const db = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

module.exports = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    const requestedWorkspaceId = Number(
      req.header('X-Workspace-Id') || req.header('X-Team-Id') || decoded.workspaceId || decoded.teamId
    );
    if (Number.isInteger(requestedWorkspaceId) && requestedWorkspaceId > 0 && db.TeamMember) {
      const membership = await db.TeamMember.findOne({
        where: { teamId: requestedWorkspaceId, userId: decoded.id },
        attributes: ['teamId', 'role']
      });
      if (membership) {
        req.user.teamId = membership.teamId;
        req.user.workspaceId = membership.teamId;
        req.user.teamRole = membership.role;
      } else {
        delete req.user.teamId;
        delete req.user.workspaceId;
        delete req.user.teamRole;
      }
    }
    next();
  } catch (ex) {
    res.status(400).json({ message: 'Invalid token.' });
  }
};

