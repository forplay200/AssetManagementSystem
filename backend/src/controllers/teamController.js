const crypto = require('crypto');
const db = require('../models');
const logger = require('../utils/logger');

const TEAM_ROLES = new Set(['owner', 'manager', 'collaborator']);

function newInviteCode() {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
}

async function uniqueInviteCode() {
  let inviteCode;
  do inviteCode = newInviteCode();
  while (await db.Team.findOne({ where: { inviteCode } }));
  return inviteCode;
}

function membershipResponse(membership) {
  return {
    id: membership.team.id,
    name: membership.team.name,
    role: membership.role,
    createdAt: membership.team.createdAt
  };
}

async function ownerCount(teamId, transaction) {
  return db.TeamMember.count({ where: { teamId, role: 'owner' }, transaction });
}

async function rollbackIfActive(transaction) {
  if (transaction && !transaction.finished) await transaction.rollback();
}

exports.listTeams = async (req, res) => {
  try {
    const memberships = await db.TeamMember.findAll({
      where: { userId: req.user.id },
      include: [{ model: db.Team, as: 'team', attributes: ['id', 'name', 'createdAt'] }],
      order: [['createdAt', 'ASC']]
    });
    res.json({ teams: memberships.map(membershipResponse) });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.createTeam = async (req, res) => {
  let transaction;
  try {
    transaction = await db.sequelize.transaction();
    const team = await db.Team.create({
      name: req.body.name.trim(),
      inviteCode: await uniqueInviteCode(),
      createdBy: req.user.id
    }, { transaction });
    await db.TeamMember.create({ teamId: team.id, userId: req.user.id, role: 'owner' }, { transaction });
    await transaction.commit();
    res.status(201).json({ team: { id: team.id, name: team.name, inviteCode: team.inviteCode }, role: 'owner' });
  } catch (error) {
    await rollbackIfActive(transaction);
    logger.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.joinTeam = async (req, res) => {
  try {
    const inviteCode = req.body.inviteCode.trim().toUpperCase();
    const team = await db.Team.findOne({ where: { inviteCode } });
    if (!team) return res.status(404).json({ message: 'Invite code is invalid or expired' });
    const [membership, created] = await db.TeamMember.findOrCreate({
      where: { teamId: team.id, userId: req.user.id },
      defaults: { role: 'collaborator' }
    });
    res.status(created ? 201 : 200).json({ team: { id: team.id, name: team.name }, role: membership.role });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getCurrentTeam = async (req, res) => {
  try {
    if (!req.user.teamId) return res.status(404).json({ message: 'No active team selected' });
    const team = await db.Team.findByPk(req.user.teamId, {
      attributes: ['id', 'name', 'inviteCode', 'createdAt'],
      include: [{
        model: db.TeamMember,
        as: 'memberships',
        attributes: ['id', 'role', 'createdAt'],
        include: [{ model: db.User, as: 'user', attributes: ['id', 'username', 'email'] }]
      }],
      order: [[{ model: db.TeamMember, as: 'memberships' }, 'createdAt', 'ASC']]
    });
    if (!team) return res.status(404).json({ message: 'Team not found' });
    res.json({
      team: {
        id: team.id,
        name: team.name,
        inviteCode: req.user.teamRole === 'owner' ? team.inviteCode : undefined,
        createdAt: team.createdAt,
        members: team.memberships.map(member => ({
          membershipId: member.id,
          id: member.user.id,
          username: member.user.username,
          email: member.user.email,
          role: member.role,
          joinedAt: member.createdAt
        }))
      },
      role: req.user.teamRole
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateMemberRole = async (req, res) => {
  let transaction;
  try {
    transaction = await db.sequelize.transaction();
    const role = req.body.role;
    if (!TEAM_ROLES.has(role)) {
      await rollbackIfActive(transaction);
      return res.status(400).json({ message: 'Invalid team role' });
    }
    const membership = await db.TeamMember.findOne({
      where: { teamId: req.user.teamId, userId: req.params.userId }, transaction, lock: transaction.LOCK.UPDATE
    });
    if (!membership) {
      await rollbackIfActive(transaction);
      return res.status(404).json({ message: 'Team member not found' });
    }
    if (membership.role === 'owner' && role !== 'owner' && await ownerCount(req.user.teamId, transaction) <= 1) {
      await rollbackIfActive(transaction);
      return res.status(400).json({ message: 'A team must have at least one owner' });
    }
    membership.role = role;
    await membership.save({ transaction });
    await transaction.commit();
    res.json({ message: 'Team role updated', member: { userId: membership.userId, role: membership.role } });
  } catch (error) {
    await rollbackIfActive(transaction);
    logger.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.removeMember = async (req, res) => {
  let transaction;
  try {
    transaction = await db.sequelize.transaction();
    const membership = await db.TeamMember.findOne({
      where: { teamId: req.user.teamId, userId: req.params.userId }, transaction, lock: transaction.LOCK.UPDATE
    });
    if (!membership) {
      await rollbackIfActive(transaction);
      return res.status(404).json({ message: 'Team member not found' });
    }
    if (membership.role === 'owner' && await ownerCount(req.user.teamId, transaction) <= 1) {
      await rollbackIfActive(transaction);
      return res.status(400).json({ message: 'The last owner cannot be removed' });
    }
    await membership.destroy({ transaction });
    await transaction.commit();
    res.json({ message: 'Team member removed' });
  } catch (error) {
    await rollbackIfActive(transaction);
    logger.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.regenerateInviteCode = async (req, res) => {
  try {
    const team = await db.Team.findByPk(req.user.teamId);
    if (!team) return res.status(404).json({ message: 'Team not found' });
    team.inviteCode = await uniqueInviteCode();
    await team.save();
    res.json({ inviteCode: team.inviteCode });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
