const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ClipVocabularyEntry } = require('../models');

const VOCABULARY_PATH = process.env.CLIP_VOCABULARY_PATH
  || path.join(__dirname, '../../data/clip-vocabulary.json');
const CLIP_MODEL = 'openai/clip-vit-base-patch32';
const FACETS = new Set(['content', 'form', 'style', 'appearance']);
const MANUAL_ONLY = new Set([
  'enemy', 'npc', 'non-player character', '3d model', 'obj', 'fbx',
  'low-poly', 'mid-poly', 'high-poly', 'audio', 'music', 'sound effect', 'source code',
  'approved', 'pending', 'rejected', 'systemadministrator', 'workspaceowner',
  'workspacemanager', 'collaborator', 'workspace owner', 'workspace manager'
]);
const TEXTURE_APPEARANCE = /\b(red|orange|yellow|green|blue|purple|pink|brown|black|white|grey|gray|silver|golden|wooden|metallic|plastic|leather|transparent|rusty)\b/;
let cachedCore;
let cachedSignature;

function normalizeTagName(value) {
  return typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase() : '';
}

function vocabularyError(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function getVisualAssetType(asset) {
  const extension = path.extname(asset.filename || asset.originalname || '').toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(extension)) return 'image';
  if (['.obj', '.fbx'].includes(extension)) return '3d';
  return null;
}

function loadCoreVocabulary() {
  const stat = fs.statSync(VOCABULARY_PATH);
  const signature = `${stat.mtimeMs}:${stat.size}`;
  if (cachedCore && signature === cachedSignature) return cachedCore;
  const core = JSON.parse(fs.readFileSync(VOCABULARY_PATH, 'utf8'));
  if (core.model !== CLIP_MODEL || !core.version || !core.promptVersion
      || !Array.isArray(core.entries) || !core.promptTemplates?.image || !core.promptTemplates?.['3d']) {
    throw new Error('The CLIP vocabulary must specify the existing model, versions, prompts and entries.');
  }
  const names = new Set();
  const ids = new Set();
  const aliases = new Map();
  for (const entry of core.entries) {
    if (typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)
        || !entry.name || entry.name !== normalizeTagName(entry.name) || MANUAL_ONLY.has(entry.name)
        || names.has(entry.name) || typeof entry.description !== 'string' || !entry.description.trim()
        || entry.description.length > 240 || typeof entry.category !== 'string'
        || !entry.category || entry.category.length > 80 || !FACETS.has(entry.facet)
        || !Array.isArray(entry.assetTypes) || !entry.assetTypes.length
        || entry.assetTypes.some(type => !['image', '3d'].includes(type))
        || !Array.isArray(entry.aliases) || typeof entry.source !== 'string' || !entry.source
        || (entry.requires !== undefined && !Array.isArray(entry.requires))) {
      throw new Error(`Invalid or duplicate CLIP vocabulary entry: ${entry.name || entry.id}`);
    }
    ids.add(entry.id);
    names.add(entry.name);
    for (const value of [entry.name, ...entry.aliases]) {
      const alias = normalizeTagName(value);
      if (!alias || MANUAL_ONLY.has(alias) || (aliases.has(alias) && aliases.get(alias) !== entry.name)) {
        throw new Error(`Ambiguous CLIP vocabulary alias: ${value}`);
      }
      aliases.set(alias, entry.name);
    }
  }
  cachedCore = core;
  cachedSignature = signature;
  return core;
}

async function getWorkspaceEntries(workspaceId, options = {}) {
  if (!workspaceId) return [];
  const records = await ClipVocabularyEntry.findAll({
    where: { workspaceId }, order: [['name', 'ASC']], ...options
  });
  return records.map(record => {
    const value = record.get({ plain: true });
    return {
      id: `workspace:${value.id}`, entryId: value.id, name: value.name,
      aliases: value.aliases, category: value.category, facet: value.facet,
      assetTypes: value.assetTypes, description: value.description,
      source: value.source, scope: 'workspace'
    };
  });
}

