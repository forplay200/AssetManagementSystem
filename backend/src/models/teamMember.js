module.exports = (sequelize, DataTypes) => {
  const TeamMember = sequelize.define('TeamMember', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    teamId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Teams', key: 'id' }
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Users', key: 'id' }
    },
    role: {
      type: DataTypes.ENUM('owner', 'manager', 'collaborator'),
      allowNull: false,
      defaultValue: 'collaborator'
    }
  }, {
    indexes: [{ unique: true, fields: ['teamId', 'userId'] }]
  });

  TeamMember.associate = models => {
    TeamMember.belongsTo(models.Team, { foreignKey: 'teamId', as: 'team' });
    TeamMember.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  };

  return TeamMember;
};
