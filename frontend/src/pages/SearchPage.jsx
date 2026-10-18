import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Filter, RotateCcw, Search as SearchIcon } from 'lucide-react';
import { useLocation, useSearchParams } from 'react-router-dom';
import AssetGrid, { AssetGridSkeleton } from '../components/assets/AssetGrid';
import EmptyState from '../components/common/EmptyState';
import PageHeader from '../components/common/PageHeader';
import { getApiError } from '../services/api';
import { assetService } from '../services/assetService';

const initialFilters = { filename: '', metadata: '', q: '', tags: '', type: '', date: '', creator: '' };

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlFilters = useMemo(() => Object.fromEntries(Object.keys(initialFilters).map((key) => [key, searchParams.get(key) || ''])), [searchParams]);
  const [filters, setFilters] = useState(urlFilters);
  const location = useLocation();
  const sequence = useRef(0);
  const restored = useRef(false);
  const requestedPage = Number(searchParams.get('page'));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const submitted = searchParams.get('submitted') === '1' || Object.values(urlFilters).some(Boolean);
  const [advanced, setAdvanced] = useState(Boolean(urlFilters.tags || urlFilters.type || urlFilters.date || urlFilters.creator));
  const [result, setResult] = useState({ loading: false, searched: false, data: [], total: 0, page: 1, totalPages: 1, error: '' });

  useEffect(() => { setFilters(urlFilters); }, [urlFilters]);

  const runSearch = useCallback(async (params, page = 1) => {
    const request = ++sequence.current;
    setResult((current) => ({ ...current, loading: true, searched: true, error: '' }));
    try {
      const response = await assetService.search({ ...params, page, pageSize: 24 });
      if (request !== sequence.current) return;
      setResult({
        loading: false,
        searched: true,
        data: response.data || [],
        total: response.totalItems || 0,
        page: response.currentPage || page,
        totalPages: response.totalPages || 1,
        error: '',
      });
    } catch (error) {
      if (request !== sequence.current) return;
      setResult((current) => ({ ...current, loading: false, data: [], error: getApiError(error, 'Search could not be completed.') }));
    }
  }, []);

  useEffect(() => {
    const counter = sequence;
    if (submitted) runSearch(urlFilters, page);
    else { sequence.current++; setResult({ loading: false, searched: false, data: [], total: 0, page: 1, totalPages: 1, error: '' }); }
    return () => { counter.current++; };
  }, [urlFilters, page, submitted, runSearch]);
  useEffect(() => {
    if (!result.loading && result.searched && !restored.current && Number.isFinite(location.state?.restoreScroll)) { window.scrollTo?.(0, location.state.restoreScroll); restored.current = true; }
  }, [result.loading, result.searched, location.state]);
  const changePage = nextPage => { const next = new URLSearchParams(searchParams); next.set('page', nextPage); setSearchParams(next); };

  const submit = (event) => {
    event.preventDefault();
    const clean = Object.fromEntries(Object.entries(filters).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value));
    const next = new URLSearchParams({ ...clean, submitted: '1' });
    if (next.toString() === searchParams.toString()) runSearch(clean, 1); else setSearchParams(next);
  };

  const reset = () => {
    sequence.current++;
    setFilters(initialFilters);
    setSearchParams({});
    setResult({ loading: false, searched: false, data: [], total: 0, page: 1, totalPages: 1, error: '' });
  };

  return (
    <>
      <PageHeader eyebrow="Advanced retrieval" title="Search Assets" description="Find assets by display name or filename, metadata, AI enrichment, tag, type, upload date, or creator." />
      <form className="panel mb-6 p-5" onSubmit={submit}>
        <div className="grid gap-4 lg:grid-cols-3">
          <label><span className="label">Asset name or filename</span><div className="relative mt-2"><SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" /><input className="input w-full pl-9" value={filters.filename} onChange={(event) => setFilters({ ...filters, filename: event.target.value })} placeholder="e.g. forest_tileset" /></div></label>
          <label><span className="label">Metadata text</span><input className="input mt-2 w-full" value={filters.metadata} onChange={(event) => setFilters({ ...filters, metadata: event.target.value })} placeholder="Description, category, or project" /></label>
          <label><span className="label">AI metadata</span><input className="input mt-2 w-full" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="Tag, keyword, transcript, or summary" /></label>
        </div>
        <button type="button" className="secondary-button mt-4" aria-expanded={advanced} aria-controls="advanced-search-filters" onClick={() => setAdvanced(!advanced)}>Advanced filters</button>
        <div id="advanced-search-filters" hidden={!advanced} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label><span className="label">Tags</span><input className="input mt-2 w-full" value={filters.tags} onChange={(event) => setFilters({ ...filters, tags: event.target.value })} placeholder="environment, pixel-art" /></label>
          <label><span className="label">Asset type</span><select className="input mt-2 w-full" value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="">All types</option><option value="image">Images</option><option value="audio">Audio</option><option value="model">3D models</option><option value="text">Scripts & data</option></select></label>
          <label><span className="label">Upload date</span><input type="date" className="input mt-2 w-full [color-scheme:dark]" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} /></label>
          <label><span className="label">Creator</span><input className="input mt-2 w-full" value={filters.creator} onChange={(event) => setFilters({ ...filters, creator: event.target.value })} placeholder="Username or user ID" /></label>
        </div>
        <div className="mt-5 flex justify-end gap-3 border-t border-white/[0.08] pt-5"><button type="button" className="secondary-button" onClick={reset}><RotateCcw size={15} /> Reset</button><button className="primary-button"><Filter size={16} /> Search assets</button></div>
      </form>

      {submitted && Object.values(urlFilters).some(Boolean) && <div className="mb-4 flex flex-wrap gap-2" aria-label="Applied search filters">{Object.entries(urlFilters).filter(([, value]) => value).map(([key, value]) => <span className="tag-chip" key={key}>{({ filename: "Name or filename", metadata: "Metadata", q: "AI metadata", tags: "Tags", type: "Type", date: "Date", creator: "Creator" })[key]}: {value}</span>)}</div>}
      {result.error && <div className="mb-5 rounded border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200" role="alert">{result.error}<button className="secondary-button ml-3" onClick={() => runSearch(urlFilters, page)}>Retry</button></div>}
      {result.loading ? <AssetGridSkeleton /> : result.error ? null : result.searched && result.data.length ? <><div className="mb-4 flex items-center justify-between"><p className="text-sm text-zinc-400"><span className="font-semibold text-zinc-100">{result.total}</span> matching {result.total === 1 ? 'asset' : 'assets'}</p>{result.totalPages > 1 && <span className="font-mono text-xs uppercase tracking-wider text-zinc-400">Page {result.page} / {result.totalPages}</span>}</div><AssetGrid assets={result.data} />{result.totalPages > 1 && <nav className="mt-6 flex items-center justify-between border-t border-white/[0.08] pt-5" aria-label="Search result pages"><button type="button" className="secondary-button" disabled={result.page <= 1} onClick={() => changePage(result.page - 1)}>Previous</button><span className="font-mono text-xs uppercase tracking-wider text-zinc-400">Page {result.page} / {result.totalPages}</span><button type="button" className="secondary-button" disabled={result.page >= result.totalPages} onClick={() => changePage(result.page + 1)}>Next</button></nav>}</> : result.searched ? <EmptyState icon={SearchIcon} title="No matching assets" description="Try removing a filter, using a shorter name or filename, or searching with fewer tags." /> : <EmptyState icon={Filter} title="Build a precise search" description="Use one or more filters above to retrieve assets from the repository." />}
    </>
  );
}
