import { useEffect, useState } from 'react';
import { FolderSearch, Plus, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import AssetGrid, { AssetGridSkeleton } from '../components/assets/AssetGrid';
import EmptyState from '../components/common/EmptyState';
import PageHeader from '../components/common/PageHeader';
import { assetService } from '../services/assetService';
import { getApiError } from '../services/api';
import { usePermissions } from '../hooks/usePermissions';

export default function AssetsPage() {
  const { can } = usePermissions();
  const [state, setState] = useState({ loading: true, data: [], total: 0, page: 1, totalPages: 1, error: '' });

  const load = async (page = 1) => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const result = await assetService.search({ page, pageSize: 12 });
      setState({ loading: false, data: result.data || [], total: result.totalItems || 0, page: result.currentPage || page, totalPages: result.totalPages || 1, error: '' });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: getApiError(error, 'Unable to load the asset repository.') }));
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <>
      <PageHeader
        eyebrow="Repository"
        title="Asset Library"
        description={`${state.total} ${state.total === 1 ? 'asset' : 'assets'} available across your workspace.`}
        actions={can('uploadAsset') && <Link to="/upload" className="primary-button"><Plus size={17} /> Upload asset</Link>}
      />
      {state.error && (
        <div className="mb-5 flex items-center justify-between rounded border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200" role="alert">
          <span>{state.error}</span><button onClick={() => load(state.page)} className="flex items-center gap-2 font-medium"><RefreshCw size={14} /> Retry</button>
        </div>
      )}
      {state.loading ? <AssetGridSkeleton /> : state.data.length ? <AssetGrid assets={state.data} /> : (
        <EmptyState icon={FolderSearch} title="No assets yet" description="The first uploaded file will begin your team's searchable asset library." action={can('uploadAsset') && <Link to="/upload" className="primary-button"><Plus size={16} /> Upload asset</Link>} />
      )}
      {!state.loading && state.totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-between border-t border-white/[0.08] pt-5" aria-label="Asset pages">
          <button className="secondary-button" disabled={state.page <= 1} onClick={() => load(state.page - 1)}>Previous</button>
          <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Page {state.page} / {state.totalPages}</span>
          <button className="secondary-button" disabled={state.page >= state.totalPages} onClick={() => load(state.page + 1)}>Next</button>
        </nav>
      )}
    </>
  );
}
