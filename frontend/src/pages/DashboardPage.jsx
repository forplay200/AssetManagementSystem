import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Files, MessageSquare, Plus, RefreshCw, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import AssetTypeIcon from '../components/assets/AssetTypeIcon';
import PageHeader from '../components/common/PageHeader';
import ActivityFeed from '../components/dashboard/ActivityFeed';
import StatCard from '../components/dashboard/StatCard';
import TypeDistribution from '../components/dashboard/TypeDistribution';
import UploadChart from '../components/dashboard/UploadChart';
import { getApiError } from '../services/api';
import { assetService } from '../services/assetService';
import { assetType, formatBytes, formatDate } from '../utils/formatters';
import { usePermissions } from '../hooks/usePermissions';

export default function DashboardPage() {
  const { can } = usePermissions();
  const [state, setState] = useState({ loading: true, stats: null, assets: [], error: '', analyticsError: '' });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '', analyticsError: '' }));
    const [statsResult, assetsResult] = await Promise.allSettled([
      assetService.getDashboardStats(),
      assetService.search({ page: 1, pageSize: 100 }),
    ]);
    if (statsResult.status === 'rejected') {
      setState((current) => ({ ...current, loading: false, error: getApiError(statsResult.reason, 'Dashboard statistics could not be loaded.') }));
      return;
    }
    setState({
      loading: false,
      stats: statsResult.value,
      assets: assetsResult.status === 'fulfilled' ? assetsResult.value.data || [] : [],
      error: '',
      analyticsError: assetsResult.status === 'rejected' ? 'Detailed asset analytics are temporarily unavailable.' : '',
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (state.loading) return <DashboardSkeleton />;
  if (state.error) return <div className="panel p-8 text-center"><p className="text-sm text-red-200">{state.error}</p><button className="secondary-button mt-5" onClick={load}><RefreshCw size={15} /> Try again</button></div>;

  const { stats, assets } = state;
  const discussionRate = stats.totalAssets ? (stats.totalComments / stats.totalAssets).toFixed(1) : '0.0';
  return (
    <>
      <PageHeader eyebrow="Workspace overview" title="Dashboard" description="Repository health, asset trends, and recent team activity." actions={can('uploadAsset') && <Link to="/upload" className="primary-button"><Plus size={16} /> Upload asset</Link>} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Files} label="Total assets" value={stats.totalAssets} detail={`${assets.length} recent assets indexed for analysis`} />
        <StatCard icon={UsersRound} label="Workspace users" value={stats.totalUsers} detail={`${stats.recentUsers?.length || 0} recently created accounts`} tone="blue" />
        <StatCard icon={MessageSquare} label="Comments" value={stats.totalComments} detail={`${discussionRate} comments per asset`} tone="emerald" />
      </div>

      {state.analyticsError && <div className="mt-5 rounded border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3 text-sm text-amber-200/80">{state.analyticsError}</div>}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.75fr)]">
        <div className="space-y-5">
          <UploadChart assets={assets} />
          <section className="panel overflow-hidden">
            <div className="section-title m-5 mb-0"><Files size={16} /> Recent assets <Link to="/assets" className="ml-auto flex items-center gap-1 text-xs font-normal text-zinc-500 transition hover:text-aether-primary">View library <ArrowRight size={13} /></Link></div>
            {assets.length ? <div className="mt-4 divide-y divide-white/[0.06]">{assets.slice(0, 5).map((asset) => <Link key={asset.id} to={`/assets/${asset.id}`} className="grid gap-3 px-5 py-4 transition hover:bg-white/[0.025] sm:grid-cols-[36px_minmax(0,1fr)_auto] sm:items-center"><span className="grid h-9 w-9 place-items-center rounded border border-white/[0.08] bg-zinc-950 text-zinc-500"><AssetTypeIcon mime={asset.mimetype} size={17} /></span><div className="min-w-0"><p className="truncate text-sm font-medium text-zinc-300">{asset.originalname || asset.filename}</p><p className="mt-1 font-mono text-[9px] uppercase text-zinc-600">{assetType(asset.mimetype)} · {formatBytes(asset.size)}</p></div><span className="font-mono text-[10px] uppercase text-zinc-600">{formatDate(asset.uploadedAt)}</span></Link>)}</div> : <div className="px-6 py-10 text-center text-sm text-zinc-600">No recent assets are available.</div>}
          </section>
        </div>
        <div className="space-y-5"><TypeDistribution assets={assets} /><ActivityFeed recentUploads={stats.recentUploads} recentUsers={stats.recentUsers} totalComments={stats.totalComments} /></div>
      </div>
    </>
  );
}

function DashboardSkeleton() {
  return <div aria-label="Loading dashboard"><div className="mb-6 h-16 w-72 animate-pulse rounded bg-zinc-900" /><div className="grid gap-4 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="panel h-36 animate-pulse bg-zinc-900/50" />)}</div><div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.75fr)]"><div className="panel h-80 animate-pulse bg-zinc-900/50" /><div className="panel h-80 animate-pulse bg-zinc-900/50" /></div></div>;
}
