module.exports = (sequelize, DataTypes) => {
  const Team = sequelize.define('Team', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    inviteCode: {
      type: DataTypes.STRING(24),
      allowNull: false,
      unique: true
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Users', key: 'id' }
    }
  });

  Team.associate = models => {
    Team.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
    Team.hasMany(models.TeamMember, { foreignKey: 'teamId', as: 'memberships' });
    Team.belongsToMany(models.User, {
      through: models.TeamMember,
      foreignKey: 'teamId',
      otherKey: 'userId',
      as: 'members'
    });
    Team.hasMany(models.Asset, { foreignKey: 'workspaceId', as: 'assets' });
  };

  return Team;
};
