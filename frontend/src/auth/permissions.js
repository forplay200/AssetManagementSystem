const rolePermissions = {
  admin: ['uploadAsset', 'manageMetadata', 'moderateAi', 'deleteAsset', 'createVersion', 'comment', 'manageUsers'],
  developer: ['uploadAsset', 'manageMetadata', 'moderateAi', 'deleteAsset', 'createVersion', 'comment'],
  designer: ['uploadAsset', 'manageMetadata', 'moderateAi', 'deleteAsset', 'createVersion', 'comment'],
  collaborator: ['comment'],
};

export function hasPermission(role, permission) {
  return Boolean(rolePermissions[role]?.includes(permission));
}
