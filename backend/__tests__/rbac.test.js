const test = require('node:test');
const assert = require('node:assert/strict');
const { authorize } = require('../src/middleware/rbac');

function check(role, allowedRoles) {
  let status;
  let nextCalled = false;
  const res = { status(code) { status = code; return this; }, json() { return this; } };
  authorize(...allowedRoles)({ user: role ? { role } : null }, res, () => { nextCalled = true; });
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
