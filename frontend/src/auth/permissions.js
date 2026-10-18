import { ACCOUNT_ROLES, WORKSPACE_ROLES } from './roles';

const rolePermissions = {
  [WORKSPACE_ROLES.OWNER]: ['viewAsset', 'downloadAsset', 'uploadAsset', 'manageMetadata', 'moderateAi', 'deleteAsset', 'createVersion', 'comment', 'manageTeam'],
  [WORKSPACE_ROLES.MANAGER]: ['viewAsset', 'downloadAsset', 'uploadAsset', 'manageMetadata', 'moderateAi', 'deleteAsset', 'createVersion', 'comment'],
  [WORKSPACE_ROLES.COLLABORATOR]: ['viewAsset', 'downloadAsset', 'comment'],
  [ACCOUNT_ROLES.USER]: [],
  [ACCOUNT_ROLES.SYSTEM_ADMINISTRATOR]: ['manageUsers'],
};

export function hasPermission(role, permission) {
  return Boolean(rolePermissions[role]?.includes(permission));
}
