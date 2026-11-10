'use strict';
module.exports = {
  async up(q, S) {
    const tables = (await q.showAllTables()).map(t => typeof t === 'string' ? t : t.tableName);
    if (!tables.includes('Assets')) return;
    const columns = await q.describeTable('Assets');
    for (const [name, type] of [['fileSubmittedBy', S.INTEGER], ['fileSubmittedAt', S.DATE], ['baseContentVersionId', S.UUID]]) {
      if (!columns[name]) await q.addColumn('Assets', name, { type, allowNull: true });
    }
  },
  async down() { throw new Error('File provenance requires a reviewed forward migration.'); }
};
