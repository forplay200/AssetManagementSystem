import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCircle2, Edit3, FileText, Hash, LoaderCircle, Plus, RefreshCw, Save, Sparkles, Tag, Trash2, X } from 'lucide-react';
import { getApiError } from '../../services/api';
import { assetService } from '../../services/assetService';
import VisualVocabulary from './VisualVocabulary';
import ExpandableText from '../common/ExpandableText';
import ExpandableList from '../common/ExpandableList';
import useConfirmation from '../../hooks/useConfirmation';
import { useUnsavedChanges } from '../../context/UnsavedChangesContext';

const getVisualType = (filename, aiType) => {
  if (/\.(png|jpe?g|gif|webp)$/i.test(filename || '')) return 'image';
  if (/\.(obj|fbx)$/i.test(filename || '')) return '3d';
  return ['image', '3d'].includes(aiType) ? aiType : null;
};

const makeRows = (metadata) => Object.entries(metadata || {})
  .filter(([key, value]) => key !== 'ai' && value !== null && !['object', 'undefined'].includes(typeof value))
  .map(([key, value], index) => ({ id: `${key}-${index}`, key, value: String(value), originalType: typeof value }));

const restoreType = (row) => {
  if (row.originalType === 'number' && row.value.trim() !== '' && Number.isFinite(Number(row.value))) return Number(row.value);
  if (row.originalType === 'boolean') return row.value.trim().toLowerCase() === 'true';
  return row.value.trim();
};

