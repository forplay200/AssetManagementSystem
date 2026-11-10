'use strict';
module.exports = {
  async up(q, S) {
    const tables = (await q.showAllTables()).map(t => typeof t === 'string' ? t : t.tableName);
    for (const [table, name, fields, extra] of [
      ['AssetTrashCycles', 'one_open_trash_cycle_per_asset', ['assetId'], { where: { status: { [S.Op.in]: ['trashed', 'purging'] } } }],
      ['Notifications', 'one_notification_per_recipient_event', ['recipientId', 'eventId'], {}]
    ]) {
      if (!tables.includes(table)) continue;
      if (!(await q.showIndex(table)).some(index => index.name === name)) await q.addIndex(table, fields, { name, unique: true, ...extra });
    }
  },
  async down() { throw new Error('Recycle-bin constraints require a reviewed forward migration.'); }
};
