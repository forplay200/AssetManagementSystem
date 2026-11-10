'use strict';
module.exports = {
  async up(q, S) {
    const tables = (await q.showAllTables()).map(t => typeof t === 'string' ? t : t.tableName);
    for (const [table, column, type] of [['Assets', 'currentAiJobId', S.UUID], ['Versions', 'metadata', S.JSONB]]) {
      if (tables.includes(table) && !(await q.describeTable(table))[column]) await q.addColumn(table, column, { type, allowNull: true });
    }
    if (!tables.includes('AssetAiJobs')) await q.createTable('AssetAiJobs', {
      id: { type: S.UUID, primaryKey: true }, assetId: { type: S.INTEGER, allowNull: false }, workspaceId: { type: S.INTEGER, allowNull: false },
      sourceFilename: { type: S.STRING, allowNull: false }, jobType: { type: S.STRING, allowNull: false }, requestedBy: S.INTEGER,
      status: { type: S.STRING, allowNull: false }, stage: S.STRING, attempt: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
      leaseToken: S.UUID, leaseExpiresAt: S.DATE, startedAt: S.DATE, finishedAt: S.DATE, dispatchedAt: S.DATE,
      input: { type: S.JSONB, allowNull: false }, output: S.JSONB, errorCode: S.STRING, errorMessage: S.STRING(500),
      createdAt: { type: S.DATE, allowNull: false }, updatedAt: { type: S.DATE, allowNull: false }
    });
  },
  async down(q) {
    const tables = (await q.showAllTables()).map(t => typeof t === 'string' ? t : t.tableName);
    if (tables.includes('AssetAiJobs')) await q.dropTable('AssetAiJobs');
    for (const [table, column] of [['Assets', 'currentAiJobId'], ['Versions', 'metadata']]) {
      if (tables.includes(table) && (await q.describeTable(table))[column]) await q.removeColumn(table, column);
    }
  }
};
