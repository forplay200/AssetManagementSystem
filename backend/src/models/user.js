module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },

    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },

    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },

    passwordHash: {
      type: DataTypes.STRING,
      allowNull: false
    },

    resetToken: DataTypes.STRING,

    resetTokenExpiry: DataTypes.DATE,

    role: {
      type: DataTypes.ENUM(
        'admin',
        'developer',
        'designer',
        'collaborator'
      ),
      defaultValue: 'collaborator'
    }
  });

  User.prototype.validPassword = function(password) {
    const bcrypt = require('bcryptjs');
    return bcrypt.compareSync(password, this.passwordHash);
  };

  User.prototype.generateResetToken = function() {
    const crypto = require('crypto');

    const token = crypto.randomBytes(32).toString('hex');

    this.resetToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    this.resetTokenExpiry = Date.now() + 3600000;

    return token;
  };

  User.associate = models => {
    User.hasMany(models.Comment, {
      foreignKey: 'userId',
      as: 'comments'
    });
  };

  return User;
};