module.exports = (sequelize, D) => sequelize.define('AssetPurgeJob', {
  id: { type: D.UUID, primaryKey: true, defaultValue: D.UUIDV4 },
  cycleId: { type: D.UUID, allowNull: false, unique: true }, status: { type: D.STRING(20), allowNull: false },
  leaseToken: D.UUID, leaseExpiresAt: D.DATE, nextAttemptAt: D.DATE,
  attempts: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
  objects: D.JSONB, completedObjects: D.JSONB, lastError: D.STRING(1000)
}, { timestamps: true });