async function getVocabularySnapshot(workspaceId, assetType) {
  const core = loadCoreVocabulary();
  const workspaceEntries = await getWorkspaceEntries(workspaceId);
  // A later core release may absorb a workspace concept; the public definition then wins.
  const coreAliases = new Set(core.entries.flatMap(entry => [entry.name, ...entry.aliases]).map(normalizeTagName));
  const entries = [
    ...core.entries.map(entry => ({ ...entry, scope: 'core' })),
    ...workspaceEntries.filter(entry => !coreAliases.has(entry.name))
  ].filter(entry => !assetType || entry.assetTypes.includes(assetType));
  const snapshot = {
    model: core.model, version: core.version, promptVersion: core.promptVersion,
    promptTemplates: core.promptTemplates, assetType, entries
  };
  snapshot.revision = crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return snapshot;
}

function findVocabularyEntry(entries, value) {
  const name = normalizeTagName(value);
  return entries.find(entry => [entry.name, ...entry.aliases].some(alias => normalizeTagName(alias) === name));
}

async function canonicalizeTagName(workspaceId, value) {
  const name = normalizeTagName(value);
  const core = loadCoreVocabulary();
  const coreEntry = findVocabularyEntry(core.entries, name);
  if (coreEntry) return coreEntry.name;
  const customEntry = findVocabularyEntry(await getWorkspaceEntries(workspaceId), name);
  return customEntry?.name || name;
}

function prepareWorkspaceEntry(input, fallbackAssetType) {
  const name = normalizeTagName(input.name);
  if (!name || name.length > 80 || !/^[a-z][a-z0-9]*(?:[ -][a-z0-9]+)*$/.test(name)) {
    throw vocabularyError('Use an English visual concept of up to 80 characters.');
  }
  if (MANUAL_ONLY.has(name)) {
    throw vocabularyError('This label describes a game role, file property or management status. Keep it as a repository tag.');
  }
  const facet = input.facet || 'content';
  if (!FACETS.has(facet)) throw vocabularyError('Choose content, form, style or appearance.');
  const requestedTypes = input.assetTypes || [fallbackAssetType];
  if (!Array.isArray(requestedTypes)) throw vocabularyError('Asset types must be an array.');
  const assetTypes = [...new Set(requestedTypes)].sort();
  if (!assetTypes.length
      || assetTypes.some(type => !['image', '3d'].includes(type))) {
    throw vocabularyError('Choose image and/or 3d as the applicable asset types.');
  }
  const description = typeof input.description === 'string' && input.description.trim()
    ? input.description.trim().replace(/\s+/g, ' ')
    : `a ${name}`;
  if (description.length > 240) throw vocabularyError('The visual description must be 240 characters or fewer.');
  if (assetTypes.includes('3d') && (facet !== 'content' || TEXTURE_APPEARANCE.test(`${name} ${description}`.toLowerCase()))) {
    throw vocabularyError('3D vocabulary currently supports objects and shapes. Add colour, material and style concepts for images only until textured rendering is available.');
  }
  const category = typeof input.category === 'string' ? normalizeTagName(input.category) : 'workspace-custom';
  if (!category || category.length > 80) throw vocabularyError('The category must contain 1 to 80 characters.');
  if (input.aliases !== undefined && !Array.isArray(input.aliases)) throw vocabularyError('Aliases must be an array of names.');
  const aliases = [...new Set((input.aliases || []).map(normalizeTagName))].filter(alias => alias && alias !== name);
  if (aliases.length > 10 || aliases.some(alias => alias.length > 80
      || !/^[a-z][a-z0-9]*(?:[ -][a-z0-9]+)*$/.test(alias) || MANUAL_ONLY.has(alias))) {
    throw vocabularyError('Provide at most 10 English visual aliases, each up to 80 characters.');
  }
  return { name, aliases, category, facet, assetTypes, description, source: 'workspace-user' };
}

module.exports = {
  canonicalizeTagName, findVocabularyEntry, getVisualAssetType, getVocabularySnapshot,
  getWorkspaceEntries, loadCoreVocabulary, normalizeTagName, prepareWorkspaceEntry, vocabularyError
};
