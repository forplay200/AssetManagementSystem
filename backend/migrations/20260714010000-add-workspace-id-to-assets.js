'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('Assets');
    if (!columns.workspaceId) {
      await queryInterface.addColumn('Assets', 'workspaceId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'Teams', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      });
    }

    const refreshedColumns = await queryInterface.describeTable('Assets');
    if (refreshedColumns.teamId) {
      // Only copy ownership already established by the transitional teamId.
      // Null legacy records remain quarantined for explicit owner review.
      await queryInterface.sequelize.query(`
        UPDATE "Assets"
        SET "workspaceId" = "teamId"
        WHERE "workspaceId" IS NULL AND "teamId" IS NOT NULL
      `);
    }

    const indexes = await queryInterface.showIndex('Assets');
    if (!indexes.some(index => index.name === 'assets_workspace_id')) {
      await queryInterface.addIndex('Assets', ['workspaceId'], { name: 'assets_workspace_id' });
    }
  },

  async down(queryInterface) {
    const indexes = await queryInterface.showIndex('Assets');
    if (indexes.some(index => index.name === 'assets_workspace_id')) {
      await queryInterface.removeIndex('Assets', 'assets_workspace_id');
    }
    const columns = await queryInterface.describeTable('Assets');
    if (columns.workspaceId) await queryInterface.removeColumn('Assets', 'workspaceId');
  }
};
