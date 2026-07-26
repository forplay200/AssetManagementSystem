'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('Comments');
    if (!columns.isDeleted) {
      await queryInterface.addColumn('Comments', 'isDeleted', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable('Comments');
    if (columns.isDeleted) await queryInterface.removeColumn('Comments', 'isDeleted');
  }
};
