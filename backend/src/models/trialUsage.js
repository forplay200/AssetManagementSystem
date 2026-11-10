module.exports = (sequelize, DataTypes) => sequelize.define('TrialUsage', {
  userId: { type: DataTypes.INTEGER, primaryKey: true },
  day: { type: DataTypes.DATEONLY, primaryKey: true },
  requests: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
});
