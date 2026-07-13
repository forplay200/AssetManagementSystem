import { useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, Edit3, FileText, Hash, LoaderCircle, Plus, Save, Sparkles, Tag, Trash2, X } from 'lucide-react';
import { getApiError } from '../../services/api';
import { assetService } from '../../services/assetService';

const makeRows = (metadata) => Object.entries(metadata || {})
  .filter(([key, value]) => key !== 'ai' && value !== null && !['object', 'undefined'].includes(typeof value))
  .map(([key, value], index) => ({ id: `${key}-${index}`, key, value: String(value), originalType: typeof value }));

const restoreType = (row) => {
  if (row.originalType === 'number' && row.value.trim() !== '' && Number.isFinite(Number(row.value))) return Number(row.value);
  if (row.originalType === 'boolean') return row.value.trim().toLowerCase() === 'true';
  return row.value.trim();
};

export default function MetadataPanel({ assetId, metadata, repositoryTags, canEdit, onMetadataChange, onTagsChange }) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(() => makeRows(metadata));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => { if (!editing) setRows(makeRows(metadata)); }, [metadata, editing]);

  const save = async () => {
    const populated = rows.filter((row) => row.key.trim());
    const keys = populated.map((row) => row.key.trim());
    if (new Set(keys).size !== keys.length) {
      setMessage({ type: 'error', text: 'Metadata field names must be unique.' });
      return;
    }
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

  const cancel = () => { setRows(makeRows(metadata)); setEditing(false); setMessage({ type: '', text: '' }); };

  return (
    <div className="space-y-5">
      <section className="panel p-5">
        <div className="section-title"><FileText size={16} /> Metadata<div className="ml-auto flex gap-2">{canEdit && !editing && <button className="icon-action" onClick={() => setEditing(true)} aria-label="Edit metadata" title="Edit metadata"><Edit3 size={14} /></button>}{editing && <><button className="icon-action" onClick={cancel} aria-label="Cancel metadata changes"><X size={14} /></button><button className="icon-action icon-action-primary" onClick={save} disabled={saving} aria-label="Save metadata">{saving ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}</button></>}</div></div>
        {message.text && <div className={`mt-4 rounded border px-3 py-2 text-xs ${message.type === 'error' ? 'border-red-400/20 bg-red-400/10 text-red-200' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'}`}>{message.text}</div>}
        {editing ? <div className="mt-4 space-y-3">{rows.map((row) => <div key={row.id} className="grid grid-cols-[minmax(100px,.7fr)_minmax(0,1fr)_32px] gap-2"><input className="input h-9 min-w-0 font-mono text-xs" value={row.key} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, key: event.target.value } : item))} placeholder="field_name" aria-label="Metadata field name" /><input className="input h-9 min-w-0" value={row.value} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, value: event.target.value } : item))} placeholder="Value" aria-label="Metadata value" /><button className="grid h-9 w-8 place-items-center text-zinc-600 hover:text-red-300" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} aria-label="Remove metadata field"><Trash2 size={14} /></button></div>)}<button className="secondary-button mt-1" onClick={() => setRows((current) => [...current, { id: `${Date.now()}-${current.length}`, key: '', value: '', originalType: 'string' }])}><Plus size={14} /> Add field</button></div> : <MetadataReadout rows={rows} />}
        {!canEdit && <p className="mt-4 border-t border-white/[0.06] pt-3 text-xs text-zinc-600">Your role has read-only metadata access.</p>}
      </section>
      <AiEnrichment assetId={assetId} metadata={metadata} repositoryTags={repositoryTags} canEdit={canEdit} onMetadataChange={onMetadataChange} onTagsChange={onTagsChange} />
    </div>
  );
}