export default function MetadataPanel({ assetId, assetFilename, metadata, repositoryTags, canEdit, canManageVocabulary = false, active = true, onMetadataChange, onTagsChange }) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(() => makeRows(metadata));
  const [saving, setSaving] = useState(false);
  const [tagsLocked, setTagsLocked] = useState(false);
  const inspector = useRef(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  const { confirm, confirmation } = useConfirmation();
  const dirty = editing && JSON.stringify(rows) !== JSON.stringify(makeRows(metadata));
  useUnsavedChanges(dirty, 'Metadata fields', saving);

  useEffect(() => { if (!editing) setRows(makeRows(metadata)); }, [metadata, editing]);
  useEffect(() => {
    if (!active) return undefined;
    // Leave room for the title and tabs on the first screen, even before sticky positioning starts.
    const measure = () => {
      if (!inspector.current || !inspector.current.getBoundingClientRect().width) return;
      const top = inspector.current.parentElement.getBoundingClientRect().top + window.scrollY;
      inspector.current.style.setProperty('--inspector-offset', `${Math.max(88, Math.min(top, window.innerHeight - 256))}px`);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [assetId, active]);

  const save = async () => {
    if (saving || !canEdit) return;
    const populated = rows.filter((row) => row.key.trim());
    const keys = populated.map((row) => row.key.trim());
    if (new Set(keys).size !== keys.length || keys.includes('ai')) {
      setMessage({ type: 'error', text: 'Metadata field names must be unique. The name “ai” is reserved.' });
      return;
    }
    const deleted = makeRows(metadata).filter(row => !keys.includes(row.key));
    if (deleted.length && !await confirm({ title: 'Remove metadata fields?', description: `${deleted.length} existing field(s) will be removed when you save.`, details: deleted.map(row => row.key).join(', '), confirmLabel: 'Save changes' })) return;
    const preserved = Object.fromEntries(Object.entries(metadata || {}).filter(([key, value]) => key === 'ai' || value === null || typeof value === 'object'));
    const nextMetadata = { ...preserved, ...Object.fromEntries(populated.map((row) => [row.key.trim(), restoreType(row)])) };
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const response = await assetService.updateMetadata(assetId, nextMetadata);
      onMetadataChange(response.metadata);
      setEditing(false);
      setMessage({ type: 'success', text: 'Metadata saved successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: getApiError(error, 'Metadata could not be saved.') });
    } finally { setSaving(false); }
  };

  const cancel = async () => {
    if (dirty && !await confirm({ title: 'Discard metadata changes?', description: 'Your unsaved field changes will be lost.', confirmLabel: 'Discard changes', cancelLabel: 'Keep editing' })) return;
    setRows(makeRows(metadata)); setEditing(false); setMessage({ type: '', text: '' });
  };

  return (
    <aside ref={inspector} className="metadata-inspector" aria-label="Asset information"><div className="inspector-scroll space-y-5" tabIndex={0} role="region" aria-label="Metadata and AI results">
      <section className="panel p-5">
        <div className="section-title"><FileText size={16} /> Metadata<div className="ml-auto flex gap-2">{canEdit && !editing && <button className="icon-action" onClick={() => setEditing(true)} disabled={tagsLocked} aria-label="Edit metadata" title="Edit metadata"><Edit3 size={14} /></button>}{editing && <><button className="icon-action" onClick={cancel} disabled={saving} aria-label="Cancel metadata changes"><X size={14} /></button><button className="icon-action icon-action-primary" onClick={save} disabled={saving || !canEdit} aria-label="Save metadata">{saving ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}</button></>}</div></div>
        {tagsLocked && !editing && <p className="mt-3 text-xs text-zinc-400">Finish your tag changes before editing metadata fields.</p>}
        {message.text && <div role={message.type === "error" ? "alert" : "status"} className={`mt-4 rounded border px-3 py-2 text-xs ${message.type === 'error' ? 'border-red-400/20 bg-red-400/10 text-red-200' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'}`}>{message.text}</div>}
        {editing ? <fieldset disabled={saving || !canEdit} className="mt-4 space-y-3">{rows.map((row) => <div key={row.id} className="grid grid-cols-[minmax(0,.7fr)_minmax(0,1fr)_44px] gap-2"><input className="input h-9 min-w-0 font-mono text-xs" value={row.key} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, key: event.target.value } : item))} placeholder="field_name" aria-label="Metadata field name" /><input className="input h-9 min-w-0" value={row.value} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, value: event.target.value } : item))} placeholder="Value" aria-label="Metadata value" /><button className="icon-action hover:text-red-300" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} aria-label="Remove metadata field"><Trash2 size={14} /></button></div>)}<button className="secondary-button mt-1" onClick={() => setRows((current) => [...current, { id: `${Date.now()}-${current.length}`, key: '', value: '', originalType: 'string' }])}><Plus size={14} /> Add field</button><div className="editor-actions"><button type="button" className="secondary-button" onClick={cancel}>Cancel</button><button type="button" className="primary-button" onClick={save} disabled={saving}><Save size={15} />{saving ? "Saving…" : "Save changes"}</button></div></fieldset> : <MetadataReadout rows={rows} />}
        {!canEdit && <p className="mt-4 border-t border-white/[0.06] pt-3 text-xs text-zinc-400">Only the uploader or a workspace owner can modify this asset.</p>}
      </section>
      <AiEnrichment assetId={assetId} assetFilename={assetFilename} metadata={metadata} repositoryTags={repositoryTags} canEdit={canEdit && !editing} canManageVocabulary={canManageVocabulary && !editing && !saving} locked={editing || saving} onEditingChange={setTagsLocked} onMetadataChange={onMetadataChange} onTagsChange={onTagsChange} />
    </div>{confirmation}</aside>
  );
}

function MetadataReadout({ rows }) {
  return rows.length ? <div className="mt-4"><ExpandableList items={rows} label="fields" className="divide-y divide-white/[0.06]" renderItem={row => <dl key={row.id} className="grid grid-cols-[minmax(0,.7fr)_minmax(0,1fr)] gap-4 py-3 text-sm"><dt className="break-words text-sm font-medium text-zinc-400">{row.key}</dt><dd className="min-w-0"><ExpandableText value={row.value} label={row.key} lines={4} /></dd></dl>} /></div> : <p className="mt-4 text-sm text-zinc-400">No custom metadata has been added.</p>;
}

