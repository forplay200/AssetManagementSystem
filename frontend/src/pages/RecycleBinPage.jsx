import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';
import Dialog from '../components/common/Dialog';
import AssetPreview, { previewKind } from '../components/assets/AssetPreview';
import { recycleBinService } from '../services/recycleBinService';
import { getApiError } from '../services/api';
import useConfirmation from '../hooks/useConfirmation';
const date = value => new Date(value).toLocaleString();
export default function RecycleBinPage() {
  const [params, setParams] = useSearchParams();
  const cycleId = params.get('cycle') || undefined;
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ cycles: [], total: 0, pageSize: 30 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [previewCycle, setPreviewCycle] = useState(null);
  const sequence = useRef(0);
  const { confirm, confirmation } = useConfirmation();
  useEffect(() => { setPage(1); }, [cycleId]);
  const load = useCallback(async () => {
    const request = ++sequence.current; setLoading(true); setError('');
    try { const result = await recycleBinService.list({ page, cycleId }); if (sequence.current === request) setData(result); }
    catch (e) { if (sequence.current === request) setError(getApiError(e)); }
    finally { if (sequence.current === request) setLoading(false); }
  }, [page, cycleId]);
  useEffect(() => { const requests = sequence; load(); return () => { requests.current++; }; }, [load]);
  const restore = async (cycle, objection) => {
    if (!await confirm({ title: objection ? 'Object and restore this asset?' : 'Restore this asset?', description: 'The asset and its preserved versions will return to the library. This deletion cycle will end and its pending cleanup will be cancelled.', details: cycle.targetName, confirmLabel: objection ? 'Object and restore' : 'Restore', danger: false })) return;
    setBusy(true); setActionError(''); setNotice('');
    try { await recycleBinService.restore(cycle.assetId, cycle.id, objection); window.dispatchEvent(new Event('aether:notifications-changed')); setNotice('Asset restored.'); }
    catch (e) { setActionError(getApiError(e)); }
    finally { await load(); setBusy(false); }
  };
  return <><PageHeader eyebrow="Workspace" title="Recycle bin" description="Assets are kept for 7 days. Uploaders can object when another member deletes their asset. Cleanup pauses when the uploader cannot access their notification." actions={<button className="secondary-button" onClick={load} disabled={loading || busy}>Refresh</button>} />
    {cycleId && <button className="secondary-button mb-4" onClick={() => { setParams({}); setPage(1); }}>Show all deleted assets</button>}
    {notice && <p role="status" className="mb-4 text-emerald-300">{notice}</p>}
    {(error || actionError) && <p role="alert" className="mb-4 text-red-200">{error || actionError}</p>}
    {loading ? <p role="status">Loading recycle bin…</p> : !error && <div className="space-y-4">{data.cycles.length === 0 && <div className="panel p-8 text-center text-zinc-400">No pending deleted assets. A linked deletion may already have ended.</div>}{data.cycles.map(cycle => <article key={cycle.id} className="panel p-5"><h2 className="break-words font-semibold">{cycle.targetName}</h2><p className="mt-2 text-sm text-zinc-400">Uploaded by {cycle.uploaderName} · Deleted by {cycle.deletedByName}</p><p className="mt-1 text-xs text-zinc-400">Deleted {date(cycle.deletedAt)} · Cleanup eligible {date(cycle.purgeAfter)}</p>{cycle.reason && <p className="mt-3 whitespace-pre-wrap break-words text-sm">Reason: {cycle.reason}</p>}<p className="mt-3 text-sm text-amber-200">{cycle.holdReason ? 'Cleanup paused: original uploader unavailable. A new 7-day window will start when access is restored.' : cycle.cleanup?.status === 'failed' ? `Cleanup failed. Retry scheduled ${date(cycle.cleanup.nextAttemptAt)}.` : cycle.status === 'purging' ? 'Permanent cleanup in progress. Recovery is no longer available.' : new Date(cycle.purgeAfter) > new Date() ? `${Math.max(1, Math.ceil((new Date(cycle.purgeAfter) - new Date()) / 86400000))} day(s) left to recover.` : 'Recovery period ended; awaiting scheduled cleanup.'}</p><div className="mt-4 flex flex-wrap gap-2">
      {cycle.preview && previewKind(cycle.preview) !== 'unsupported' && <button type="button" className="secondary-button" disabled={busy} onClick={() => setPreviewCycle(cycle)}>Preview</button>}
      {cycle.preview && previewKind(cycle.preview) === 'unsupported' && <span className="self-center text-xs text-zinc-400">Preview unavailable for this file type.</span>}
      {cycle.canRestore && <button className="secondary-button" disabled={busy} onClick={() => restore(cycle, false)}>Restore</button>}{cycle.canObject && <button className="primary-button" disabled={busy} onClick={() => restore(cycle, true)}>Object and restore</button>}</div></article>)}</div>}
    <div className="mt-5 flex items-center gap-3"><button className="secondary-button" disabled={page <= 1 || loading || busy} onClick={() => setPage(p => p - 1)}>Previous</button><span className="text-sm text-zinc-400">Page {page}</span><button className="secondary-button" disabled={page * data.pageSize >= data.total || loading || busy} onClick={() => setPage(p => p + 1)}>Next</button><Link className="secondary-button ml-auto" to="/assets">Library</Link></div>
    {previewCycle && <Dialog open wide title={previewCycle.targetName} onClose={() => setPreviewCycle(null)}>
      <AssetPreview assetId={previewCycle.assetId} info={previewCycle.preview} recycleCycleId={previewCycle.id} />
    </Dialog>}
    {confirmation}</>;
}
