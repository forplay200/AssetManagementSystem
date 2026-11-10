exports.up = async (queryInterface, DataTypes) => {
  const tables = await queryInterface.showAllTables();
  if (!tables.includes('TrialUsages')) await queryInterface.createTable('TrialUsages', {
    userId: { type: DataTypes.INTEGER, primaryKey: true }, day: { type: DataTypes.DATEONLY, primaryKey: true },
    requests: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdAt: { type: DataTypes.DATE, allowNull: false }, updatedAt: { type: DataTypes.DATE, allowNull: false }
  });
  if (!tables.includes('Users')) return; // Empty database: model bootstrap creates this table.
  const columns = await queryInterface.describeTable('Users');
  if (!columns.tokenVersion) await queryInterface.addColumn('Users', 'tokenVersion', { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 });
};
