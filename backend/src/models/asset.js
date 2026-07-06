const { Sequelize, DataTypes } = require('sequelize');
const sequelize = new Sequelize(process.env.DATABASE_URL);

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
  uploadedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: false
});

// Associate with User, Tags, and Versions
Asset.associate = (models) => {
  Asset.belongsTo(models.User, {
    foreignKey: 'userId',
    as: 'uploader'
  });
  Asset.belongsToMany(models.Tag, {
    through: 'AssetTags',
    as: 'tags',
    foreignKey: 'assetId'
  });
  Asset.hasMany(models.Version, {
    foreignKey: 'assetId',
    as: 'versions'
  });
};

module.exports = Asset;
