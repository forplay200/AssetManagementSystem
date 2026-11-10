const { Asset, ClipVocabularyEntry, sequelize } = require('../models');
const { belongsToWorkspace } = require('../utils/workspaceScope');
const { WORKSPACE_ROLES } = require('../utils/roles');
const logger = require('../utils/logger');
const {
  findVocabularyEntry, getVisualAssetType, getVocabularySnapshot, getWorkspaceEntries,
  loadCoreVocabulary, normalizeTagName, prepareWorkspaceEntry, vocabularyError
} = require('../utils/clipVocabulary');

function canManageVocabulary(req, asset) {
  return belongsToWorkspace(asset, req.user)
    && [WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.MANAGER].includes(req.user.teamRole);
}

function handleError(res, error) {
  if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
  if (error.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ message: 'That visual concept already exists in this workspace.' });
  }
  logger.error(error);
  return res.status(500).json({ message: 'The visual vocabulary could not be updated.' });
}

exports.getAssetVocabulary = async (req, res) => {
  try {
    const asset = await Asset.findByPk(req.params.assetId);
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    if (!belongsToWorkspace(asset, req.user)) return res.status(403).json({ message: 'Forbidden' });
    const assetType = getVisualAssetType(asset);
    if (!assetType) return res.status(400).json({ message: 'Visual vocabulary applies to images and 3D models.' });
    res.json({ assetId: asset.id, vocabulary: await getVocabularySnapshot(asset.workspaceId, assetType) });
  } catch (error) { handleError(res, error); }
};

exports.approveVocabularyEntry = async (req, res) => {
  try {
    const asset = await Asset.findByPk(req.params.assetId);
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    if (!canManageVocabulary(req, asset)) return res.status(403).json({ message: 'Forbidden' });
    const assetType = getVisualAssetType(asset);
    if (!assetType) throw vocabularyError('Visual vocabulary applies to images and 3D models.');
    const input = req.body || {};
    if (input.confirmed !== true) throw vocabularyError('Confirm that this label describes visually identifiable content.');
    const requestedTypes = input.assetTypes === undefined ? [assetType] : input.assetTypes;
    if (!Array.isArray(requestedTypes) || !requestedTypes.includes(assetType)
        || requestedTypes.some(type => !['image', '3d'].includes(type))) {
      throw vocabularyError('Choose valid asset types and include the current asset type.');
    }

    const coreEntry = findVocabularyEntry(loadCoreVocabulary().entries, input.name);
    if (coreEntry) {
      if (requestedTypes.some(type => !coreEntry.assetTypes.includes(type))) {
        throw vocabularyError('This core concept does not apply to all selected asset types.');
      }
      return res.json({ message: 'This concept is already in the core vocabulary.', entry: { ...coreEntry, scope: 'core' } });
    }

    const entry = await sequelize.transaction(async transaction => {
      // Serialise alias checks within a workspace, including concurrent approvals.
      await sequelize.query('SELECT pg_advisory_xact_lock(:namespace, :workspaceId)', {
        replacements: { namespace: 1129070934, workspaceId: Number(asset.workspaceId) }, transaction
      });
      const existingEntries = await getWorkspaceEntries(asset.workspaceId, { transaction });
      const existing = findVocabularyEntry(existingEntries, input.name);
      if (existing) {
        const record = await ClipVocabularyEntry.findOne({
          where: { id: existing.entryId, workspaceId: asset.workspaceId }, transaction
        });
        if (requestedTypes.some(type => !existing.assetTypes.includes(type))) {
          const extended = prepareWorkspaceEntry({ ...existing, assetTypes: [...existing.assetTypes, ...requestedTypes] }, assetType);
          await record.update({ assetTypes: extended.assetTypes, approvedBy: req.user.id }, { transaction });
        }
        return record;
      }

      const values = prepareWorkspaceEntry(input, assetType);
      if (!values.assetTypes.includes(assetType)) throw vocabularyError('Include the current asset type when approving a concept.');
      const allEntries = [...loadCoreVocabulary().entries, ...existingEntries];
      for (const name of [values.name, ...values.aliases]) {
        if (findVocabularyEntry(allEntries, name)) {
          throw Object.assign(vocabularyError(`“${normalizeTagName(name)}” already names another visual concept.`), { statusCode: 409 });
        }
      }
      if (existingEntries.length >= 256) throw vocabularyError('A workspace supports up to 256 custom visual concepts. Remove an unused concept before adding another.');
      return ClipVocabularyEntry.create({ ...values, workspaceId: asset.workspaceId, approvedBy: req.user.id }, { transaction });
    });
    const value = entry.get({ plain: true });
    res.json({ message: 'Visual concept approved for future suggestions.', entry: {
      id: `workspace:${value.id}`, entryId: value.id, name: value.name, aliases: value.aliases,
      category: value.category, facet: value.facet, assetTypes: value.assetTypes,
      description: value.description, source: value.source, scope: 'workspace'
    } });
  } catch (error) { handleError(res, error); }
};

exports.removeVocabularyEntry = async (req, res) => {
  try {
    const asset = await Asset.findByPk(req.params.assetId);
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    if (!canManageVocabulary(req, asset)) return res.status(403).json({ message: 'Forbidden' });
    if (!/^[1-9]\d*$/.test(req.params.entryId)) throw vocabularyError('Only workspace vocabulary entries can be removed.');
    const deleted = await sequelize.transaction(async transaction => {
      await sequelize.query('SELECT pg_advisory_xact_lock(:namespace, :workspaceId)', {
        replacements: { namespace: 1129070934, workspaceId: Number(asset.workspaceId) }, transaction
      });
      return ClipVocabularyEntry.destroy({
        where: { id: req.params.entryId, workspaceId: asset.workspaceId }, transaction
      });
    });
    if (!deleted) return res.status(404).json({ message: 'Visual concept not found in this workspace.' });
    res.json({ message: 'Removed from future suggestions. Existing repository tags are preserved.' });
  } catch (error) { handleError(res, error); }
};
