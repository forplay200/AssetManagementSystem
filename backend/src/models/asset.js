module.exports = (sequelize, DataTypes) => {


const Asset = sequelize.define('Asset', {
  lifecycleState: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
  revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  contentVersionId: { type: DataTypes.UUID, allowNull: true },
  fileSubmittedBy: { type: DataTypes.INTEGER, allowNull: true },
  fileSubmittedAt: { type: DataTypes.DATE, allowNull: true },
  baseContentVersionId: { type: DataTypes.UUID, allowNull: true },
  aiRequestContext: { type: DataTypes.JSONB, allowNull: true },
  pendingAiResult: { type: DataTypes.JSONB, allowNull: true },
  currentAiJobId: { type: DataTypes.UUID, allowNull: true },
  filename: {
    type: DataTypes.STRING,
    allowNull: false
  },
  displayName: { type: DataTypes.STRING(200), allowNull: true, defaultValue: null },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  },
  packageManifest: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  originalname: {
    type: DataTypes.STRING,
    allowNull: false
  },
  mimetype: {
    type: DataTypes.STRING,
    allowNull: false
  },
  size: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  path: {
    type: DataTypes.STRING,
    allowNull: false
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  teamId: {
    // Deprecated compatibility column. Kept until every legacy asset has an
    // explicitly reviewed workspace assignment.
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Teams',
      key: 'id'
    }
  },
  workspaceId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Teams',
      key: 'id'
    }
  },
  uploadedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: false,
  indexes: [{ fields: ['workspaceId'] }]
});

// Associate with User, Tags, and Versions
Asset.associate = (models) => {
  Asset.belongsTo(models.User, {
    foreignKey: 'userId',
    as: 'uploader'
  });
  Asset.belongsTo(models.Team, {
    foreignKey: 'workspaceId',
    as: 'workspace'
  });
  Asset.belongsToMany(models.Tag, {
    through: 'AssetTags',
    as: 'tags',
    foreignKey: 'assetId'
  });
  Asset.hasMany(models.Comment, {
    foreignKey: 'assetId',
    as: 'comments'
  });
  Asset.hasMany(models.Version, {
    foreignKey: 'assetId',
    as: 'versions'
  });
};
  return Asset;
};
