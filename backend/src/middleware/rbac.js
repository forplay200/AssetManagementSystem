const roleInheritance = {
  admin: ['admin', 'developer', 'designer', 'collaborator'],
  developer: ['developer', 'designer', 'collaborator'],
  designer: ['designer', 'collaborator'],
  owner: ['owner', 'manager', 'collaborator', 'admin', 'developer', 'designer'],
  manager: ['manager', 'collaborator', 'developer', 'designer'],
  collaborator: ['collaborator'],
  user: ['user']
};

const rolePermissions = {
  owner: ['viewAsset', 'downloadAsset', 'uploadAsset', 'manageMetadata', 'manageVersions', 'deleteAsset', 'comment', 'approveAsset', 'manageTeam', 'manageProjects'],
  manager: ['viewAsset', 'downloadAsset', 'uploadAsset', 'manageMetadata', 'manageVersions', 'comment', 'approveAsset'],
  collaborator: ['viewAsset', 'downloadAsset', 'comment'],
  user: [],
  // Legacy account roles remain active during workspace migration.
  admin: ['viewAsset', 'downloadAsset', 'uploadAsset', 'manageMetadata', 'manageVersions', 'deleteAsset', 'comment', 'approveAsset', 'manageTeam', 'manageProjects', 'manageUsers'],
  developer: ['viewAsset', 'downloadAsset', 'uploadAsset', 'manageMetadata', 'manageVersions', 'deleteAsset', 'comment', 'approveAsset'],
  designer: ['viewAsset', 'downloadAsset', 'uploadAsset', 'manageMetadata', 'manageVersions', 'deleteAsset', 'comment', 'approveAsset']
};

function effectiveRole(req) {
  return req.user?.teamRole || req.user?.role;
}

function authorize(...allowedRoles) {
  return (req, res, next) => {
    const userRole = effectiveRole(req);
    if (!userRole) return res.status(401).json({ message: 'Unauthorized: No user' });
    const allowed = roleInheritance[userRole]?.some(role => allowedRoles.includes(role)) ?? false;
    if (!allowed) return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
    next();
  };
}

function authorizePermission(permission) {
  return (req, res, next) => {
    const userRole = effectiveRole(req);
    if (!userRole) return res.status(401).json({ message: 'Unauthorized: No user' });
    if (!rolePermissions[userRole]?.includes(permission)) {
      return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
    }
    next();
  };
}

function authorizeAccountPermission(permission) {
  return (req, res, next) => {
    const accountRole = req.user?.role;
    if (!accountRole) return res.status(401).json({ message: 'Unauthorized: No user' });
    if (!rolePermissions[accountRole]?.includes(permission)) {
      return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
    }
    next();
  };
}

module.exports = { authorize, authorizePermission, authorizeAccountPermission, effectiveRole, rolePermissions };
