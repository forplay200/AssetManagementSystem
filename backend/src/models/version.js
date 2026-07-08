module.exports = (sequelize, DataTypes) => {

const Version = sequelize.define('Version', {
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
