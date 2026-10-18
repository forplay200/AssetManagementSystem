const test = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize, DataTypes } = require('sequelize');
const migration = require('../migrations/20261013000000-add-asset-display-name');

test('display-name migration skips fresh DB, repeats up/down safely and adds only a nullable name', async () => {
  let tables = [], columns = {}, calls = [];
  const query = {
    async showAllTables() { return tables; }, async describeTable() { return columns; },
    async addColumn(table, name, definition) { calls.push([table, name, definition]); columns[name] = definition; },
    async removeColumn(table, name) { calls.push([table, name]); delete columns[name]; }
  };
  await migration.up(query, Sequelize); await migration.down(query); assert.deepEqual(calls, []);
  tables = [{ tableName: 'Assets' }]; columns.originalname = {};
  await migration.up(query, Sequelize); await migration.up(query, Sequelize);
  assert.equal(calls.length, 1); assert.equal(columns.displayName.type.options.length, 200);
  assert.equal(columns.displayName.allowNull, true); assert.equal(columns.displayName.defaultValue, null);
  await migration.down(query); await migration.down(query); assert.equal(calls.length, 2); assert.ok(columns.originalname);
});
test('fresh model defines nullable displayName without changing original filename semantics', () => {
  const sequelize = new Sequelize('postgres://user:password@localhost/test', { logging: false });
  const Asset = require('../src/models/asset')(sequelize, DataTypes);
  assert.equal(Asset.rawAttributes.displayName.type.options.length, 200);
  assert.equal(Asset.rawAttributes.displayName.defaultValue, null);
  assert.equal(Asset.rawAttributes.originalname.allowNull, false);
});
