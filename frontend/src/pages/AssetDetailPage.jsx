import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Download, FileText, LoaderCircle, MessageSquare, Trash2, WandSparkles } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import AssetPreview from '../components/assets/AssetPreview';
import CommentThread from '../components/comments/CommentThread';
import PageHeader from '../components/common/PageHeader';
import MetadataPanel from '../components/metadata/MetadataPanel';
import VersionHistory from '../components/versions/VersionHistory';
import { usePermissions } from '../hooks/usePermissions';
import { useAuth } from '../context/AuthContext';
import { getApiError } from '../services/api';
import { assetService } from '../services/assetService';
import { assetType, formatBytes } from '../utils/formatters';

export default function AssetDetailPage() {
  const { assetId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, info: null, metadata: {}, tags: [], error: '' });
  const [actionError, setActionError] = useState('');
  const [activePanel, setActivePanel] = useState('details');
  const { can } = usePermissions();
  const { user } = useAuth();

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const [info, metadataResult, tagsResult] = await Promise.all([
        assetService.getInfo(assetId), assetService.getMetadata(assetId), assetService.getTags(assetId),
      ]);
      setState({ loading: false, info, metadata: metadataResult.metadata || {}, tags: tagsResult.tags || [], error: '' });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: getApiError(error, 'Unable to load this asset.') }));
    }
  }, [assetId]);

  useEffect(() => { load(); }, [load]);

  const download = async () => {
    setActionError('');
    try {
      const url = URL.createObjectURL(await assetService.download(assetId));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = state.info.originalname; anchor.click(); URL.revokeObjectURL(url);
    } catch (error) { setActionError(getApiError(error, 'Download failed.')); }
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${state.info.originalname}? This action cannot be undone.`)) return;
    try { await assetService.remove(assetId); navigate('/assets', { replace: true }); } catch (error) { setActionError(getApiError(error, 'The asset could not be deleted.')); }
  };

  if (state.loading) return <div className="grid min-h-[55vh] place-items-center"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-aether-primary" /><p className="mt-3 text-sm text-zinc-500">Loading asset details…</p></div></div>;
  if (state.error) return <div className="panel p-8 text-center"><p className="text-red-200">{state.error}</p><button className="secondary-button mt-5" onClick={load}>Try again</button></div>;

  const { info } = state;
  const ownsAsset = Number(info.userId) === Number(user?.id);
  const assetWorkspaceId = info.workspaceId || info.teamId;
  const isWorkspaceAsset = Boolean(assetWorkspaceId && Number(assetWorkspaceId) === Number(user?.team?.id));
  const canManageAsset = isWorkspaceAsset ? ['owner', 'manager'].includes(user?.teamRole) : user?.role === 'admin' || ownsAsset;
  const canDeleteAsset = isWorkspaceAsset ? user?.teamRole === 'owner' : user?.role === 'admin' || ownsAsset;
  return (
    <>
      {location.state?.uploaded && <div className="mb-5 rounded border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">Asset uploaded successfully. AI processing has been queued.</div>}
      {location.state?.metadataWarning && <div className="mb-5 rounded border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3 text-sm text-amber-200/80">{location.state.metadataWarning} You can add it again from the Metadata panel.</div>}
      <PageHeader eyebrow={assetType(info.mimetype)} title={info.originalname} description={`${formatBytes(info.size)} · ${info.mimetype}`} actions={<><Link to="/assets" className="secondary-button"><ArrowLeft size={16} /> Library</Link><button className="primary-button" onClick={download}><Download size={16} /> Download</button></>} />
      {actionError && <div className="mb-5 rounded border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{actionError}</div>}
      <div className="mb-5 flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded border border-white/[0.08] bg-aether-surface p-1" role="tablist" aria-label="Asset sections">
        {[['details', FileText, 'Details'], ['versions', WandSparkles, 'Versions'], ['comments', MessageSquare, 'Comments']].map(([id, Icon, label]) => <button key={id} role="tab" aria-selected={activePanel === id} className={`detail-tab ${activePanel === id ? 'detail-tab-active' : ''}`} onClick={() => setActivePanel(id)}><Icon size={15} />{label}</button>)}
      </div>
      {activePanel === 'details' && <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,.75fr)]">
        <div className="space-y-5">
          <section className="panel overflow-hidden">
            <AssetPreview assetId={assetId} info={info} />
            <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.08] p-4"><span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">Repository tags</span>{state.tags.length ? state.tags.map((tag) => <span key={tag.id || tag.name} className="tag-chip">{tag.name}</span>) : <span className="text-xs text-zinc-600">No manual tags</span>}</div>
          </section>
          <section className="panel flex flex-wrap items-center justify-between gap-4 p-5"><div><h2 className="font-display text-sm font-semibold text-zinc-100">Asset actions</h2><p className="mt-1 text-xs text-zinc-500">Download the current file{can('deleteAsset') && canDeleteAsset ? ' or permanently remove this asset' : ''}.</p></div><div className="flex gap-2"><button className="secondary-button" onClick={download}><Download size={15} /> Download</button>{can('deleteAsset') && canDeleteAsset && <button className="danger-button" onClick={remove}><Trash2 size={15} /> Delete</button>}</div></section>
        </div>
        <MetadataPanel assetId={assetId} metadata={state.metadata} repositoryTags={state.tags} canEdit={can('manageMetadata') && canManageAsset} onMetadataChange={(metadata) => setState((current) => ({ ...current, metadata }))} onTagsChange={(tags) => setState((current) => ({ ...current, tags }))} />
      </div>}
      {activePanel === 'versions' && <VersionHistory assetId={assetId} assetName={info.originalname} canCreate={can('createVersion') && canManageAsset} onCurrentVersionChanged={() => load(false)} />}
      {activePanel === 'comments' && <CommentThread assetId={assetId} />}
    </>
  );
}
