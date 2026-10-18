const { ACCOUNT_ROLES, WORKSPACE_ROLES } = require('../utils/roles');

const roleInheritance = {
  [ACCOUNT_ROLES.SYSTEM_ADMINISTRATOR]: [ACCOUNT_ROLES.SYSTEM_ADMINISTRATOR],
  [ACCOUNT_ROLES.USER]: [ACCOUNT_ROLES.USER],
  [WORKSPACE_ROLES.OWNER]: [WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.MANAGER, WORKSPACE_ROLES.COLLABORATOR],
  [WORKSPACE_ROLES.MANAGER]: [WORKSPACE_ROLES.MANAGER, WORKSPACE_ROLES.COLLABORATOR],
  [WORKSPACE_ROLES.COLLABORATOR]: [WORKSPACE_ROLES.COLLABORATOR]
};

const rolePermissions = {
  [WORKSPACE_ROLES.OWNER]: ['viewAsset', 'downloadAsset', 'uploadAsset', 'manageMetadata', 'manageVersions', 'deleteAsset', 'comment', 'approveAsset', 'manageTeam', 'manageProjects'],
  [WORKSPACE_ROLES.MANAGER]: ['viewAsset', 'downloadAsset', 'uploadAsset', 'manageMetadata', 'manageVersions', 'deleteAsset', 'comment', 'approveAsset'],
  [WORKSPACE_ROLES.COLLABORATOR]: ['viewAsset', 'downloadAsset', 'comment'],
  [ACCOUNT_ROLES.USER]: [],
  [ACCOUNT_ROLES.SYSTEM_ADMINISTRATOR]: ['manageUsers']
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

function denySystemAdministrator(req, res, next) {
  if (req.user?.role === ACCOUNT_ROLES.SYSTEM_ADMINISTRATOR) {
    return res.status(403).json({ message: 'Forbidden: System Administrators cannot access workspace operations' });
  }
  next();
}

module.exports = { authorize, authorizePermission, authorizeAccountPermission, denySystemAdministrator, effectiveRole, rolePermissions };
