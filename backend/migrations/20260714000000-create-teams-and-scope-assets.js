'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Docker deployments created before migrations may have Sequelize's enum,
    // while migration-managed deployments use VARCHAR. Support both shapes.
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_Users_role') THEN
          ALTER TYPE "enum_Users_role" ADD VALUE IF NOT EXISTS 'user';
        END IF;
      END $$;
    `);
    await queryInterface.sequelize.query('ALTER TABLE "Users" ALTER COLUMN "role" SET DEFAULT \'user\'');
    await queryInterface.createTable('Teams', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      name: { allowNull: false, type: Sequelize.STRING(100) },
      inviteCode: { allowNull: false, unique: true, type: Sequelize.STRING(24) },
      createdBy: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'Users', key: 'id' }, onDelete: 'RESTRICT' },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE }
    });
    await queryInterface.createTable('TeamMembers', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      teamId: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'Teams', key: 'id' }, onDelete: 'CASCADE' },
      userId: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE' },
      role: { allowNull: false, type: Sequelize.ENUM('owner', 'manager', 'collaborator'), defaultValue: 'collaborator' },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE }
    });
    await queryInterface.addConstraint('TeamMembers', {
      fields: ['teamId', 'userId'], type: 'unique', name: 'team_members_team_user_unique'
    });
    await queryInterface.addColumn('Assets', 'teamId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'Teams', key: 'id' },
      onDelete: 'SET NULL'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Assets', 'teamId');
    await queryInterface.dropTable('TeamMembers');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_TeamMembers_role"');
    await queryInterface.dropTable('Teams');
    await queryInterface.sequelize.query('ALTER TABLE "Users" ALTER COLUMN "role" SET DEFAULT \'collaborator\'');
  }
};
