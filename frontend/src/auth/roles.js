export const ACCOUNT_ROLES = Object.freeze({
  USER: 'user',
  SYSTEM_ADMINISTRATOR: 'systemAdministrator',
});

export const WORKSPACE_ROLES = Object.freeze({
  OWNER: 'workspaceOwner',
  MANAGER: 'workspaceManager',
  COLLABORATOR: 'collaborator',
});

export function isSystemAdministrator(value) {
  const role = typeof value === 'string' ? value : value?.accountRole || value?.role;
  return role === ACCOUNT_ROLES.SYSTEM_ADMINISTRATOR;
}

export function accountRoleLabel(role) {
  if (role === ACCOUNT_ROLES.SYSTEM_ADMINISTRATOR) return 'System Administrator';
  if (role === ACCOUNT_ROLES.USER) return 'User';
  return role || 'Unknown role';
}

export function workspaceRoleLabel(role) {
  if (role === WORKSPACE_ROLES.OWNER) return 'Workspace Owner';
  if (role === WORKSPACE_ROLES.MANAGER) return 'Workspace Manager';
  if (role === WORKSPACE_ROLES.COLLABORATOR) return 'Collaborator';
  return role || 'Unknown role';
}
