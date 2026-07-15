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
      // Account roles remain separate from workspace membership roles. Legacy
      // values stay valid while `user` represents a new account with no team.
      type: DataTypes.ENUM('user', 'admin', 'developer', 'designer', 'collaborator'),
      allowNull: false,
      defaultValue: 'user'
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
    User.hasMany(models.TeamMember, {
      foreignKey: 'userId',
      as: 'teamMemberships'
    });
    User.belongsToMany(models.Team, {
      through: models.TeamMember,
      foreignKey: 'userId',
      otherKey: 'teamId',
      as: 'teams'
    });
  };

  return User;
};
