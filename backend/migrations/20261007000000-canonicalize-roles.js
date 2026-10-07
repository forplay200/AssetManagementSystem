'use strict';

const { ACCOUNT_ROLES, WORKSPACE_ROLES } = require('../src/utils/roles');

const definitions = [
  {
    table: 'Users',
    type: 'enum_Users_role',
    values: Object.values(ACCOUNT_ROLES),
    defaultValue: ACCOUNT_ROLES.USER,
    mapping: {
      user: ACCOUNT_ROLES.USER,
      admin: ACCOUNT_ROLES.SYSTEM_ADMINISTRATOR,
      administrator: ACCOUNT_ROLES.SYSTEM_ADMINISTRATOR,
      systemadministrator: ACCOUNT_ROLES.SYSTEM_ADMINISTRATOR,
      'system administrator': ACCOUNT_ROLES.SYSTEM_ADMINISTRATOR,
      system_administrator: ACCOUNT_ROLES.SYSTEM_ADMINISTRATOR,
      developer: ACCOUNT_ROLES.USER,
      designer: ACCOUNT_ROLES.USER,
      collaborator: ACCOUNT_ROLES.USER
    }
  },
  {
    table: 'TeamMembers',
    type: 'enum_TeamMembers_role',
    values: Object.values(WORKSPACE_ROLES),
    defaultValue: WORKSPACE_ROLES.COLLABORATOR,
    mapping: {
      owner: WORKSPACE_ROLES.OWNER,
      workspaceowner: WORKSPACE_ROLES.OWNER,
      'workspace owner': WORKSPACE_ROLES.OWNER,
      workspace_owner: WORKSPACE_ROLES.OWNER,
      manager: WORKSPACE_ROLES.MANAGER,
      workspacemanager: WORKSPACE_ROLES.MANAGER,
      'workspace manager': WORKSPACE_ROLES.MANAGER,
      workspace_manager: WORKSPACE_ROLES.MANAGER,
      collaborator: WORKSPACE_ROLES.COLLABORATOR
    }
  }
];

const quoted = (value) => `'${value.replaceAll("'", "''")}'`;
const identifier = (value) => `"${value.replaceAll('"', '""')}"`;

async function tableState(sequelize, definition, transaction) {
  const options = { transaction, replacements: { table: definition.table } };
  const [tables] = await sequelize.query(
    'SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = :table',
    options
  );
  if (!tables.length) return null;

  const [columns] = await sequelize.query(
    `SELECT udt_name, column_default FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = :table AND column_name = 'role'`,
    options
  );
  if (!columns.length) throw new Error(`${definition.table}.role is missing`);

  const [rows] = await sequelize.query(
    `SELECT DISTINCT CAST("role" AS TEXT) AS role FROM ${identifier(definition.table)}`,
    { transaction }
  );
  const [labels] = await sequelize.query(
    `SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = :type ORDER BY e.enumsortorder`,
    { transaction, replacements: { type: columns[0].udt_name } }
  );
  return { column: columns[0], roles: rows.map((row) => row.role), labels: labels.map((row) => row.enumlabel) };
}

function validateValues(definition, roles) {
  const unknown = roles.filter((role) => role == null || !Object.hasOwn(definition.mapping, role.trim().toLowerCase()));
  if (unknown.length) {
    throw new Error(`${definition.table}.role contains unmapped values: ${unknown.map(String).join(', ')}`);
  }
}

function isCanonical(definition, state) {
  return state.column.udt_name === definition.type
    && state.labels.length === definition.values.length
    && state.labels.every((value, index) => value === definition.values[index])
    && state.roles.every((role) => definition.values.includes(role))
    && state.column.column_default?.startsWith(quoted(definition.defaultValue));
}

function roleCase(definition) {
  const branches = Object.entries(definition.mapping)
    .map(([previous, next]) => `WHEN ${quoted(previous)} THEN ${quoted(next)}`)
    .join(' ');
  return `CASE lower(trim(CAST("role" AS TEXT))) ${branches} END`;
}

async function migratePostgresRole(sequelize, definition, transaction) {
  const table = identifier(definition.table);
  await sequelize.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`, { transaction });
  const state = await tableState(sequelize, definition, transaction);
  validateValues(definition, state.roles);
  if (isCanonical(definition, state)) return false;

  const temporaryType = identifier(`${definition.type}_canonical`);
  const canonicalType = identifier(definition.type);
  await sequelize.query(`DROP TYPE IF EXISTS ${temporaryType}`, { transaction });
  await sequelize.query(
    `CREATE TYPE ${temporaryType} AS ENUM (${definition.values.map(quoted).join(', ')})`,
    { transaction }
  );
  await sequelize.query(`ALTER TABLE ${table} ALTER COLUMN "role" DROP DEFAULT`, { transaction });
  await sequelize.query(
    `ALTER TABLE ${table} ALTER COLUMN "role" TYPE ${temporaryType}
     USING (${roleCase(definition)})::${temporaryType}`,
    { transaction }
  );
  await sequelize.query(`ALTER TABLE ${table} ALTER COLUMN "role" SET NOT NULL`, { transaction });
  await sequelize.query(
    `ALTER TABLE ${table} ALTER COLUMN "role" SET DEFAULT ${quoted(definition.defaultValue)}`,
    { transaction }
  );
  await sequelize.query(`DROP TYPE IF EXISTS ${canonicalType}`, { transaction });
  await sequelize.query(
    `ALTER TYPE ${temporaryType} RENAME TO ${identifier(definition.type)}`,
    { transaction }
  );
  return true;
}

async function migrateSqliteRole(sequelize, definition, transaction) {
  const tables = await sequelize.getQueryInterface().showAllTables({ transaction });
  if (!tables.includes(definition.table)) return false;
  const [rows] = await sequelize.query(
    `SELECT DISTINCT CAST("role" AS TEXT) AS role FROM ${identifier(definition.table)}`,
    { transaction }
  );
  const roles = rows.map((row) => row.role);
  validateValues(definition, roles);
  if (roles.every((role) => definition.values.includes(role))) return false;
  await sequelize.query(
    `UPDATE ${identifier(definition.table)} SET "role" = ${roleCase(definition)}`,
    { transaction }
  );
  return true;
}

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const dialect = sequelize.getDialect();
    if (!['postgres', 'sqlite'].includes(dialect)) {
      throw new Error(`Role migration does not support ${dialect}`);
    }
    return sequelize.transaction(async (transaction) => {
      let changed = false;
      for (const definition of definitions) {
        if (dialect === 'sqlite') {
          changed = await migrateSqliteRole(sequelize, definition, transaction) || changed;
          continue;
        }
        const state = await tableState(sequelize, definition, transaction);
        if (!state) continue;
        if (!isCanonical(definition, state)) {
          changed = await migratePostgresRole(sequelize, definition, transaction) || changed;
        }
      }
      return changed;
    });
  },

  async down() {
    throw new Error('Original legacy account roles cannot be restored after canonicalization');
  }
};
