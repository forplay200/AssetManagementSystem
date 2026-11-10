const crypto = require('crypto');
const db = require('../models');
const logger = require('../utils/logger');
const { WORKSPACE_ROLES } = require('../utils/roles');
const workspaceAudit = require('../services/workspaceAudit');
const governanceEnabled = require('../services/assetEditSessions').enabled;

const TEAM_ROLES = new Set(Object.values(WORKSPACE_ROLES));

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
  return db.TeamMember.count({ where: { teamId, role: WORKSPACE_ROLES.OWNER }, transaction });
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
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Server error' });
  }
};

exports.createTeam = async (req, res) => {
  let transaction;
  try {
    transaction = await db.sequelize.transaction();
    await require('../services/trialPolicy').admitWorkspace(db, req.user.id, transaction);
    const team = await db.Team.create({
      name: req.body.name.trim(),
      inviteCode: await uniqueInviteCode(),
      createdBy: req.user.id
    }, { transaction });
    await db.TeamMember.create({ teamId: team.id, userId: req.user.id, role: WORKSPACE_ROLES.OWNER }, { transaction });
    await workspaceAudit.record(db, req.user, team, 'workspace.created', transaction, { after: { name: team.name }, details: { ownerId: req.user.id } });
    await transaction.commit();
    res.status(201).json({ team: { id: team.id, name: team.name, inviteCode: team.inviteCode }, role: WORKSPACE_ROLES.OWNER });
  } catch (error) {
    await rollbackIfActive(transaction);
    logger.error(error);
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Server error' });
  }
};

exports.joinTeam = async (req, res) => {
  try {
    if (governanceEnabled()) {
      const result = await db.sequelize.transaction(async transaction => {
        const team = await db.Team.findOne({ where: { inviteCode: req.body.inviteCode.trim().toUpperCase() }, transaction, lock: transaction.LOCK.UPDATE });
        if (!team) throw Object.assign(new Error('Invite code is invalid or expired'), { status: 404 });
        const [membership, created] = await db.TeamMember.findOrCreate({ where: { teamId: team.id, userId: req.user.id }, defaults: { role: WORKSPACE_ROLES.COLLABORATOR }, transaction });
        if (created) await workspaceAudit.record(db, req.user, team, 'member.joined', transaction, { after: { userId: req.user.id, role: membership.role } });
        return { team: { id: team.id, name: team.name }, role: membership.role, created };
      });
      const { created, ...data } = result; return res.status(created ? 201 : 200).json(data);
    }
    const inviteCode = req.body.inviteCode.trim().toUpperCase();
    const team = await db.Team.findOne({ where: { inviteCode } });
    if (!team) return res.status(404).json({ message: 'Invite code is invalid or expired' });
    const [membership, created] = await db.TeamMember.findOrCreate({
      where: { teamId: team.id, userId: req.user.id },
      defaults: { role: WORKSPACE_ROLES.COLLABORATOR }
    });
    res.status(created ? 201 : 200).json({ team: { id: team.id, name: team.name }, role: membership.role });
  } catch (error) {
    logger.error(error);
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Server error' });
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
        inviteCode: req.user.teamRole === WORKSPACE_ROLES.OWNER ? team.inviteCode : undefined,
        governanceEnabled: require('../services/assetEditSessions').enabled(),
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
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Server error' });
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
    const context = await workspaceAudit.ownerContext(db, req, req.user.teamId, transaction);
    const membership = await db.TeamMember.findOne({
      where: { teamId: req.user.teamId, userId: req.params.userId }, transaction, lock: transaction.LOCK.UPDATE
    });
    if (!membership) {
      await rollbackIfActive(transaction);
      return res.status(404).json({ message: 'Team member not found' });
    }
    if (membership.role === WORKSPACE_ROLES.OWNER && role !== WORKSPACE_ROLES.OWNER && await ownerCount(req.user.teamId, transaction) <= 1) {
      await rollbackIfActive(transaction);
      return res.status(400).json({ message: 'A team must have at least one owner' });
    }
    const previousRole = membership.role;
    const member = governanceEnabled() ? await db.User.findByPk(membership.userId, { attributes: ['id', 'username'], transaction }) : null;
    membership.role = role;
    await membership.save({ transaction });
    if (previousRole !== role) await workspaceAudit.record(db, req.user, context?.team, 'member.role_changed', transaction, { actor: context?.actor, before: { userId: membership.userId, role: previousRole }, after: { userId: membership.userId, role }, details: { memberId: membership.userId, memberName: member?.username } });
    await transaction.commit();
    res.json({ message: 'Team role updated', member: { userId: membership.userId, role: membership.role } });
  } catch (error) {
    await rollbackIfActive(transaction);
    logger.error(error);
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Server error' });
  }
};

