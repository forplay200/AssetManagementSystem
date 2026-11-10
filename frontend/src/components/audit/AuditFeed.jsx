import { useCallback, useEffect, useRef, useState } from 'react';
import { auditService } from '../../services/auditService';
import { getApiError } from '../../services/api';
import AuditEvent from './AuditEvent';
const empty = { category: '', result: '', actorName: '', targetName: '', from: '', to: '' };
export default function AuditFeed({ assetId, onViewVersions }) {
  const [draft, setDraft] = useState(empty);
  const [filters, setFilters] = useState(empty);
  const [events, setEvents] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requests = useRef(0);
  const load = useCallback(async (nextCursor = null) => {
    const request = ++requests.current; setLoading(true); setError('');
    try {
      const query = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
      if (query.from) query.from = new Date(`${query.from}T00:00:00`).toISOString();
      if (query.to) query.to = new Date(`${query.to}T23:59:59.999`).toISOString();
      if (nextCursor) query.cursor = nextCursor;
      const result = await (assetId ? auditService.asset(assetId, query) : auditService.workspace(query));
      if (requests.current !== request) return;
      setEvents(current => nextCursor ? [...current, ...result.events.filter(event => !current.some(existing => existing.id === event.id))] : result.events);
      setCursor(result.nextCursor);
    } catch (e) { if (requests.current === request) setError(getApiError(e, 'The audit log could not be loaded.')); }
    finally { if (requests.current === request) setLoading(false); }
  }, [assetId, filters]);
  useEffect(() => { const sequence = requests; setEvents([]); setCursor(null); load(); return () => { sequence.current++; }; }, [load]);
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  return <div>
    <form className="mb-4 grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); setFilters({ ...draft }); }}>
      <label className="block text-xs text-zinc-400">Action type<select className="input mt-1 w-full" value={draft.category} onChange={event => update('category', event.target.value)}><option value="">All actions</option>{[...(assetId ? [] : [['workspace', 'Workspace and members']]), ['content', 'Content and AI'], ['versions', 'Files and versions'], ['recycle', 'Recycle bin'], ['downloads', 'Downloads'], ...(assetId ? [['comments', 'Comments'], ['locks', 'Editing sessions']] : [])].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="block text-xs text-zinc-400">Result<select className="input mt-1 w-full" value={draft.result} onChange={event => update('result', event.target.value)}><option value="">All results</option>{['success', 'requested', 'completed', 'interrupted', 'failed', 'denied'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="block text-xs text-zinc-400">Person<input className="input mt-1 w-full" placeholder="Search member name" value={draft.actorName} onChange={event => update('actorName', event.target.value)} maxLength={200} /></label>
      <label className="block text-xs text-zinc-400">Object<input className="input mt-1 w-full" placeholder="Search recorded asset or member name" value={draft.targetName} onChange={event => update('targetName', event.target.value)} maxLength={200} /></label>
      <div className="grid grid-cols-2 gap-2"><label className="block text-xs text-zinc-400">From<input type="date" className="input mt-1 w-full" value={draft.from} onChange={event => update('from', event.target.value)} /></label><label className="block text-xs text-zinc-400">To<input type="date" className="input mt-1 w-full" value={draft.to} onChange={event => update('to', event.target.value)} /></label></div>
      <div className="flex flex-wrap gap-2 sm:col-span-2"><button className="primary-button" disabled={loading}>Apply filters</button><button type="button" className="secondary-button" disabled={loading} onClick={() => { setDraft(empty); setFilters({ ...empty }); }}>Reset</button><button type="button" className="secondary-button" disabled={loading} onClick={() => load()}>Refresh</button></div>
    </form>
    {error && <div role="alert" className="my-4 text-sm text-red-200">{error}<button className="secondary-button ml-3" disabled={loading} onClick={() => load()}>Try again</button></div>}
    {!loading && !error && !events.length && <p className="py-8 text-center text-sm text-zinc-400">No matching recorded activity. Earlier activity is not backfilled.</p>}
    <div aria-label="Audit events">{events.map(event => <AuditEvent key={event.id} event={event} onViewVersions={onViewVersions} />)}</div>
    {loading && <p role="status" className="py-4 text-sm text-zinc-400">Loading activity…</p>}
    {cursor && <button className="secondary-button mt-4" disabled={loading} onClick={() => load(cursor)}>Load older activity</button>}
  </div>;
}
