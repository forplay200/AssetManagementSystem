import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderSearch, Plus, RefreshCw, Search } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import AssetGrid, { AssetGridSkeleton } from '../components/assets/AssetGrid';
import EmptyState from '../components/common/EmptyState';
import PageHeader from '../components/common/PageHeader';
import { assetService } from '../services/assetService';
import { getApiError } from '../services/api';
import { usePermissions } from '../hooks/usePermissions';

const assetTypes = [
  ['', 'All types'],
  ['image', 'Images'],
  ['model', '3D models'],
  ['audio', 'Audio'],
  ['video', 'Videos'],
  ['text', 'Scripts & data'],
];

const assetSorts = [
  ['newest', 'Newest upload'],
  ['name', 'Name (A–Z)'],
  ['size', 'Largest file first'],
];

export default function AssetsPage() {
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const sequence = useRef(0);
  const restored = useRef(false);
  const type = assetTypes.find(([value]) => value === params.get('type'))?.[0] || '';
  const sort = assetSorts.find(([value]) => value === params.get('sort'))?.[0] || 'newest';
  const filename = params.get('filename')?.trim() || '';
  const requestedPage = Number(params.get('page'));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [searchInput, setSearchInput] = useState(filename);
  const [state, setState] = useState({ loading: true, data: [], total: 0, page: 1, totalPages: 1, error: '' });
  const searchTerm = searchInput.trim();
  const searchPending = searchTerm !== filename;
  const filtered = Boolean(filename || type);

  const load = useCallback(async () => {
    const request = ++sequence.current;
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const result = await assetService.search({
        page, pageSize: 12, ...(type && { type }), ...(filename && { filename }), ...(sort !== 'newest' && { sort }),
      });
      if (request !== sequence.current) return;
      setState({ loading: false, data: result.data || [], total: result.totalItems || 0, page: result.currentPage || page, totalPages: result.totalPages || 1, error: '' });
    } catch (error) {
      if (request !== sequence.current) return;
      setState((current) => ({ ...current, loading: false, error: getApiError(error, 'Unable to load the asset repository.') }));
    }
  }, [filename, page, sort, type]);

  useEffect(() => { const counter = sequence; load(); return () => { counter.current++; }; }, [load]);
  useEffect(() => {
    if (!state.loading && !restored.current && Number.isFinite(location.state?.restoreScroll)) { window.scrollTo?.(0, location.state.restoreScroll); restored.current = true; }
  }, [state.loading, location.state]);

  const updateCriteria = useCallback((changes, options) => {
    const criteria = { type, filename, sort, ...changes };
    const next = new URLSearchParams();
    if (criteria.type) next.set('type', criteria.type);
    if (criteria.filename) next.set('filename', criteria.filename);
    if (criteria.sort !== 'newest') next.set('sort', criteria.sort);
    if (next.toString() !== params.toString()) setParams(next, options);
  }, [filename, params, setParams, sort, type]);

  useEffect(() => {
    setSearchInput(current => current.trim() === filename ? current : filename);
  }, [filename]);
  useEffect(() => {
    if (!searchPending) return;
    const timer = setTimeout(() => updateCriteria({ filename: searchTerm }, { replace: true }), 300);
    return () => clearTimeout(timer);
  }, [searchPending, searchTerm, updateCriteria]);

  const changePage = value => {
    const next = new URLSearchParams(params);
    next.set('page', String(value));
    setParams(next);
  };
  const clearFilters = () => {
    setSearchInput('');
    updateCriteria({ filename: '', type: '' });
  };

  return (
    <>
      <PageHeader
        eyebrow="Repository"
        title="Asset Library"
        description={state.loading ? 'Loading assets…' : `${state.total} ${state.total === 1 ? 'asset' : 'assets'} ${filtered ? 'matching your filters' : 'available across your workspace'}.`}
        actions={can('uploadAsset') && <Link to="/upload" className="primary-button"><Plus size={17} /> Upload asset</Link>}
      />
      <form role="search" aria-label="Asset Library" className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={event => {
        event.preventDefault();
        updateCriteria({ filename: searchTerm });
      }}>
        <div className="min-w-0 flex-1">
          <label htmlFor="library-filename" className="label">Search library</label>
          <div className="mt-2 flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input id="library-filename" type="search" className="input w-full pl-9" value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Asset name or filename" />
            </div>
            <button type="submit" className="secondary-button">Search</button>
          </div>
        </div>
        <label className="block">
          <span className="label">Sort by</span>
          <select className="input mt-2 w-full sm:min-w-44" value={sort} onChange={event => updateCriteria({ sort: event.target.value, filename: searchTerm })}>
            {assetSorts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </form>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter assets by type">
        {assetTypes.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={type === value}
            className={type === value ? 'primary-button' : 'secondary-button'} onClick={() => { if (value !== type) updateCriteria({ type: value, filename: searchTerm }); }}>
            {label}
          </button>
        ))}
      </div>
      {state.error && (
        <div className="mb-5 flex items-center justify-between rounded border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200" role="alert">
          <span>{state.error}</span><button onClick={load} className="flex items-center gap-2 font-medium"><RefreshCw size={14} /> Retry</button>
        </div>
      )}
      {state.loading ? <AssetGridSkeleton /> : state.error ? null : state.data.length ? <AssetGrid assets={state.data} /> : (
        filtered ? <EmptyState icon={FolderSearch} title="No matching assets" description="Try another asset name or clear the search and type filters."
          action={<button type="button" className="secondary-button" onClick={clearFilters}>Clear filters</button>} /> :
          <EmptyState icon={FolderSearch} title="No assets yet" description="The first uploaded file will begin your team's searchable asset library." action={can('uploadAsset') && <Link to="/upload" className="primary-button"><Plus size={16} /> Upload asset</Link>} />
      )}
      {!state.loading && !state.error && state.totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-between border-t border-white/[0.08] pt-5" aria-label="Asset pages">
          <button className="secondary-button" disabled={searchPending || state.page <= 1} onClick={() => changePage(state.page - 1)}>Previous</button>
          <span className="font-mono text-xs uppercase tracking-wider text-zinc-400">Page {state.page} / {state.totalPages}</span>
          <button className="secondary-button" disabled={searchPending || state.page >= state.totalPages} onClick={() => changePage(state.page + 1)}>Next</button>
        </nav>
      )}
    </>
  );
}
