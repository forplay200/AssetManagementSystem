'use strict';
const { randomUUID } = require('node:crypto');
const { createAuditService } = require('./auditService');
const { createLifecycleService, RETENTION_MS } = require('./assetLifecycle');
const { enabled, fail } = require('./assetEditSessions');
const LEASE_MS = 120000;
const keysOf = record => [...new Set([record.filename || record.fileName, ...(record.packageManifest?.files || []).map(f => f.objectKey)].filter(Boolean))];

function createPurgeService(db, storage, clock = () => new Date()) {
  const { Op } = db.Sequelize;
  const audit = createAuditService(db);
  const lifecycle = createLifecycleService(db, clock);
  const event = (asset, action, cycle, transaction, details = {}) => audit.append({ workspaceId: asset.workspaceId, asset, action, details: { cycleId: cycle.id, ...details } }, transaction);
  async function claimTransaction(cycleId, { allowPurge = true } = {}) {
    const candidate = await db.AssetTrashCycle.findByPk(cycleId);
    if (!candidate) return null;
    return db.sequelize.transaction(async transaction => {
      const asset = await db.Asset.findByPk(candidate.assetId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!asset) return null;
      const cycle = await db.AssetTrashCycle.findByPk(cycleId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!cycle || !['trashed', 'purging'].includes(cycle.status)) return null;
      let job = await db.AssetPurgeJob.findOne({ where: { cycleId }, transaction, lock: transaction.LOCK.UPDATE });
      if (cycle.status === 'trashed') {
        if (asset.lifecycleState !== 'trashed') return null;
        const account = await db.User.findByPk(cycle.uploaderId, { transaction });
        const membership = await db.TeamMember.findOne({ where: { teamId: cycle.workspaceId, userId: cycle.uploaderId }, transaction });
        const available = account?.isActive === true && account.role !== 'systemAdministrator' && Boolean(membership);
        if (!available) {
          if (!cycle.holdReason) { cycle.holdReason = 'UPLOADER_UNAVAILABLE'; await cycle.save({ transaction }); await event(asset, 'asset.purge_paused', cycle, transaction, { reason: cycle.holdReason }); }
          return null;
        }
        if (cycle.holdReason) {
          cycle.holdReason = null; cycle.purgeAfter = new Date(clock().getTime() + RETENTION_MS); await cycle.save({ transaction });
          const notice = await event(asset, 'asset.purge_rescheduled', cycle, transaction, { purgeAfter: cycle.purgeAfter });
          await lifecycle.notify(cycle.uploaderId, cycle, notice, 'asset.trashed', transaction); return null;
        }
        if (!allowPurge || new Date(cycle.purgeAfter) > clock()) return null;
        if (job?.nextAttemptAt && new Date(job.nextAttemptAt) > clock()) return null;
        const versions = await db.Version.findAll({ where: { assetId: asset.id }, transaction });
        const aiJobs = await db.AssetAiJob.findAll({ where: { assetId: asset.id }, transaction });
        const objects = new Set([...keysOf(asset), ...versions.flatMap(keysOf), ...aiJobs.map(j => j.sourceFilename), ...aiJobs.flatMap(j => (j.output?.frames || []).map(f => f.key))].filter(Boolean));
        // Include abandoned backend evidence uploads, not just successful job output.
        for (const ai of aiJobs) for (const key of await storage.listKeys(`video-jobs/${ai.id}/`)) objects.add(key);
        const manifest = { status: 'processing', objects: [...objects], completedObjects: [], nextAttemptAt: null };
        if (job) await job.update(manifest, { transaction });
        else job = await db.AssetPurgeJob.create({ id: randomUUID(), cycleId, ...manifest, attempts: 0 }, { transaction });
        cycle.status = 'purging'; asset.lifecycleState = 'purging'; asset.revision += 1;
        await cycle.save({ transaction }); await asset.save({ transaction });
        await event(asset, 'asset.purge_started', cycle, transaction);
      }
      if (!allowPurge || asset.lifecycleState !== 'purging' || !job || job.status === 'completed') return null;
      if (job.leaseToken && new Date(job.leaseExpiresAt) > clock()) return null;
      if (job.nextAttemptAt && new Date(job.nextAttemptAt) > clock()) return null;
      const token = randomUUID();
      await job.update({ status: 'processing', attempts: job.attempts + 1, leaseToken: token, leaseExpiresAt: new Date(clock().getTime() + LEASE_MS), nextAttemptAt: null }, { transaction });
      return { assetId: asset.id, cycleId, jobId: job.id, token };
    });
  }
  async function claim(cycleId, options = {}) {
    try { return await claimTransaction(cycleId, options); }
    catch (error) {
      // Listing objects can fail before any deletion begins. Persist a visible retry state.
      const candidate = await db.AssetTrashCycle.findByPk(cycleId);
      if (candidate && options.allowPurge !== false) await db.sequelize.transaction(async transaction => {
        const asset = await db.Asset.findByPk(candidate.assetId, { transaction, lock: transaction.LOCK.UPDATE });
        const cycle = await db.AssetTrashCycle.findByPk(cycleId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!asset || asset.lifecycleState !== 'trashed' || cycle?.status !== 'trashed' || new Date(cycle.purgeAfter) > clock()) return;
        const job = await db.AssetPurgeJob.findOne({ where: { cycleId }, transaction, lock: transaction.LOCK.UPDATE });
        const attempts = (job?.attempts || 0) + 1;
        const values = { status: 'failed', attempts, leaseToken: null, leaseExpiresAt: null, lastError: 'Cleanup preparation failed; a retry is scheduled.', nextAttemptAt: new Date(clock().getTime() + Math.min(3600000, 60000 * 2 ** Math.min(attempts, 6))) };
        if (job) await job.update(values, { transaction });
        else await db.AssetPurgeJob.create({ id: randomUUID(), cycleId, objects: [], completedObjects: [], ...values }, { transaction });
        await event(asset, 'asset.purge_failed', cycle, transaction, { stage: 'preparing', attempts });
      });
      throw error;
    }
  }
  async function locked(claimed, action) {
    return db.sequelize.transaction(async transaction => {
      const asset = await db.Asset.findByPk(claimed.assetId, { transaction, lock: transaction.LOCK.UPDATE });
      const cycle = await db.AssetTrashCycle.findByPk(claimed.cycleId, { transaction, lock: transaction.LOCK.UPDATE });
      const job = await db.AssetPurgeJob.findByPk(claimed.jobId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!asset || asset.lifecycleState !== 'purging' || cycle?.status !== 'purging' || job?.status !== 'processing' || job.leaseToken !== claimed.token || new Date(job.leaseExpiresAt) <= clock()) throw fail('PURGE_LEASE_LOST', 'This cleanup lease is no longer valid.');
      await job.update({ leaseExpiresAt: new Date(clock().getTime() + LEASE_MS) }, { transaction });
      return action(asset, cycle, job, transaction);
    });
  }
  async function referencedElsewhere(key, assetId, transaction) {
    // Immutable files can be shared by historical snapshots. Do not delete their objects.
    const packageReference = { packageManifest: { [Op.contains]: { files: [{ objectKey: key }] } } };
    return Boolean(await db.Asset.findOne({ where: { id: { [Op.ne]: assetId }, lifecycleState: { [Op.ne]: 'purging' }, [Op.or]: [{ filename: key }, packageReference] }, attributes: ['id'], transaction })
      || await db.Version.findOne({ where: { assetId: { [Op.ne]: assetId }, [Op.or]: [{ fileName: key }, packageReference] }, attributes: ['id'],
        include: [{ model: db.Asset, as: 'asset', required: true, attributes: [], where: { lifecycleState: { [Op.ne]: 'purging' } } }], transaction }));
  }
  async function run(claimed) {
    if (!claimed) return false;
    try {
      const initial = await db.AssetPurgeJob.findByPk(claimed.jobId);
      for (const key of initial.objects) await locked(claimed, async (asset, _cycle, job, transaction) => {
        if ((job.completedObjects || []).includes(key)) return;
        if (!await referencedElsewhere(key, asset.id, transaction)) await storage.remove(key);
        await job.update({ completedObjects: [...(job.completedObjects || []), key] }, { transaction });
      });
      await locked(claimed, async (asset, cycle, job, transaction) => {
        if (job.objects.some(key => !job.completedObjects.includes(key))) throw new Error('Cleanup manifest is incomplete.');
        await db.Version.destroy({ where: { assetId: asset.id }, transaction });
        await db.Comment.destroy({ where: { assetId: asset.id }, transaction });
        await db.AssetAiJob.destroy({ where: { assetId: asset.id }, transaction });
        await db.AssetEditSession.destroy({ where: { assetId: asset.id }, transaction });
        if (typeof asset.setTags === 'function') await asset.setTags([], { transaction });
        await event(asset, 'asset.purge_completed', cycle, transaction);
        await asset.destroy({ transaction });
        await cycle.update({ status: 'purged', holdReason: null }, { transaction });
        await job.update({ status: 'completed', leaseToken: null, leaseExpiresAt: null, lastError: null }, { transaction });
      });
      return true;
    } catch (error) {
      if (error.code === 'PURGE_LEASE_LOST') return false;
      await locked(claimed, async (asset, cycle, job, transaction) => {
        await job.update({ status: 'failed', lastError: 'Object cleanup failed; a retry is scheduled.', leaseToken: null, leaseExpiresAt: null, nextAttemptAt: new Date(clock().getTime() + Math.min(3600000, 60000 * 2 ** Math.min(job.attempts, 6))) }, { transaction });
        await event(asset, 'asset.purge_failed', cycle, transaction, { attempts: job.attempts });
      }).catch(leaseError => { if (leaseError.code !== 'PURGE_LEASE_LOST') throw leaseError; });
      return false;
    }
  }
  async function tick(options) {
    // Round-robin all pending cycles, including uploader holds, without starving later pages.
    let lastId = null;
    for (;;) {
      const where = { status: { [Op.in]: ['trashed', 'purging'] }, ...(lastId ? { id: { [Op.gt]: lastId } } : {}) };
      const cycles = await db.AssetTrashCycle.findAll({ where, order: [['id', 'ASC']], limit: 50, attributes: ['id'] });
      if (!cycles.length) break;
      for (const cycle of cycles) {
        try { const claimed = await claim(cycle.id, options); if (claimed) await run(claimed); }
        catch (error) { require('../utils/logger').error(error); }
      }
      lastId = cycles[cycles.length - 1].id;
    }
  }
  return { claim, run, tick };
}
function startRecovery() {
  if (!enabled()) return;
  const db = require('../models'); const { minioClient, BUCKET_NAME } = require('../utils/minioClient');
  const service = createPurgeService(db, {
    remove: key => minioClient.removeObject(BUCKET_NAME, key),
    async listKeys(prefix) { const keys = []; for await (const item of minioClient.listObjectsV2(BUCKET_NAME, prefix, true)) keys.push(item.name); return keys; }
  });
  let running = false;
  const work = async () => { if (running) return; running = true; try { await service.tick({ allowPurge: process.env.ASSET_PURGE_ENABLED === 'true' }); } catch (error) { require('../utils/logger').error(error); } finally { running = false; } };
  const timer = setInterval(work, 60000); timer.unref(); work();
}
module.exports = { createPurgeService, keysOf, startRecovery };
