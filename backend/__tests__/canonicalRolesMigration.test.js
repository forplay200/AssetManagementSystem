const test = require('node:test');
const assert = require('node:assert/strict');
const { up } = require('../migrations/20261007000000-canonicalize-roles');

function database(rolesByTable, canonical = false) {
  const statements = [];
  const sequelize = {
    getDialect: () => 'postgres',
    transaction: (callback) => callback({}),
    async query(sql, options = {}) {
      statements.push(sql);
      const table = options.replacements?.table;
      if (sql.includes('information_schema.tables')) return [[{ present: true }], {}];
      if (sql.includes('information_schema.columns')) {
        return [[{ udt_name: `enum_${table}_role`, column_default: table === 'Users' ? "'user'::text" : "'collaborator'::text" }], {}];
      }
      if (sql.includes('SELECT DISTINCT CAST')) {
        const name = sql.includes('"Users"') ? 'Users' : 'TeamMembers';
        return [rolesByTable[name].map((role) => ({ role })), {}];
      }
      if (sql.includes('SELECT e.enumlabel')) {
        if (canonical) {
          const values = options.replacements.type === 'enum_Users_role'
            ? ['user', 'systemAdministrator']
            : ['workspaceOwner', 'workspaceManager', 'collaborator'];
          return [values.map((enumlabel) => ({ enumlabel })), {}];
        }
        return [[{ enumlabel: 'owner' }, { enumlabel: 'manager' }, { enumlabel: 'collaborator' }], {}];
      }
      return [[], {}];
    }
  };
  return { sequelize, statements };
}

test('converts legacy account and workspace values to the five canonical roles', async () => {
  const { sequelize, statements } = database({
    Users: ['Admin', 'Developer', 'user'],
    TeamMembers: ['owner', 'manager', 'collaborator']
  });
  assert.equal(await up({ sequelize }), true);
  const sql = statements.join('\n');
  assert.match(sql, /WHEN 'admin' THEN 'systemAdministrator'/);
  assert.match(sql, /WHEN 'developer' THEN 'user'/);
  assert.match(sql, /WHEN 'owner' THEN 'workspaceOwner'/);
  assert.match(sql, /WHEN 'manager' THEN 'workspaceManager'/);
  assert.match(sql, /ALTER TABLE "Users" ALTER COLUMN "role" TYPE/);
  assert.match(sql, /ALTER TABLE "TeamMembers" ALTER COLUMN "role" TYPE/);
});

test('stops before changing a database role that has no safe mapping', async () => {
  const { sequelize, statements } = database({
    Users: ['unknownRole'],
    TeamMembers: []
  });
  await assert.rejects(up({ sequelize }), /Users\.role contains unmapped values: unknownRole/);
  assert.equal(statements.some((sql) => sql.startsWith('ALTER TABLE')), false);
});

test('leaves an already canonical database untouched on subsequent starts', async () => {
  const { sequelize, statements } = database({
    Users: ['user', 'systemAdministrator'],
    TeamMembers: ['workspaceOwner', 'workspaceManager', 'collaborator']
  }, true);
  assert.equal(await up({ sequelize }), false);
  assert.equal(statements.some((sql) => sql.startsWith('LOCK TABLE') || sql.startsWith('ALTER TABLE')), false);
});
