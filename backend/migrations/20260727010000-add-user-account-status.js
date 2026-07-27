'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_Users_role') THEN
          ALTER TYPE "enum_Users_role" ADD VALUE IF NOT EXISTS 'systemAdministrator';
        END IF;
      END $$;
    `);

    const columns = await queryInterface.describeTable('Users');
    if (!columns.isActive) {
      await queryInterface.addColumn('Users', 'isActive', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      });
    }

    const indexes = await queryInterface.showIndex('Users');
    if (!indexes.some(index => index.name === 'users_is_active')) {
      await queryInterface.addIndex('Users', ['isActive'], { name: 'users_is_active' });
    }
  },

  async down(queryInterface) {
    const indexes = await queryInterface.showIndex('Users');
    if (indexes.some(index => index.name === 'users_is_active')) {
      await queryInterface.removeIndex('Users', 'users_is_active');
    }
    const columns = await queryInterface.describeTable('Users');
    if (columns.isActive) await queryInterface.removeColumn('Users', 'isActive');
    // PostgreSQL enum values are intentionally retained during rollback.
  }
};
