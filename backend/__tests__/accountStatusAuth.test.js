const test = require('node:test');
const assert = require('node:assert/strict');

let account;

function mockModule(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

mockModule('jsonwebtoken', { verify: () => ({ id: 8, role: 'user' }) });
mockModule('../src/models', {
  User: { async findByPk() { return account; } },
  TeamMember: { async findOne() { return null; } }
});

const auth = require('../src/middleware/auth');

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; } };
}

test('inactive accounts are blocked even when an existing JWT is valid', async () => {
  account = { id: 8, role: 'user', isActive: false };
  const res = response();
  let nextCalled = false;
  await auth({ header: (name) => name === 'Authorization' ? 'Bearer valid.jwt' : undefined }, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.message, 'Account is inactive.');
  assert.equal(nextCalled, false);
});

test('active accounts continue with the current database role', async () => {
  account = { id: 8, role: 'systemAdministrator', isActive: true };
  const req = { header: (name) => name === 'Authorization' ? 'Bearer valid.jwt' : undefined };
  const res = response();
  let nextCalled = false;
  await auth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.user.role, 'systemAdministrator');
});
