module.exports = (sequelize, D) => sequelize.define('AssetAiJob', {
  id: { type: D.UUID, primaryKey: true }, assetId: { type: D.INTEGER, allowNull: false },
  workspaceId: { type: D.INTEGER, allowNull: false }, sourceFilename: { type: D.STRING, allowNull: false },
  jobType: { type: D.STRING, allowNull: false, defaultValue: 'video_visual_tags' }, requestedBy: D.INTEGER,
  status: { type: D.STRING, allowNull: false }, stage: D.STRING,
  attempt: { type: D.INTEGER, allowNull: false, defaultValue: 0 }, leaseToken: D.UUID,
  leaseExpiresAt: D.DATE, startedAt: D.DATE, finishedAt: D.DATE, dispatchedAt: D.DATE,
  input: { type: D.JSONB, allowNull: false }, output: D.JSONB, errorCode: D.STRING, errorMessage: D.STRING(500)
}, { indexes: [{ fields: ['assetId'] }, { fields: ['status', 'leaseExpiresAt'] }] });
