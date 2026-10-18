const { Sequelize, DataTypes } = require('/app/node_modules/sequelize');
const assert = require('assert/strict');
const migration = require('/app/migrations/20261013000000-add-asset-display-name');
const name = 'rename_migration_' + Date.now();
const admin = new Sequelize(process.env.DATABASE_URL, { logging: false });
let disposable;
(async () => {
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(process.env.DATABASE_URL); url.pathname = '/' + name;
  disposable = new Sequelize(url.toString(), { logging: false });
  const query = disposable.getQueryInterface();
  await migration.up(query, Sequelize); await migration.down(query); // brand new DB
  await query.createTable('Assets', { id: { type: DataTypes.INTEGER, primaryKey: true }, originalname: { type: DataTypes.STRING } });
  await query.bulkInsert('Assets', [{ id: 1, originalname: 'legacy.obj' }]);
  await migration.up(query, Sequelize); await migration.up(query, Sequelize);
  assert.equal((await disposable.query('SELECT "displayName" FROM "Assets"'))[0][0].displayName, null);
  await disposable.query('UPDATE "Assets" SET "displayName" = :name', { replacements: { name: '自定义 🐧' } });
  await migration.up(query, Sequelize); assert.equal((await disposable.query('SELECT "displayName" FROM "Assets"'))[0][0].displayName, '自定义 🐧');
  await migration.down(query); await migration.down(query);
  assert.equal((await disposable.query('SELECT originalname FROM "Assets"'))[0][0].originalname, 'legacy.obj');
  await query.dropTable('Assets');
  for (const table of ['Users', 'Teams']) await query.createTable(table, { id: { type: DataTypes.INTEGER, primaryKey: true } });
  const Asset = require('/app/src/models/asset')(disposable, DataTypes); await Asset.sync();
  assert.equal((await query.describeTable('Assets')).displayName.allowNull, true);
  await migration.up(query, Sequelize);
  console.log('Disposable PostgreSQL migration passed: new DB, old rows, repeated up/down, preservation and fresh model sync.');
})().finally(async () => {
  if (disposable) await disposable.close();
  await admin.query(`DROP DATABASE IF EXISTS "${name}"`); await admin.close();
}).catch(error => { console.error(error); process.exit(1); });
