const test = require('node:test');
const assert = require('node:assert/strict');
const { positiveId, canManageAsset, canDeleteAsset } = require('../src/utils/assetPermissions');

const asset = { workspaceId: 8, userId: 2 };
const manager = { id: 2, role: 'user', workspaceId: 8, teamRole: 'workspaceManager' };
test('manager can manage and delete only their original uploads; owner manages any workspace asset', () => {
  for (const check of [canManageAsset, canDeleteAsset]) {
    assert.equal(check(manager, asset), true);
    assert.equal(check({ ...manager, id: '2', workspaceId: '8' }, { ...asset, userId: '2' }), true);
    assert.equal(check(manager, { ...asset, userId: 3, createdBy: 2 }), false);
    assert.equal(check({ ...manager, teamRole: 'workspaceOwner' }, { ...asset, userId: null }), true);
    assert.equal(check({ ...manager, teamRole: 'collaborator' }, asset), false);
    assert.equal(check({ ...manager, role: 'systemAdministrator' }, asset), false);
    assert.equal(check({ ...manager, isActive: false }, asset), false);
    assert.equal(check(manager, { ...asset, workspaceId: 9 }), false);
    assert.equal(check(manager, { userId: 2 }), false);
    assert.equal(check({ ...manager, workspaceId: null }, asset), false);
    assert.equal(check(null, asset), false);
    assert.equal(check(manager, null), false);
  }
});
test('invalid IDs do not grant manager ownership or workspace access', () => {
  for (const value of [null, undefined, '', ' ', 0, '0', -1, '1.5', 1.5, true, {}, [], NaN, Infinity, '1e2', Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(positiveId(value), null);
    assert.equal(canManageAsset({ ...manager, id: value }, { ...asset, userId: value }), false);
    assert.equal(canManageAsset(manager, { ...asset, userId: value }), false);
    assert.equal(canManageAsset({ ...manager, workspaceId: value }, { ...asset, workspaceId: value }), false);
  }
});

test('Compose keeps queue and compatibility producer off host ports', () => {
  const path = require('node:path');
  const config = require('yamljs').load(path.resolve(__dirname, '../../docker-compose.yml'));
  assert.equal(config.services.redis.ports, undefined);
  assert.equal(config.services['ai-service'].ports, undefined);
  for (const service of ['backend', 'ai-service', 'ai-worker']) {
    assert.ok(config.services[service].environment.some(value => value.startsWith('REDIS_URL=redis://redis:6379')));
  }
});
