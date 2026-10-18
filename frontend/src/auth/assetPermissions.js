import { ACCOUNT_ROLES, WORKSPACE_ROLES, isSystemAdministrator } from './roles';
import { hasPermission } from './permissions';

function positiveId(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function matchingWorkspace(user, asset) {
  if (!positiveId(user?.id) || user?.isActive === false || isSystemAdministrator(user)
      || user?.role === ACCOUNT_ROLES.SYSTEM_ADMINISTRATOR) return false;
  const workspaceId = positiveId(user?.team?.id);
  return Boolean(workspaceId && workspaceId === positiveId(asset?.workspaceId));
}

export function canManageAsset(user, asset) {
  if (!matchingWorkspace(user, asset)) return false;
  if (user.teamRole === WORKSPACE_ROLES.OWNER) return true;
  return user.teamRole === WORKSPACE_ROLES.MANAGER
    && positiveId(asset?.userId) === positiveId(user.id);
}

export function canDeleteAsset(user, asset) {
  return canManageAsset(user, asset) && hasPermission(user?.teamRole, 'deleteAsset');
}

export function canManageWorkspaceVocabulary(user, asset) {
  return matchingWorkspace(user, asset)
    && [WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.MANAGER].includes(user.teamRole);
}
