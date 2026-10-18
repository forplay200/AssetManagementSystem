'use strict';

async function hasAssets(queryInterface) {
  return (await queryInterface.showAllTables()).some(table => (typeof table === 'string' ? table : table.tableName) === 'Assets');
}
module.exports = {
  async up(queryInterface, Sequelize) {
    if (!await hasAssets(queryInterface)) return;
    if (!(await queryInterface.describeTable('Assets')).displayName) {
      await queryInterface.addColumn('Assets', 'displayName', { type: Sequelize.STRING(200), allowNull: true, defaultValue: null });
    }
  },
  async down(queryInterface) {
    if (!await hasAssets(queryInterface)) return;
    if ((await queryInterface.describeTable('Assets')).displayName) await queryInterface.removeColumn('Assets', 'displayName');
  }
};
