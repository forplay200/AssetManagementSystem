module.exports = (sequelize, DataTypes) => {
  const ClipVocabularyEntry = sequelize.define('ClipVocabularyEntry', {
    workspaceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Teams', key: 'id' }
    },
    name: { type: DataTypes.STRING(80), allowNull: false },
    aliases: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    category: { type: DataTypes.STRING(80), allowNull: false, defaultValue: 'workspace-custom' },
    facet: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'content' },
    assetTypes: { type: DataTypes.JSONB, allowNull: false },
    description: { type: DataTypes.STRING(240), allowNull: false },
    source: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'workspace-user' },
    approvedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' },
      onDelete: 'SET NULL'
    }
  }, {
    indexes: [{ unique: true, fields: ['workspaceId', 'name'] }]
  });

  ClipVocabularyEntry.associate = models => {
    ClipVocabularyEntry.belongsTo(models.Team, { foreignKey: 'workspaceId', as: 'workspace', onDelete: 'CASCADE' });
    ClipVocabularyEntry.belongsTo(models.User, { foreignKey: 'approvedBy', as: 'approver', onDelete: 'SET NULL' });
  };

  return ClipVocabularyEntry;
};
