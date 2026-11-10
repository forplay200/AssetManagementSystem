module.exports = (sequelize, D) => sequelize.define('AuditEvent', {
  id: { type: D.UUID, primaryKey: true, defaultValue: D.UUIDV4 },
  workspaceId: { type: D.INTEGER, allowNull: false }, assetId: D.INTEGER,
  actorId: D.INTEGER, actorRole: D.STRING(40), actorName: D.STRING(200), initiatorId: D.INTEGER,
  uploaderId: D.INTEGER, targetName: D.STRING(200),
  action: { type: D.STRING(80), allowNull: false }, result: { type: D.STRING(20), allowNull: false },
  visibilityClass: { type: D.STRING(20), allowNull: false }, before: D.JSONB, after: D.JSONB, details: D.JSONB,
  correlationId: D.UUID, requestId: D.STRING(100), schemaVersion: { type: D.INTEGER, allowNull: false, defaultValue: 1 },
  occurredAt: { type: D.DATE, allowNull: false, defaultValue: D.NOW }
}, { timestamps: false });
