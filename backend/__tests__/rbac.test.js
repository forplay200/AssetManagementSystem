const test = require('node:test');
const assert = require('node:assert/strict');
const { authorize, authorizePermission, authorizeAccountPermission, denySystemAdministrator } = require('../src/middleware/rbac');

function check(role, allowedRoles) {
  let status;
  let nextCalled = false;
  const res = { status(code) { status = code; return this; }, json() { return this; } };
  authorize(...allowedRoles)({ user: role ? { role } : null }, res, () => { nextCalled = true; });
  return { status, nextCalled };
}

function checkPermission(role, permission, teamRole) {
  let status;
  let nextCalled = false;
  const res = { status(code) { status = code; return this; }, json() { return this; } };
  authorizePermission(permission)({ user: { role, teamRole } }, res, () => { nextCalled = true; });
  return { status, nextCalled };
}

function checkAccountPermission(role, permission, teamRole) {
  let status;
  let nextCalled = false;
  const res = { status(code) { status = code; return this; }, json() { return this; } };
  authorizeAccountPermission(permission)({ user: { role, teamRole } }, res, () => { nextCalled = true; });
  return { status, nextCalled };
}

test('accepts only the canonical System Administrator account role', () => {
  assert.equal(check('systemAdministrator', ['systemAdministrator']).nextCalled, true);
  assert.equal(check('admin', ['systemAdministrator']).status, 403);
});

test('blocks collaborators from management routes', () => {
  assert.equal(check('collaborator', ['workspaceOwner', 'workspaceManager']).status, 403);
});

test('allows collaborators through view routes', () => {
  assert.equal(check('collaborator', ['workspaceOwner', 'workspaceManager', 'collaborator']).nextCalled, true);
});

test('uses the active workspace role instead of the account role', () => {
  assert.equal(checkPermission('user', 'uploadAsset', 'workspaceManager').nextCalled, true);
  assert.equal(checkPermission('user', 'deleteAsset', 'collaborator').status, 403);
});

test('enforces workspaceOwner, workspaceManager, collaborator, and unassigned user permissions', () => {
  assert.equal(checkPermission('user', 'manageTeam', 'workspaceOwner').nextCalled, true);
  assert.equal(checkPermission('user', 'manageMetadata', 'workspaceManager').nextCalled, true);
  assert.equal(checkPermission('user', 'deleteAsset', 'workspaceManager').nextCalled, true);
  assert.equal(checkPermission('user', 'downloadAsset', 'collaborator').nextCalled, true);
  assert.equal(checkPermission('user', 'viewAsset').status, 403);
  assert.equal(checkPermission('user', 'manageUsers', 'workspaceOwner').status, 403);
  assert.equal(checkAccountPermission('systemAdministrator', 'manageUsers', 'collaborator').nextCalled, true);
  assert.equal(checkAccountPermission('user', 'manageUsers', 'workspaceOwner').status, 403);
});

test('isolates System Administrator from every workspace role', () => {
  assert.equal(checkAccountPermission('systemAdministrator', 'manageUsers').nextCalled, true);
  assert.equal(checkPermission('systemAdministrator', 'viewAsset').status, 403);
  for (const role of ['workspaceOwner', 'workspaceManager', 'collaborator', 'user', 'admin']) {
    assert.equal(checkAccountPermission(role, 'manageUsers').status, 403);
  }

  let status;
  denySystemAdministrator({ user: { role: 'systemAdministrator' } }, { status(code) { status = code; return this; }, json() {} }, () => {});
  assert.equal(status, 403);
});
