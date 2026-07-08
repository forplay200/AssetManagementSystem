module.exports = (sequelize, DataTypes) => {
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
 return Tag;
};