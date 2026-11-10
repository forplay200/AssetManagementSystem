module.exports = (sequelize, DataTypes) => {

const Version = sequelize.define('Version', {
  contentVersionId: { type: DataTypes.UUID, allowNull: true },
  baseContentVersionId: { type: DataTypes.UUID, allowNull: true },
  submittedBy: { type: DataTypes.INTEGER, allowNull: true },
  submittedAt: { type: DataTypes.DATE, allowNull: true },
  metadata: { type: DataTypes.JSONB, allowNull: true },
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  versionNumber: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  fileName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  originalName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  mimeType: {
    type: DataTypes.STRING,
    allowNull: false
  },
  size: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  changeLog: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  packageManifest: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  createdBy: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Users',
      key: 'id'
    }
  }
}, {
  timestamps: false
});

// Associate with Asset and User
Version.associate = (models) => {
  Version.belongsTo(models.Asset, {
    foreignKey: 'assetId',
    as: 'asset'
  });
  Version.belongsTo(models.User, {
    foreignKey: 'createdBy',
    as: 'creator'
  });
};
 return Version;
};
