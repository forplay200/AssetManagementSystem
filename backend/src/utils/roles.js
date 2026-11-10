const ACCOUNT_ROLES = Object.freeze({
  USER: 'user',
  SYSTEM_ADMINISTRATOR: 'systemAdministrator'
});

const WORKSPACE_ROLES = Object.freeze({
  OWNER: 'workspaceOwner',
  MANAGER: 'workspaceManager',
  COLLABORATOR: 'collaborator'
});

module.exports = { ACCOUNT_ROLES, WORKSPACE_ROLES };
