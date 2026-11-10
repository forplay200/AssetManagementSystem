module.exports = (sequelize, D) => sequelize.define('Notification', {
  id: { type: D.UUID, primaryKey: true, defaultValue: D.UUIDV4 },
  recipientId: { type: D.INTEGER, allowNull: false }, workspaceId: { type: D.INTEGER, allowNull: false },
  type: { type: D.STRING(60), allowNull: false }, cycleId: D.UUID, eventId: D.UUID,
  content: { type: D.JSONB, allowNull: false }, createdAt: { type: D.DATE, allowNull: false, defaultValue: D.NOW }, readAt: D.DATE
}, { timestamps: false });
