const { Op } = require('sequelize');
const { User, TeamMember, Team } = require('../models');
const logger = require('../utils/logger');
const { ACCOUNT_ROLES } = require('../utils/roles');

const SAFE_ATTRIBUTES = { exclude: ['passwordHash', 'resetToken', 'resetTokenExpiry'] };
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
    if (role && !Object.values(ACCOUNT_ROLES).includes(role)) {
      return res.status(400).json({ message: 'Invalid account role' });
    }
    if (role) where.role = role;

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

    const previousActive = user.isActive;
    user.isActive = status === 'active';
    if (!user.isActive) {
      // Pending recovery tokens must not remain usable as an indirect account
      // reactivation mechanism.
      user.resetToken = null;
      user.resetTokenExpiry = null;
    }
    if (require('../services/assetEditSessions').enabled()) {
      const db = require('../models');
      await db.sequelize.transaction(async transaction => {
        const administrator = await db.User.findByPk(req.user.id, { transaction });
        if (!administrator?.isActive || administrator.role !== 'systemAdministrator') throw Object.assign(new Error('System administrator permission changed.'), { status: 403 });
        await user.save({ transaction });
        if (!user.isActive) await require('../services/assetLifecycle').holdForUploader(db, user.id, null, transaction);
        if (previousActive !== user.isActive) {
          const memberships = await db.TeamMember.findAll({ where: { userId: user.id }, transaction });
          for (const membership of memberships) await require('../services/auditService').createAuditService(db).append({
            workspaceId: membership.teamId, targetName: user.username,
            actor: { id: administrator.id, username: administrator.username, role: administrator.role, workspaceId: membership.teamId },
            action: 'member.access_changed', before: { userId: user.id, isActive: previousActive }, after: { userId: user.id, isActive: user.isActive }, details: { memberId: user.id, memberName: user.username }
          }, transaction);
        }
      });
    } else await user.save();

    const response = user.toJSON();
    delete response.passwordHash;
    delete response.resetToken;
    delete response.resetTokenExpiry;
    return res.json({ message: `User account ${status === 'active' ? 'activated' : 'deactivated'}`, user: response });
  } catch (error) {
    logger.error(error);
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'Server error' });
  }
};
