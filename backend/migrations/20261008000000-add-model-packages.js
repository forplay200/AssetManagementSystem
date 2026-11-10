'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    for (const table of ['Assets', 'Versions']) {
      if (!tables.some(item => (typeof item === 'string' ? item : item.tableName) === table)) continue;
      const columns = await queryInterface.describeTable(table);
      if (!columns.packageManifest) await queryInterface.addColumn(table, 'packageManifest', { type: Sequelize.JSONB, allowNull: true });
    }
  },
  async down(queryInterface) {
    for (const table of ['Versions', 'Assets']) {
      const columns = await queryInterface.describeTable(table);
      if (columns.packageManifest) await queryInterface.removeColumn(table, 'packageManifest');
    }
  }
};