function AiEnrichment({ assetId, assetFilename, metadata, repositoryTags, canEdit, canManageVocabulary, locked, onEditingChange, onMetadataChange, onTagsChange }) {
  const ai = useMemo(() => metadata?.ai || {}, [metadata]);
  const visualAssetType = getVisualType(assetFilename, ai.type);
  const collections = useMemo(() => [
    ['imageTags', 'Generated image tags', Tag],
    ['modelTags', 'Generated Model Tags', Tag],
    ['semanticTags', 'CLIP Semantic Tags', Sparkles],
    ['audioTags', 'Generated audio tags', Tag],
    ['tags', 'Generated tags', Tag],
    ['keywords', 'AI keywords', Hash],
  ].filter(([key]) => Array.isArray(ai[key]) && ai[key].length), [ai]);
  const [busy, setBusy] = useState('');
  const [editingTag, setEditingTag] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [newTag, setNewTag] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const { confirm, confirmation } = useConfirmation();
  useUnsavedChanges(Boolean(newTag.trim() || editingTag), 'Asset tags', Boolean(busy));
  useEffect(() => { onEditingChange(Boolean(busy || editingTag || newTag.trim())); }, [busy, editingTag, newTag, onEditingChange]);
  const cancelTagEdit = async () => {
    const original = collections.flatMap(([key]) => ai[key].map((value, index) => ({ operation: `${key}-${index}`, value }))).find(tag => tag.operation === editingTag)?.value;
    if (editValue !== original && !await confirm({ title: 'Discard tag changes?', description: 'Your unsaved tag text will be lost.', confirmLabel: 'Discard changes', cancelLabel: 'Keep editing' })) return;
    setEditingTag(null);
  };

  const updateCollection = async (key, values, operation) => {
    setBusy(operation);
    setMessage({ type: '', text: '' });
    try {
      const response = await assetService.updateMetadata(assetId, { ...metadata, ai: { ...ai, [key]: values } });
      onMetadataChange(response.metadata);
      setEditingTag(null);
      setMessage({ type: 'success', text: 'AI metadata updated.' });
    } catch (error) { setMessage({ type: 'error', text: getApiError(error, 'AI metadata could not be updated.') }); }
    finally { setBusy(''); }
  };

  const accept = async (value) => {
    if (repositoryTags.some((tag) => tag.name?.toLowerCase() === value.toLowerCase())) {
      setMessage({ type: 'success', text: `“${value}” is already a repository tag.` });
      return true;
    }
    setBusy(`accept-${value}`);
    try {
      const response = await assetService.addTag(assetId, value);
      if (!repositoryTags.some((tag) => tag.id === response.tag.id || tag.name?.toLowerCase() === response.tag.name?.toLowerCase())) {
        onTagsChange([...repositoryTags, response.tag]);
      }
      setMessage({ type: 'success', text: `Accepted “${response.tag.name}” as a repository tag.` });
      return true;
    } catch (error) { setMessage({ type: 'error', text: getApiError(error, 'The tag could not be accepted.') }); return false; }
    finally { setBusy(''); }
  };

  const addRepositoryTag = async (event) => {
    event.preventDefault();
    const value = newTag.trim();
    if (!value) return;
    if (await accept(value)) setNewTag('');
  };

  const removeRepositoryTag = async (tag) => {
    if (!await confirm({ title: 'Remove repository tag?', details: tag.name, description: 'This tag will be removed from this asset. You can add it again later.', confirmLabel: 'Remove tag' })) return;
    setBusy(`repo-${tag.name}`);
    try {
      await assetService.removeTag(assetId, tag.name);
      onTagsChange(repositoryTags.filter((item) => item.id !== tag.id));
      setMessage({ type: 'success', text: `Removed repository tag “${tag.name}”.` });
    } catch (error) { setMessage({ type: 'error', text: getApiError(error, 'The repository tag could not be removed.') }); }
    finally { setBusy(''); }
  };

  const generateTags = async () => {
    if (Object.keys(ai).length && !await confirm({ title: 'Regenerate AI tags?', description: 'New results may replace existing AI results, including manually edited AI tags.', confirmLabel: 'Regenerate tags', danger: false })) return;
    setBusy('generate'); setMessage({ type: '', text: '' });
    try {
      await assetService.generateAiTags(assetId);
      setMessage({ type: 'success', text: 'AI tagging queued with the current vocabulary. Use Refresh results after processing finishes.' });
    } catch (error) { setMessage({ type: 'error', text: getApiError(error, 'AI tagging could not be queued.') }); }
    finally { setBusy(''); }
  };

  const refreshResults = async () => {
    setBusy('refresh'); setMessage({ type: '', text: '' });
    try {
      const response = await assetService.getMetadata(assetId);
      onMetadataChange(response.metadata);
      setMessage({ type: 'success', text: 'The latest AI results have been loaded.' });
    } catch (error) { setMessage({ type: 'error', text: getApiError(error, 'AI results could not be refreshed.') }); }
    finally { setBusy(''); }
  };

  return (
    <section className="panel p-5">
      <div className="section-title flex-wrap"><Sparkles size={16} className="text-aether-primary" /> AI enrichment<div className="flex w-full flex-wrap gap-2"><button className="secondary-button h-9 text-xs" onClick={refreshResults} disabled={locked || Boolean(busy) || Boolean(editingTag)}><RefreshCw size={13} />Refresh results</button>{canEdit && visualAssetType && <button className="secondary-button h-9 text-xs" onClick={generateTags} disabled={Boolean(busy) || Boolean(editingTag)}>{busy === 'generate' ? <LoaderCircle size={13} className="animate-spin" /> : <Sparkles size={13} />}Regenerate tags</button>}</div></div>
      {message.text && <div role={message.type === "error" ? "alert" : "status"} className={`mt-4 rounded border px-3 py-2 text-xs ${message.type === 'error' ? 'border-red-400/20 bg-red-400/10 text-red-200' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'}`}>{message.text}</div>}
      <div className="mt-5 space-y-5">
        {ai.type === '3d' && <div><h3 className="mb-2 font-mono text-xs uppercase tracking-wider text-zinc-400">3D Metadata</h3><dl className="grid grid-cols-2 gap-3"><ModelStat label="Vertex Count" value={ai.vertexCount} /><ModelStat label="Face Count" value={ai.faceCount} /></dl></div>}
        {collections.map(([key, label, Icon]) => <div key={key}><p className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-zinc-400"><Icon size={13} />{label}</p><ExpandableList items={ai[key]} label="tags" renderItem={(value, index) => {
          const operation = `${key}-${index}`;
          const isEditing = editingTag === operation;
          const accepted = repositoryTags.some((tag) => tag.name?.toLowerCase() === value.toLowerCase());
          return <div key={`${value}-${index}`} className="flex min-h-9 items-center gap-2 rounded border border-white/[0.06] bg-black/15 px-2.5 py-1.5">{isEditing ? <input className="input h-7 min-w-0 flex-1 text-xs" disabled={Boolean(busy)} value={editValue} onChange={(event) => setEditValue(event.target.value)} autoFocus aria-label={`Edit ${value}`} /> : <span className="min-w-0 flex-1 break-words text-sm text-zinc-300 [overflow-wrap:anywhere]">{value}</span>}{canEdit && (isEditing ? <><button className="tag-action text-emerald-300" disabled={!editValue.trim() || busy} onClick={() => updateCollection(key, ai[key].map((item, itemIndex) => itemIndex === index ? editValue.trim() : item), operation)} aria-label="Save tag"><Check size={13} /></button><button className="tag-action" disabled={Boolean(busy)} onClick={cancelTagEdit} aria-label="Cancel tag edit"><X size={13} /></button></> : <><button className={`tag-action ${accepted ? 'text-emerald-300' : ''}`} disabled={accepted || Boolean(busy) || Boolean(editingTag)} onClick={() => accept(value)} aria-label={`Accept ${value} as repository tag`} title="Accept tag">{busy === `accept-${value}` ? <LoaderCircle size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}</button><button className="tag-action" disabled={Boolean(busy) || Boolean(editingTag)} onClick={() => { setEditingTag(operation); setEditValue(value); }} aria-label={`Edit ${value}`}><Edit3 size={13} /></button><button className="tag-action hover:text-red-300" disabled={Boolean(busy) || Boolean(editingTag)} onClick={async () => { if (await confirm({ title: "Remove AI tag?", details: value, description: "This suggestion will be removed from this asset’s AI metadata.", confirmLabel: "Remove tag" })) updateCollection(key, ai[key].filter((_, itemIndex) => itemIndex !== index), operation); }} aria-label={`Remove ${value}`}><X size={13} /></button></>)}</div>;
        }} /></div>)}
        {ai.summary && <AiText label="Summary" value={ai.summary} />}
        {ai.transcript && <AiText label="Audio transcript" value={ai.transcript} reader />}
        {visualAssetType && ai.clip?.status === 'completed' && !ai.imageTags?.length && !ai.semanticTags?.length && <p className="text-sm text-zinc-400">AI found no suitable visual tags. You can add repository tags manually.</p>}
        {visualAssetType && ai.clip?.status === 'failed' && <p className="text-sm text-zinc-400">AI visual tagging is unavailable for this asset. You can add repository tags manually.</p>}
        {!collections.length && !ai.summary && !ai.transcript && ai.type !== '3d' && !ai.clip?.status && <p className="rounded border border-dashed border-white/10 p-4 text-sm leading-6 text-zinc-400">No AI results are available yet. Refresh to check for results.</p>}
        <div className="border-t border-white/[0.06] pt-4"><p className="mb-2 font-mono text-xs uppercase tracking-wider text-zinc-400">Repository tags</p><ExpandableList items={repositoryTags} label="tags" className="flex flex-wrap gap-2" renderItem={(tag) => <span key={tag.id || tag.name} className="tag-chip inline-flex items-center gap-1.5">{tag.name}{canEdit && <button className="tag-action hover:text-red-300" disabled={Boolean(busy) || Boolean(editingTag)} onClick={() => removeRepositoryTag(tag)} aria-label={`Remove repository tag ${tag.name}`}><X size={11} /></button>}</span>} />{canEdit && <form className="mt-3 flex gap-2" onSubmit={addRepositoryTag}><input className="input h-9 min-w-0 flex-1" disabled={Boolean(busy) || Boolean(editingTag)} value={newTag} onChange={(event) => setNewTag(event.target.value)} maxLength={80} placeholder="Add repository tag" aria-label="New repository tag" /><button className="secondary-button h-9" disabled={!newTag.trim() || Boolean(busy) || Boolean(editingTag)}><Plus size={14} /> Add</button></form>}</div>
        {visualAssetType && <VisualVocabulary assetId={assetId} assetType={visualAssetType} repositoryTags={repositoryTags} canEdit={canManageVocabulary && !busy && !editingTag && !newTag.trim()} />}
      </div>{confirmation}
    </section>
  );
}

function AiText({ label, value, reader = false }) {
  return <div><h3 className="mb-2 text-sm font-medium text-zinc-300">{label}</h3><ExpandableText value={value} label={label} reader={reader} className="rounded border border-white/[0.06] bg-black/20 p-4" /></div>;
}

function ModelStat({ label, value }) {
  const available = value !== null && value !== undefined && Number.isFinite(Number(value));
  return <div className="rounded border border-white/[0.06] bg-black/20 p-3"><dt className="font-mono text-xs uppercase tracking-wider text-zinc-400">{label}</dt><dd className="mt-1 font-mono text-sm text-zinc-200">{available ? Number(value).toLocaleString() : 'Unavailable'}</dd></div>;
}
