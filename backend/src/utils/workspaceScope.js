function workspaceAssetWhere(user) {
  const workspaceId = Number(user?.workspaceId);
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
    throw new Error('A validated workspaceId is required');
  }
  return { workspaceId };
}

function belongsToWorkspace(asset, user) {
  if (!asset?.workspaceId) return false;
  return Number(asset.workspaceId) === Number(user?.workspaceId);
}

module.exports = { workspaceAssetWhere, belongsToWorkspace };
