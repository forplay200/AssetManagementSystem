async function backfillKnownWorkspaceOwnership(sequelize) {
  const queryInterface = sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable('Assets');
  if (!columns.workspaceId || !columns.teamId) return 0;

  const [, metadata] = await sequelize.query(`
    UPDATE "Assets"
    SET "workspaceId" = "teamId"
    WHERE "workspaceId" IS NULL AND "teamId" IS NOT NULL
  `);
  return metadata?.rowCount || 0;
}

module.exports = { backfillKnownWorkspaceOwnership };
