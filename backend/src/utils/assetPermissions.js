const { ACCOUNT_ROLES, WORKSPACE_ROLES } = require('./roles');

function positiveId(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function canManageAsset(user, asset) {
  if (!positiveId(user?.id) || user?.isActive === false
      || user?.role === ACCOUNT_ROLES.SYSTEM_ADMINISTRATOR
      || user?.accountRole === ACCOUNT_ROLES.SYSTEM_ADMINISTRATOR) return false;
  const workspaceId = positiveId(user?.workspaceId);
  if (!workspaceId || workspaceId !== positiveId(asset?.workspaceId)) return false;
  if (user.teamRole === WORKSPACE_ROLES.OWNER) return true;
  return user.teamRole === WORKSPACE_ROLES.MANAGER
    && positiveId(asset?.userId) === positiveId(user.id);
}

function canDeleteAsset(user, asset) {
  return canManageAsset(user, asset);
}

const ASSET_WRITE_DENIED = 'Forbidden: Only the uploader or a workspace owner can modify this asset.';
module.exports = { positiveId, canManageAsset, canDeleteAsset, ASSET_WRITE_DENIED };
