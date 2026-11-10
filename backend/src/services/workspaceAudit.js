const { enabled, createEditService, fail } = require('./assetEditSessions');
const { createAuditService } = require('./auditService');
const { WORKSPACE_ROLES } = require('../utils/roles');
async function ownerContext(db, req, teamId, transaction) {
  if (!enabled()) return;
  // Workspace mutations share a row lock, also protecting the last-Owner rule.
  const team = await db.Team.findByPk(teamId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!team) throw fail('NOT_FOUND', 'Workspace not found.', 404);
  const actor = await createEditService(db).actorFor(req.user, { workspaceId: team.id }, transaction, false);
  if (actor.teamRole !== WORKSPACE_ROLES.OWNER) throw fail('PERMISSION_CHANGED', 'Only a current workspace Owner may do this.', 403);
  return { actor, team };
}
async function record(db, user, team, action, transaction, { before, after, details, actor: snapshot } = {}) {
  if (!enabled()) return;
  const actor = snapshot || await createEditService(db).actorFor({ ...user, workspaceId: team.id }, { workspaceId: team.id }, transaction, false);
  return createAuditService(db).append({ workspaceId: team.id, actor, targetName: details?.memberName || (action === 'member.joined' ? actor.username : team.name), action, before, after, details }, transaction);
}
module.exports = { ownerContext, record };
