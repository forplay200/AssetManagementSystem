'use strict';

// Additive and repeatable: existing assets receive a baseline, never invented history.
module.exports = {
  async up(q, S) {
    const tables = (await q.showAllTables()).map(t => typeof t === 'string' ? t : t.tableName);
    for (const [table, fields] of Object.entries({
      Assets: {
        lifecycleState: { type: S.STRING(20), allowNull: false, defaultValue: 'active' },
        revision: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
        contentVersionId: { type: S.UUID, allowNull: true },
        aiRequestContext: { type: S.JSONB, allowNull: true }, pendingAiResult: { type: S.JSONB, allowNull: true }
      },
      Versions: { contentVersionId: { type: S.UUID }, baseContentVersionId: { type: S.UUID }, submittedBy: { type: S.INTEGER }, submittedAt: { type: S.DATE } }
    })) {
      if (!tables.includes(table)) continue;
      const columns = await q.describeTable(table);
      for (const [name, definition] of Object.entries(fields)) if (!columns[name]) await q.addColumn(table, name, definition);
    }
    const id = () => ({ type: S.UUID, primaryKey: true, allowNull: false });
    const required = type => ({ type, allowNull: false });
    const definitions = {
      AuditEvents: {
        id: id(), workspaceId: required(S.INTEGER), assetId: S.INTEGER,
        actorId: S.INTEGER, actorRole: S.STRING(40), actorName: S.STRING(200),
        initiatorId: S.INTEGER, uploaderId: S.INTEGER, targetName: S.STRING(200),
        action: required(S.STRING(80)), result: required(S.STRING(20)),
        visibilityClass: required(S.STRING(20)), before: S.JSONB, after: S.JSONB,
        details: S.JSONB, correlationId: S.UUID, requestId: S.STRING(100),
        schemaVersion: { type: S.INTEGER, allowNull: false, defaultValue: 1 }, occurredAt: required(S.DATE)
      },
      AssetEditSessions: {
        id: id(), assetId: { type: S.INTEGER, allowNull: false, unique: true }, workspaceId: required(S.INTEGER),
        holderUserId: required(S.INTEGER), tokenHash: required(S.STRING(64)),
        baseRevision: required(S.INTEGER), baseContentVersionId: S.UUID,
        acquiredAt: required(S.DATE), heartbeatAt: required(S.DATE), expiresAt: required(S.DATE)
      },
      AssetTrashCycles: {
        id: id(), assetId: required(S.INTEGER), workspaceId: required(S.INTEGER), uploaderId: required(S.INTEGER),
        targetName: required(S.STRING(200)), deletedBy: required(S.INTEGER), reason: S.STRING(1000),
        deletedAt: required(S.DATE), purgeAfter: required(S.DATE), status: required(S.STRING(20)),
        restoredAt: S.DATE, restoredBy: S.INTEGER, holdReason: S.STRING(200)
      },
      Notifications: {
        id: id(), recipientId: required(S.INTEGER), workspaceId: required(S.INTEGER),
        type: required(S.STRING(60)), cycleId: S.UUID, eventId: S.UUID,
        content: required(S.JSONB), createdAt: required(S.DATE), readAt: S.DATE
      },
      AssetPurgeJobs: {
        id: id(), cycleId: { type: S.UUID, allowNull: false, unique: true },
        status: required(S.STRING(20)), leaseToken: S.UUID, leaseExpiresAt: S.DATE,
        nextAttemptAt: S.DATE, attempts: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
        objects: S.JSONB, completedObjects: S.JSONB, lastError: S.STRING(1000),
        createdAt: required(S.DATE), updatedAt: required(S.DATE)
      }
    };
    for (const [table, fields] of Object.entries(definitions)) {
      if (!tables.includes(table)) await q.createTable(table, fields);
    }
    for (const [table, name, fields] of [
      ['AuditEvents', 'audit_workspace_time', ['workspaceId', 'occurredAt', 'id']],
      ['AuditEvents', 'audit_asset_time', ['workspaceId', 'assetId', 'occurredAt', 'id']],
      ['AssetTrashCycles', 'trash_due', ['status', 'purgeAfter']],
      ['Notifications', 'notification_recipient_time', ['recipientId', 'createdAt']],
      ['AssetPurgeJobs', 'purge_due', ['status', 'nextAttemptAt']]
    ]) {
      const indexes = await q.showIndex(table);
      if (!indexes.some(index => index.name === name)) await q.addIndex(table, fields, { name });
    }
  },
  async down() {
    // A schema rollback would discard audit history and recycle-bin state.
    throw new Error('Asset governance requires a reviewed forward migration; automatic destructive rollback is disabled.');
  }
};
