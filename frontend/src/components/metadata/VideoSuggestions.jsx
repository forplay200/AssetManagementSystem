import { useEffect, useRef, useState } from 'react';
import { assetService } from '../../services/assetService';
import { getApiError } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useUnsavedChanges } from '../../context/UnsavedChangesContext';
import useConfirmation from '../../hooks/useConfirmation';

function Evidence({ assetId, jobId, frame }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const controller = new AbortController(); let active = true, value = '';
    assetService.getVideoFrame(assetId, jobId, frame.id, controller.signal).then(blob => {
      if (active) { value = URL.createObjectURL(blob); setUrl(value); }
    }).catch(() => {});
    return () => { active = false; controller.abort(); if (value) URL.revokeObjectURL(value); };
  }, [assetId, jobId, frame.id]);
  return <figure className="min-w-0">{url && <img src={url} alt={`Evidence at ${frame.timeSeconds.toFixed(2)} seconds`} className="max-h-32 w-full rounded object-contain" />}<figcaption className="mt-1 text-xs text-zinc-400">{frame.timeSeconds.toFixed(2)} s</figcaption></figure>;
}

const states = { queued: 'Waiting for analysis', processing: 'Analysing sampled frames', failed: 'Analysis failed', succeeded: 'Analysis complete', superseded: 'Replaced', cancelled: 'Cancelled' };
export default function VideoSuggestions({ assetId, sourceFilename, metadata, canEdit, active = true, onMetadataChange, onTagsChange }) {
  const { user } = useAuth();
  const workspaceId = user?.team?.id;
  const [job, setJob] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState(''), [text, setText] = useState('');
  const [revision, setRevision] = useState(0);
  const identity = `${assetId}:${sourceFilename}:${workspaceId}`;
  const latest = useRef(identity); latest.current = identity;
  const { confirm, confirmation } = useConfirmation();
  useUnsavedChanges(Boolean(editId), 'Video suggestion edit', busy);
  useEffect(() => {
    if (!active) return undefined;
    let mounted = true, timer, failures = 0;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const response = await assetService.getVideoJob(assetId, controller.signal);
        if (!mounted) return;
        setJob(response.job); setError(''); failures = 0;
        if (['queued', 'processing'].includes(response.job?.status)) timer = setTimeout(poll, 4000);
      } catch (e) {
        if (mounted) {
          setError(getApiError(e, 'Video analysis status could not be loaded.'));
          if (![401, 403, 404, 410].includes(e.response?.status)) timer = setTimeout(poll, Math.min(30000, 4000 * 2 ** Math.min(++failures, 3)));
        }
      }
    };
    poll();
    return () => { mounted = false; clearTimeout(timer); controller.abort(); };
  }, [assetId, sourceFilename, workspaceId, active, revision]);
  const review = async (candidate, decision) => {
    if (!canEdit || busy) return;
    setBusy(true); setError('');
    try {
      const response = await assetService.reviewVideo(assetId, job.id, [{ candidateId: candidate.id, decision, ...(decision === 'edited' ? { text } : {}) }]);
      if (latest.current !== identity) return;
      setJob(response.job); onMetadataChange(response.metadata); onTagsChange(response.tags); setEditId('');
    } catch (e) { if (latest.current === identity) setError(getApiError(e, 'Review could not be saved.')); }
    finally { if (latest.current === identity) setBusy(false); }
  };
  const generate = async () => {
    if (!canEdit || busy || editId) return;
    if (job && !await confirm({ title: 'Regenerate video suggestions?', description: 'This replaces the current suggestions and evidence. Existing repository tags are kept; check whether they still suit this file.', confirmLabel: 'Regenerate', danger: false })) return;
    setBusy(true);
    try {
      const response = await assetService.generateAiTags(assetId, true);
      if (latest.current !== identity) return;
      setJob(response.job); onMetadataChange({ ...metadata, ai: { type: 'video', videoTags: [] } }); setRevision(n => n + 1);
    } catch (e) { if (latest.current === identity) setError(getApiError(e)); }
    finally { if (latest.current === identity) setBusy(false); }
  };
  return <section className="panel min-w-0 p-5" aria-label="Video visual suggestions">
    <h2 className="section-title">Video visual suggestions</h2>
    <p role="status" className="mt-3 text-sm text-zinc-300">{job ? states[job.status] : 'No video analysis yet'}</p>
    <p className="mt-2 text-xs leading-5 text-zinc-400">CLIP matches sampled images to the Images vocabulary. Review suggestions before they become searchable tags. Scores are similarity values, not correctness probabilities.</p>
    {job?.status === 'processing' && <p className="mt-2 text-xs text-zinc-400">{({ downloading: 'Loading video', extracting: 'Sampling frames', tagging: 'Matching visual concepts' })[job.stage]}</p>}
    {job?.errorMessage && <p className="mt-2 text-xs text-amber-200">{job.errorMessage}</p>}
    {job?.sampling?.failedCount > 0 && <p className="mt-2 text-xs text-amber-200">Some sampled frames could not be processed.</p>}
    {error && <p role="alert" className="mt-3 text-xs text-red-200">{error}</p>}
    {canEdit && <button className="secondary-button mt-3" disabled={busy || Boolean(editId) || ['queued', 'processing'].includes(job?.status)} onClick={generate}>{job?.status === 'failed' ? 'Retry analysis' : 'Regenerate video suggestions'}</button>}
    {job?.status === 'succeeded' && !job.candidates.length && <p className="mt-4 text-sm text-zinc-400">No suitable suggestions. You can still add manual repository tags.</p>}
    <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto">
      {(job?.candidates || []).map(c => <article key={c.id} className="rounded border border-white/10 p-3">
        <p className="break-words text-sm text-zinc-100">{c.finalText || c.name}</p>
        {c.decision === 'edited' && <p className="mt-1 break-words text-xs text-zinc-400">Edited from “{c.name}”. Similarity below refers to the original AI suggestion.</p>}
        <p className="mt-1 text-xs text-zinc-400">{c.decision === 'pending' ? 'Pending review' : c.decision === 'rejected' ? 'Rejected' : c.tagLinked === false ? 'Previously confirmed; repository tag removed' : 'Confirmed'} · similarity {c.maxScore.toFixed(3)} · {c.hitFrameCount}/{c.sampleCount} sampled frames</p>
        <details className="mt-2"><summary className="cursor-pointer text-xs text-violet-200">View sampled evidence</summary><div className="mt-2 grid grid-cols-2 gap-2">{c.frameIds.map(id => { const f = job.frames.find(f => f.id === id); return f && <Evidence key={id} assetId={assetId} jobId={job.id} frame={f} />; })}</div></details>
        {canEdit && c.decision === 'pending' && (editId === c.id ? <div className="mt-3 space-y-2"><input className="input w-full" aria-label="Edited video tag" value={text} maxLength={80} onChange={e => setText(e.target.value)} /><div className="flex flex-wrap gap-2"><button className="secondary-button" disabled={busy || !text.trim()} onClick={() => review(c, 'edited')}>Accept edited tag</button><button className="secondary-button" disabled={busy} onClick={() => setEditId('')}>Cancel</button></div></div> : <div className="mt-3 flex flex-wrap gap-2"><button className="secondary-button" disabled={busy || Boolean(editId)} onClick={() => review(c, 'accepted')}>Accept</button><button className="secondary-button" disabled={busy || Boolean(editId)} onClick={() => { setEditId(c.id); setText(c.name); }}>Edit</button><button className="secondary-button" disabled={busy || Boolean(editId)} onClick={() => review(c, 'rejected')}>Reject</button></div>)}
        {canEdit && c.decision === 'rejected' && <button className="secondary-button mt-2" disabled={busy || Boolean(editId)} onClick={() => review(c, 'pending')}>Undo rejection</button>}
      </article>)}
    </div>
    {job?.provenance && <details className="mt-3 text-xs text-zinc-400"><summary className="cursor-pointer">Analysis details</summary><p className="mt-2 break-all">{job.provenance.model} · {job.sampling?.decodedCount} frames · {job.elapsedSeconds?.toFixed(1)} s</p><p className="mt-2">Initial thresholds; video tagging quality has not yet been evaluated.</p></details>}
    {confirmation}
  </section>;
}
