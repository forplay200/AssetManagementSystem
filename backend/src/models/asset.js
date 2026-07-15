module.exports = (sequelize, DataTypes) => {


const Asset = sequelize.define('Asset', {
  filename: {
    type: DataTypes.STRING,
    allowNull: false
  },
  metadata: {
    type: DataTypes.JSON,
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
