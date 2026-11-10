module.exports = (sequelize, D) => sequelize.define('AssetTrashCycle', {
  id: { type: D.UUID, primaryKey: true, defaultValue: D.UUIDV4 },
  assetId: { type: D.INTEGER, allowNull: false }, workspaceId: { type: D.INTEGER, allowNull: false },
  uploaderId: { type: D.INTEGER, allowNull: false }, targetName: { type: D.STRING(200), allowNull: false },
  deletedBy: { type: D.INTEGER, allowNull: false }, reason: D.STRING(1000),
  deletedAt: { type: D.DATE, allowNull: false }, purgeAfter: { type: D.DATE, allowNull: false },
  status: { type: D.STRING(20), allowNull: false }, restoredAt: D.DATE, restoredBy: D.INTEGER, holdReason: D.STRING(200)
}, { timestamps: false });
