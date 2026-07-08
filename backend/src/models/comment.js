module.exports = (sequelize, DataTypes) => {

const Comment = sequelize.define('Comment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  // timestamps: true will be set by sequelize
}, {
  timestamps: true
});

// Associate with User, Asset, and self (for replies)
Comment.associate = (models) => {
  Comment.belongsTo(models.User, {
    foreignKey: 'userId',
    as: 'author'
  });
  Comment.belongsTo(models.Asset, {
    foreignKey: 'assetId',
    as: 'asset'
  });
  // Self-referential for replies
  Comment.belongsTo(models.Comment, {
    foreignKey: 'parentId',
    as: 'parent',
    onDelete: 'SET NULL' // if parent is deleted, set parentId to null
  });
  Comment.hasMany(models.Comment, {
    foreignKey: 'parentId',
    as: 'replies'
  });
};
  return Comment;
};