exports.removeMember = async (req, res) => {
  let transaction;
  try {
    transaction = await db.sequelize.transaction();
    const context = await workspaceAudit.ownerContext(db, req, req.user.teamId, transaction);
    const membership = await db.TeamMember.findOne({
      where: { teamId: req.user.teamId, userId: req.params.userId }, transaction, lock: transaction.LOCK.UPDATE
    });
    if (!membership) {
      await rollbackIfActive(transaction);
      return res.status(404).json({ message: 'Team member not found' });
    }
    if (membership.role === WORKSPACE_ROLES.OWNER && await ownerCount(req.user.teamId, transaction) <= 1) {
      await rollbackIfActive(transaction);
      return res.status(400).json({ message: 'The last owner cannot be removed' });
    }
    const member = governanceEnabled() ? await db.User.findByPk(membership.userId, { attributes: ['id', 'username'], transaction }) : null;
    await membership.destroy({ transaction });
    if (require('../services/assetEditSessions').enabled()) await require('../services/assetLifecycle').holdForUploader(db, membership.userId, req.user.teamId, transaction);
    await workspaceAudit.record(db, req.user, context?.team, 'member.removed', transaction, { actor: context?.actor, before: { userId: membership.userId, role: membership.role }, after: { member: false }, details: { memberId: membership.userId, memberName: member?.username } });
    await transaction.commit();
    res.json({ message: 'Team member removed' });
  } catch (error) {
    await rollbackIfActive(transaction);
    logger.error(error);
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Server error' });
  }
};

exports.regenerateInviteCode = async (req, res) => {
  try {
    if (governanceEnabled()) {
      const inviteCode = await db.sequelize.transaction(async transaction => {
        const { team, actor } = await workspaceAudit.ownerContext(db, req, req.user.teamId, transaction);
        team.inviteCode = await uniqueInviteCode(); await team.save({ transaction });
        await workspaceAudit.record(db, req.user, team, 'workspace.invite_regenerated', transaction, { actor });
        return team.inviteCode;
      });
      return res.json({ inviteCode });
    }
    const team = await db.Team.findByPk(req.user.teamId);
    if (!team) return res.status(404).json({ message: 'Team not found' });
    team.inviteCode = await uniqueInviteCode();
    await team.save();
    res.json({ inviteCode: team.inviteCode });
  } catch (error) {
    logger.error(error);
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Server error' });
  }
};

exports.renameTeam = async (req, res) => {
  try {
    if (governanceEnabled()) {
      const result = await db.sequelize.transaction(async transaction => {
        const { team, actor } = await workspaceAudit.ownerContext(db, req, req.user.workspaceId, transaction);
        if (team.name !== req.body.name) {
          const before = { name: team.name }; team.name = req.body.name; await team.save({ transaction });
          await workspaceAudit.record(db, req.user, team, 'workspace.renamed', transaction, { actor, before, after: { name: team.name } });
        }
        return { team: { id: team.id, name: team.name }, role: actor.teamRole };
      });
      return res.json(result);
    }
    const team = await db.Team.findByPk(req.user.workspaceId);
    if (!team) return res.status(404).json({ message: 'Team not found' });
    if (team.name !== req.body.name) {
      team.name = req.body.name;
      await team.save({ fields: ['name'] });
    }
    res.json({ team: { id: team.id, name: team.name }, role: req.user.teamRole });
  } catch (error) { logger.error(error); res.status(error.status || 500).json({ message: error.status ? error.message : 'Server error' }); }
};