function MetadataReadout({ rows }) {
  return rows.length ? <dl className="mt-4 divide-y divide-white/[0.06]">{rows.map((row) => <div key={row.id} className="grid grid-cols-[120px_1fr] gap-4 py-3 text-sm"><dt className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">{row.key}</dt><dd className="break-words text-zinc-300">{row.value}</dd></div>)}</dl> : <p className="mt-4 text-sm text-zinc-500">No custom metadata has been added.</p>;
}

function AiEnrichment({ assetId, metadata, repositoryTags, canEdit, onMetadataChange, onTagsChange }) {
  const ai = useMemo(() => metadata?.ai || {}, [metadata]);
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
      return;
    }
    setBusy(`accept-${value}`);
    try {
      const response = await assetService.addTag(assetId, value);
      onTagsChange([...repositoryTags, response.tag]);
      setMessage({ type: 'success', text: `Accepted “${value}” as a repository tag.` });
    } catch (error) { setMessage({ type: 'error', text: getApiError(error, 'The tag could not be accepted.') }); }
    finally { setBusy(''); }
  };

  const addRepositoryTag = async (event) => {
    event.preventDefault();
    const value = newTag.trim();
    if (!value) return;
    await accept(value);
    setNewTag('');
  };

  const removeRepositoryTag = async (tag) => {
    setBusy(`repo-${tag.name}`);
    try {
      await assetService.removeTag(assetId, tag.name);
      onTagsChange(repositoryTags.filter((item) => item.id !== tag.id));
      setMessage({ type: 'success', text: `Removed repository tag “${tag.name}”.` });
    } catch (error) { setMessage({ type: 'error', text: getApiError(error, 'The repository tag could not be removed.') }); }
    finally { setBusy(''); }
  };

  return (
    <section className="panel p-5">
      <div className="section-title"><Sparkles size={16} className="text-aether-primary" /> AI enrichment</div>
      {message.text && <div className={`mt-4 rounded border px-3 py-2 text-xs ${message.type === 'error' ? 'border-red-400/20 bg-red-400/10 text-red-200' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'}`}>{message.text}</div>}
      <div className="mt-5 space-y-5">
        {ai.type === '3d' && <div><h3 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">3D Metadata</h3><dl className="grid grid-cols-2 gap-3"><ModelStat label="Vertex Count" value={ai.vertexCount} /><ModelStat label="Face Count" value={ai.faceCount} /></dl></div>}
        {collections.map(([key, label, Icon]) => <div key={key}><p className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500"><Icon size={13} />{label}</p><div className="space-y-2">{ai[key].map((value, index) => {
          const operation = `${key}-${index}`;
          const isEditing = editingTag === operation;
          const accepted = repositoryTags.some((tag) => tag.name?.toLowerCase() === value.toLowerCase());
          return <div key={`${value}-${index}`} className="flex min-h-9 items-center gap-2 rounded border border-white/[0.06] bg-black/15 px-2.5 py-1.5">{isEditing ? <input className="input h-7 min-w-0 flex-1 text-xs" value={editValue} onChange={(event) => setEditValue(event.target.value)} autoFocus aria-label={`Edit ${value}`} /> : <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-zinc-300">{value}</span>}{canEdit && (isEditing ? <><button className="tag-action text-emerald-300" disabled={!editValue.trim() || busy} onClick={() => updateCollection(key, ai[key].map((item, itemIndex) => itemIndex === index ? editValue.trim() : item), operation)} aria-label="Save tag"><Check size={13} /></button><button className="tag-action" onClick={() => setEditingTag(null)} aria-label="Cancel tag edit"><X size={13} /></button></> : <><button className={`tag-action ${accepted ? 'text-emerald-300' : ''}`} disabled={accepted || Boolean(busy)} onClick={() => accept(value)} aria-label={`Accept ${value} as repository tag`} title="Accept tag">{busy === `accept-${value}` ? <LoaderCircle size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}</button><button className="tag-action" disabled={Boolean(busy)} onClick={() => { setEditingTag(operation); setEditValue(value); }} aria-label={`Edit ${value}`}><Edit3 size={13} /></button><button className="tag-action hover:text-red-300" disabled={Boolean(busy)} onClick={() => updateCollection(key, ai[key].filter((_, itemIndex) => itemIndex !== index), operation)} aria-label={`Remove ${value}`}><X size={13} /></button></>)}</div>;
        })}</div></div>)}
        {ai.summary && <AiText label="Summary" value={ai.summary} />}
        {ai.transcript && <AiText label="Audio transcript" value={ai.transcript} mono />}
        {!collections.length && !ai.summary && !ai.transcript && ai.type !== '3d' && <div className="flex items-center gap-3 rounded border border-dashed border-white/10 p-4 text-sm text-zinc-500"><LoaderCircle size={17} className="text-aether-secondary" />AI metadata is pending or unavailable.</div>}
        <div className="border-t border-white/[0.06] pt-4"><p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">Repository tags</p><div className="flex flex-wrap gap-2">{repositoryTags.map((tag) => <span key={tag.id || tag.name} className="tag-chip inline-flex items-center gap-1.5">{tag.name}{canEdit && <button className="text-zinc-600 hover:text-red-300" disabled={Boolean(busy)} onClick={() => removeRepositoryTag(tag)} aria-label={`Remove repository tag ${tag.name}`}><X size={11} /></button>}</span>)}</div>{canEdit && <form className="mt-3 flex gap-2" onSubmit={addRepositoryTag}><input className="input h-9 min-w-0 flex-1" value={newTag} onChange={(event) => setNewTag(event.target.value)} maxLength={80} placeholder="Add repository tag" aria-label="New repository tag" /><button className="secondary-button h-9" disabled={!newTag.trim() || Boolean(busy)}><Plus size={14} /> Add</button></form>}</div>
      </div>
    </section>
  );
}

function AiText({ label, value, mono = false }) {
  return <div><p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">{label}</p><p className={`rounded border border-white/[0.06] bg-black/20 p-3 text-sm leading-6 text-zinc-300 ${mono ? 'font-mono text-xs' : ''}`}>{value}</p></div>;
}

function ModelStat({ label, value }) {
  const available = value !== null && value !== undefined && Number.isFinite(Number(value));
  return <div className="rounded border border-white/[0.06] bg-black/20 p-3"><dt className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">{label}</dt><dd className="mt-1 font-mono text-sm text-zinc-200">{available ? Number(value).toLocaleString() : 'Unavailable'}</dd></div>;
}
