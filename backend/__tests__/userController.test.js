const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');

let listOptions;
let detailOptions;
let userRecord;
let saveCount = 0;

const models = {
  User: {
    async findAll(options) { listOptions = options; return []; },
    async findByPk(_id, options) { if (options) detailOptions = options; return userRecord; }
  },
  TeamMember: {},
  Team: {}
};

function mockModule(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

mockModule('../src/models', models);
mockModule('../src/utils/logger', { error() {} });
const controller = require('../src/controllers/userController');

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; } };
}

function makeUser(overrides = {}) {
  return {
    id: 8,
    username: 'alex',
    email: 'alex@example.com',
    role: 'user',
    isActive: true,
    resetToken: 'hash',
    resetTokenExpiry: new Date(),
    async save() { saveCount += 1; },
    toJSON() { return { id: this.id, username: this.username, email: this.email, role: this.role, isActive: this.isActive, resetToken: this.resetToken, resetTokenExpiry: this.resetTokenExpiry }; },
    ...overrides
  };
}

test.beforeEach(() => {
  listOptions = null;
  detailOptions = null;
  saveCount = 0;
  userRecord = makeUser();
});

test('system-user search supports text, status, and canonical role filters', async () => {
  const res = response();
  await controller.getAllUsers({ query: { q: 'alex', status: 'inactive', role: 'systemAdministrator' } }, res);
  assert.equal(listOptions.where.isActive, false);
  assert.ok(listOptions.where[Op.or]);
  assert.deepEqual(listOptions.where.role[Op.in], ['systemAdministrator', 'admin']);
  assert.deepEqual(res.payload, []);
});

test('user details include read-only workspace role assignments', async () => {
  const res = response();
  await controller.getUserById({ params: { id: '8' } }, res);
  assert.equal(detailOptions.include[0].as, 'teamMemberships');
  assert.equal(detailOptions.include[0].include[0].as, 'team');
  assert.equal(res.payload, userRecord);
});

test('System Administrator can deactivate and reactivate another account without deletion', async () => {
  const deactivate = response();
  await controller.updateAccountStatus({ params: { id: '8' }, body: { status: 'inactive' }, user: { id: 1, role: 'systemAdministrator' } }, deactivate);
  assert.equal(deactivate.statusCode, 200);
  assert.equal(userRecord.isActive, false);
  assert.equal(userRecord.resetToken, null);
  assert.equal(saveCount, 1);

  const activate = response();
  await controller.updateAccountStatus({ params: { id: '8' }, body: { status: 'active' }, user: { id: 1, role: 'systemAdministrator' } }, activate);
  assert.equal(activate.statusCode, 200);
  assert.equal(userRecord.isActive, true);
  assert.equal(saveCount, 2);
});

test('System Administrator cannot deactivate their own account', async () => {
  const res = response();
  await controller.updateAccountStatus({ params: { id: '8' }, body: { status: 'inactive' }, user: { id: 8, role: 'systemAdministrator' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(saveCount, 0);
});
