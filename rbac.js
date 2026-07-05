const roles = {
  admin: ['admin', 'developer', 'designer', 'collaborator'],
  developer: ['developer', 'designer', 'collaborator'],
  designer: ['designer', 'collaborator'],
  collaborator: ['collaborator']
};

function authorize(...allowedRoles) {
  return (req, res, next) => {
    const userRole = req.user?.role;
    if (!userRole) {
      return res.status(401).json({ message: 'Unauthorized: No user' });
    }
    const allowed = roles[userRole]?.some(role => allowedRoles.includes(role)) ?? false;
    if (!allowed) {
      return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
    }
    next();
  };
}

module.exports = { authorize };

