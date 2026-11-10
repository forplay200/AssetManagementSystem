module.exports = (sequelize, D) => sequelize.define('AssetEditSession', {
  id: { type: D.UUID, primaryKey: true, defaultValue: D.UUIDV4 },
  assetId: { type: D.INTEGER, allowNull: false, unique: true }, workspaceId: { type: D.INTEGER, allowNull: false },
  holderUserId: { type: D.INTEGER, allowNull: false }, tokenHash: { type: D.STRING(64), allowNull: false },
  baseRevision: { type: D.INTEGER, allowNull: false }, baseContentVersionId: D.UUID,
  acquiredAt: { type: D.DATE, allowNull: false }, heartbeatAt: { type: D.DATE, allowNull: false },
  expiresAt: { type: D.DATE, allowNull: false }
}, { timestamps: false });
