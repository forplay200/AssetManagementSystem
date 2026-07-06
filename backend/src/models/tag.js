const { Sequelize, DataTypes } = require('sequelize');
const sequelize = new Sequelize(process.env.DATABASE_URL);

const Tag = sequelize.define('Tag', {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  }
}, {
  timestamps: false
});

Tag.associate = (models) => {
  Tag.belongsToMany(models.Asset, {
    through: 'AssetTags',
    as: 'assets',
    foreignKey: 'tagId'
  });
};

module.exports = Tag;
