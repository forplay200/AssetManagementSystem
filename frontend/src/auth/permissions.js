const rolePermissions = {
  owner: ['viewAsset', 'downloadAsset', 'uploadAsset', 'manageMetadata', 'moderateAi', 'deleteAsset', 'createVersion', 'comment', 'manageTeam'],
  manager: ['viewAsset', 'downloadAsset', 'uploadAsset', 'manageMetadata', 'moderateAi', 'createVersion', 'comment'],
  collaborator: ['viewAsset', 'downloadAsset', 'comment'],
  user: [],
  systemAdministrator: ['manageUsers'],
  // Legacy `admin` remains a compatibility alias for System Administrator.
  admin: ['manageUsers'],
  developer: ['viewAsset', 'downloadAsset', 'uploadAsset', 'manageMetadata', 'moderateAi', 'deleteAsset', 'createVersion', 'comment'],
  designer: ['viewAsset', 'downloadAsset', 'uploadAsset', 'manageMetadata', 'moderateAi', 'deleteAsset', 'createVersion', 'comment'],
};

export function hasPermission(role, permission) {
  return Boolean(rolePermissions[role]?.includes(permission));
}
