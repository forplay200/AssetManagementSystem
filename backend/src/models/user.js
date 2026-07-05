const { Sequelize, DataTypes } = require('sequelize');
const sequelize = new Sequelize(process.env.DATABASE_URL);

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
  resetToken: {
    type: DataTypes.STRING
  },
  resetTokenExpiry: {
    type: DataTypes.DATE
  },
  role: {
    type: DataTypes.ENUM('admin', 'developer', 'designer', 'collaborator'),
    defaultValue: 'collaborator'
  }
}, {
  timestamps: true
});

// Instance method to validate password
User.prototype.validPassword = function(password) {
  const bcrypt = require('bcryptjs');
  return bcrypt.compareSync(password, this.passwordHash);
};

// Generate a password reset token (using crypto)
User.prototype.generateResetToken = function() {
  const crypto = require('crypto');
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.resetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  // Token expires in 1 hour
  this.resetTokenExpiry = Date.now() + 3600000; // 1 hour
  return resetToken;
};

module.exports = User;
