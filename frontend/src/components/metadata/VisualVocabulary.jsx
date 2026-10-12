import { useEffect, useMemo, useState } from 'react';
import { BookOpen, LoaderCircle, Plus, X } from 'lucide-react';
import { assetService } from '../../services/assetService';
import useConfirmation from '../../hooks/useConfirmation';
import { useUnsavedChanges } from '../../context/UnsavedChangesContext';
import { getApiError } from '../../services/api';

const normalise = (value) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

export default function VisualVocabulary({ assetId, assetType, repositoryTags, canEdit }) {
  const [expanded, setExpanded] = useState(false);
  const [vocabulary, setVocabulary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [facet, setFacet] = useState('content');
  const [assetTypes, setAssetTypes] = useState(['image', '3d']);
  const [confirmed, setConfirmed] = useState(false);
  const { confirm, confirmation } = useConfirmation();
  useUnsavedChanges(Boolean(name.trim() || description.trim()), 'Visual vocabulary', Boolean(busy));
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    let active = true;
    setVocabulary(null);
    setMessage({ type: '', text: '' });
    if (!expanded) return () => { active = false; };
    setLoading(true);
    assetService.getVocabulary(assetId)
      .then((response) => { if (active) setVocabulary(response.vocabulary); })
      .catch((error) => { if (active) setMessage({ type: 'error', text: getApiError(error, 'Visual vocabulary could not be loaded.') }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [assetId, assetType, expanded]);

  useEffect(() => {
    setName(''); setDescription(''); setFacet('content');
    setAssetTypes(['image', '3d']); setConfirmed(false);
  }, [assetId, assetType]);

  const entries = useMemo(() => vocabulary?.entries || [], [vocabulary]);
  const customEntries = entries.filter((entry) => entry.scope === 'workspace');
  const suggestedNames = useMemo(() => repositoryTags
    .map((tag) => tag.name)
    .filter((value) => !entries.some((entry) => [entry.name, ...entry.aliases].some((alias) => normalise(alias) === normalise(value)))),
  [repositoryTags, entries]);

  const refresh = async () => {
    const response = await assetService.getVocabulary(assetId);
    setVocabulary(response.vocabulary);
  };

  const add = async (event) => {
    event.preventDefault();
    if (!name.trim() || !confirmed) return;
    setBusy('add'); setMessage({ type: '', text: '' });
    try {
      const response = await assetService.approveVocabularyEntry(assetId, { name, description, facet, assetTypes });
      await refresh();
      setName(''); setDescription(''); setConfirmed(false);
      setMessage({ type: 'success', text: `“${response.entry.name}” is available for future tag suggestions.` });
    } catch (error) { setMessage({ type: 'error', text: getApiError(error, 'This concept could not be added.') }); }
    finally { setBusy(''); }
  };

  const remove = async (entry) => {
    if (!await confirm({ title: 'Remove workspace concept?', details: entry.name, description: 'This affects future suggestions across this workspace. Existing asset tags will be preserved.', confirmLabel: 'Remove concept' })) return;
    setBusy(String(entry.entryId)); setMessage({ type: '', text: '' });
    try {
      await assetService.removeVocabularyEntry(assetId, entry.entryId);
      await refresh();
      setMessage({ type: 'success', text: `“${entry.name}” was removed from future suggestions. Its existing asset tags are preserved.` });
    } catch (error) { setMessage({ type: 'error', text: getApiError(error, 'This concept could not be removed.') }); }
    finally { setBusy(''); }
  };

  const changeFacet = (value) => {
    setFacet(value);
    if (value !== 'content') setAssetTypes(['image']);
  };

  return (
    <><details className="mt-5 border-t border-white/[0.06] pt-4" onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary className="cursor-pointer text-xs text-zinc-300"><BookOpen size={13} className="mr-2 inline" />Visual vocabulary</summary>
      <p className="mt-3 text-xs leading-5 text-zinc-400">Confirm visible concepts to use them in future tag suggestions within this workspace. Game roles and project status belong in repository tags.</p>
      {assetType === '3d' && <p className="mt-2 text-xs text-zinc-400">3D suggestions currently describe objects and shapes. Colour and material support will follow textured previews.</p>}
      {loading && <p className="mt-3 flex items-center gap-2 text-xs text-zinc-400"><LoaderCircle size={13} className="animate-spin" />Loading vocabulary…</p>}
      {message.text && <div role="status" className={`mt-3 rounded border px-3 py-2 text-xs ${message.type === 'error' ? 'border-red-400/20 bg-red-400/10 text-red-200' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'}`}>{message.text}</div>}
      {vocabulary && <p className="mt-3 text-xs text-zinc-400">{entries.filter((entry) => entry.scope === 'core').length} core concepts · {customEntries.length} workspace concepts for this asset type</p>}
      {customEntries.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{customEntries.map((entry) => <span key={entry.id} className="tag-chip inline-flex items-center gap-1.5">{entry.name}{canEdit && <button type="button" className="tag-action hover:text-red-300" disabled={Boolean(busy)} onClick={() => remove(entry)} aria-label={`Remove ${entry.name} from visual vocabulary`}><X size={11} /></button>}</span>)}</div>}
      {canEdit && <form className="mt-4" onSubmit={add}><fieldset disabled={Boolean(busy)} className="space-y-3">
        <label className="block text-xs text-zinc-400">Visual concept<input className="input mt-1 h-9 w-full" value={name} onChange={(event) => { setName(event.target.value); setConfirmed(false); }} maxLength={80} placeholder="e.g. katana" list={`visual-concepts-${assetId}`} required /><datalist id={`visual-concepts-${assetId}`}>{suggestedNames.map((value) => <option key={value} value={value} />)}</datalist></label>
        <label className="block text-xs text-zinc-400">Visual description <span className="text-zinc-400">(optional)</span><input className="input mt-1 h-9 w-full" value={description} onChange={(event) => { setDescription(event.target.value); setConfirmed(false); }} maxLength={240} placeholder="e.g. a Japanese katana sword" /></label>
        <label className="block text-xs text-zinc-400">Concept type<select className="input mt-1 h-9 w-full" value={facet} onChange={(event) => { changeFacet(event.target.value); setConfirmed(false); }}><option value="content">Object or scene</option>{assetType === 'image' && <><option value="form">Asset form or interface</option><option value="style">Visual style</option><option value="appearance">Colour or material</option></>}</select></label>
        <fieldset className="flex flex-wrap gap-4 text-xs text-zinc-400"><legend className="mb-2">Use for</legend>{[['image', 'Images'], ['3d', '3D models']].map(([type, label]) => <label key={type} className="flex items-center gap-2"><input type="checkbox" checked={assetTypes.includes(type)} disabled={type === assetType || (type === '3d' && facet !== 'content')} onChange={(event) => { setAssetTypes((current) => event.target.checked ? [...current, type] : current.filter((item) => item !== type)); setConfirmed(false); }} />{label}</label>)}</fieldset>
        <label className="flex items-start gap-2 text-xs leading-5 text-zinc-400"><input className="mt-1" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I confirm this describes visible content in the selected asset types.</label>
        <button className="secondary-button h-9" disabled={!name.trim() || !confirmed || loading || !vocabulary || Boolean(busy)}>{busy === 'add' ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />}Add to visual vocabulary</button>
      </fieldset></form>}
    </details>{confirmation}</>
  );
}
