const test = require('node:test');
const assert = require('node:assert/strict');
const { authorize, authorizePermission, authorizeAccountPermission } = require('../src/middleware/rbac');

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

test('allows administrators through management routes', () => {
  assert.equal(check('admin', ['admin', 'developer', 'designer']).nextCalled, true);
});

test('blocks collaborators from management routes', () => {
  assert.equal(check('collaborator', ['admin', 'developer', 'designer']).status, 403);
});

test('allows collaborators through view routes', () => {
  assert.equal(check('collaborator', ['admin', 'developer', 'designer', 'collaborator']).nextCalled, true);
});

test('uses the active team role instead of the legacy account role', () => {
  assert.equal(checkPermission('user', 'uploadAsset', 'manager').nextCalled, true);
  assert.equal(checkPermission('admin', 'deleteAsset', 'collaborator').status, 403);
});

test('enforces owner, manager, collaborator, and unassigned user permissions', () => {
  assert.equal(checkPermission('user', 'manageTeam', 'owner').nextCalled, true);
  assert.equal(checkPermission('user', 'manageMetadata', 'manager').nextCalled, true);
  assert.equal(checkPermission('user', 'deleteAsset', 'manager').status, 403);
  assert.equal(checkPermission('user', 'downloadAsset', 'collaborator').nextCalled, true);
  assert.equal(checkPermission('user', 'viewAsset').status, 403);
  assert.equal(checkPermission('user', 'manageUsers', 'owner').status, 403);
  assert.equal(checkAccountPermission('admin', 'manageUsers', 'collaborator').nextCalled, true);
  assert.equal(checkAccountPermission('user', 'manageUsers', 'owner').status, 403);
});
