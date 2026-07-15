const rolePermissions = {
  owner: ['viewAsset', 'downloadAsset', 'uploadAsset', 'manageMetadata', 'moderateAi', 'deleteAsset', 'createVersion', 'comment', 'manageTeam'],
  manager: ['viewAsset', 'downloadAsset', 'uploadAsset', 'manageMetadata', 'moderateAi', 'createVersion', 'comment'],
  collaborator: ['viewAsset', 'downloadAsset', 'comment'],
  user: [],
  // Legacy roles remain available while existing accounts move into teams.
  admin: ['viewAsset', 'downloadAsset', 'uploadAsset', 'manageMetadata', 'moderateAi', 'deleteAsset', 'createVersion', 'comment', 'manageUsers'],
  developer: ['viewAsset', 'downloadAsset', 'uploadAsset', 'manageMetadata', 'moderateAi', 'deleteAsset', 'createVersion', 'comment'],
  designer: ['viewAsset', 'downloadAsset', 'uploadAsset', 'manageMetadata', 'moderateAi', 'deleteAsset', 'createVersion', 'comment'],
};

export function hasPermission(role, permission) {
  return Boolean(rolePermissions[role]?.includes(permission));
}
