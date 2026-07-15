module.exports = function requireWorkspace(req, res, next) {
  if (!req.user?.workspaceId || !req.user?.teamRole) {
    return res.status(403).json({ message: 'Forbidden: An active workspace membership is required' });
  }
  next();
};
