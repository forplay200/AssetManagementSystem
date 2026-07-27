const { Op } = require('sequelize');
const { User, TeamMember, Team } = require('../models');
const logger = require('../utils/logger');

const SAFE_ATTRIBUTES = { exclude: ['passwordHash', 'resetToken', 'resetTokenExpiry'] };
const SYSTEM_ADMIN_ROLES = ['systemAdministrator', 'admin'];

function systemRoleWhere(role) {
  if (!role) return undefined;
  return role === 'systemAdministrator' ? { [Op.in]: SYSTEM_ADMIN_ROLES } : role;
}

exports.getAllUsers = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const status = String(req.query.status || '').toLowerCase();
    const role = String(req.query.role || '');
    const where = {};

    if (q) {
      where[Op.or] = [
        { username: { [Op.iLike]: `%${q}%` } },
        { email: { [Op.iLike]: `%${q}%` } }
      ];
    }
    if (status === 'active') where.isActive = true;
    if (status === 'inactive') where.isActive = false;
    if (role) where.role = systemRoleWhere(role);

    const users = await User.findAll({
      where,
      attributes: SAFE_ATTRIBUTES,
      order: [['createdAt', 'DESC'], ['id', 'DESC']]
    });
    return res.json(users);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: SAFE_ATTRIBUTES,
      include: [{
        model: TeamMember,
        as: 'teamMemberships',
        attributes: ['id', 'role', 'createdAt'],
        include: [{ model: Team, as: 'team', attributes: ['id', 'name', 'createdAt'] }]
      }]
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json(user);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.updateAccountStatus = async (req, res) => {
  try {
    const status = String(req.body.status || '').toLowerCase();
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ message: 'Status must be Active or Inactive' });
    }
    if (status === 'inactive' && Number(req.user.id) === Number(req.params.id)) {
      return res.status(400).json({ message: 'System Administrators cannot deactivate their own account' });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.isActive = status === 'active';
    if (!user.isActive) {
      // Pending recovery tokens must not remain usable as an indirect account
      // reactivation mechanism.
      user.resetToken = null;
      user.resetTokenExpiry = null;
    }
    await user.save();

    const response = user.toJSON();
    delete response.passwordHash;
    delete response.resetToken;
    delete response.resetTokenExpiry;
    return res.json({ message: `User account ${status === 'active' ? 'activated' : 'deactivated'}`, user: response });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.SYSTEM_ADMIN_ROLES = SYSTEM_ADMIN_ROLES;
