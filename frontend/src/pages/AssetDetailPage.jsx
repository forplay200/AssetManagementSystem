import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, FileText, LoaderCircle, MessageSquare, Trash2, WandSparkles } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import AssetPreview from '../components/assets/AssetPreview';
import CommentThread from '../components/comments/CommentThread';
import PageHeader from '../components/common/PageHeader';
import MetadataPanel from '../components/metadata/MetadataPanel';
import VersionHistory from '../components/versions/VersionHistory';
import { usePermissions } from '../hooks/usePermissions';
import { useAuth } from '../context/AuthContext';
import { WORKSPACE_ROLES } from '../auth/roles';
import { getApiError } from '../services/api';
import { assetService, saveDownload } from '../services/assetService';
import { assetType, formatBytes } from '../utils/formatters';
import useConfirmation from '../hooks/useConfirmation';
import { useLeaveGuard, usePendingChanges } from '../context/UnsavedChangesContext';

export default function AssetDetailPage() {
  const { assetId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, info: null, metadata: {}, tags: [], error: '' });
  const [actionError, setActionError] = useState('');
  const [activePanel, setActivePanel] = useState('details');
  const [versionFormMode, setVersionFormMode] = useState(null);
  const [versionRequest, setVersionRequest] = useState(0);
  const [visited, setVisited] = useState({ details: true });
  const [downloading, setDownloading] = useState(false);
  const { confirm, confirmation } = useConfirmation();
  const requestLeave = useLeaveGuard();
  const pendingChanges = usePendingChanges();
  const sequence = useRef(0);
  const backTo = /^\/(assets|search)(\?|$)/.test(location.state?.from || '') ? location.state.from : '/assets';
  const { can } = usePermissions();
  const { user } = useAuth();

  const load = useCallback(async (showLoading = true) => {
    const request = ++sequence.current;
    if (showLoading) setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const [info, metadataResult, tagsResult] = await Promise.all([
        assetService.getInfo(assetId), assetService.getMetadata(assetId), assetService.getTags(assetId),
      ]);
      if (request === sequence.current) setState({ loading: false, info, metadata: metadataResult.metadata || {}, tags: tagsResult.tags || [], error: '' });
    } catch (error) {
      if (request === sequence.current) setState((current) => ({ ...current, loading: false, error: getApiError(error, 'Unable to load this asset.') }));
    }
  }, [assetId]);

  useEffect(() => { const counter = sequence; setVisited({ details: true }); setActivePanel('details'); setVersionFormMode(null); setVersionRequest(0); load(); return () => { counter.current++; }; }, [load]);

  const download = async (main = false) => {
    if (downloading) return;
    setDownloading(true);
    setActionError('');
    try {
      saveDownload(await assetService.download(assetId, { main, filename: state.info.originalname }));
    } catch (error) { setActionError(getApiError(error, 'Download failed.')); }
    finally { setDownloading(false); }
  };

  const remove = async () => {
    const removed = await confirm({ title: 'Delete this asset?', details: `${state.info.originalname} · ${user?.team?.name || 'Current workspace'}`, description: 'The current file, companion files and preserved versions will be deleted. This cannot be undone in the app.', confirmLabel: 'Delete asset', onConfirm: () => assetService.remove(assetId) });
    if (removed) requestLeave(() => navigate('/assets', { replace: true }), { discard: true });
  };

  const selectPanel = id => { setVisited(current => ({ ...current, [id]: true })); setActivePanel(id); };

  if (state.loading) return <div className="grid min-h-[55vh] place-items-center"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-aether-primary" /><p className="mt-3 text-sm text-zinc-400">Loading asset details…</p></div></div>;
  if (state.error) return <div className="panel p-8 text-center"><p className="text-red-200">{state.error}</p><button className="secondary-button mt-5" onClick={load}>Try again</button></div>;

  const { info } = state;
  const ownsAsset = Number(info.userId) === Number(user?.id);
  const assetWorkspaceId = info.workspaceId || info.teamId;
  const isWorkspaceAsset = Boolean(assetWorkspaceId && Number(assetWorkspaceId) === Number(user?.team?.id));
  const canManageAsset = isWorkspaceAsset ? [WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.MANAGER].includes(user?.teamRole) : ownsAsset;
  const canDeleteAsset = isWorkspaceAsset ? user?.teamRole === WORKSPACE_ROLES.OWNER : ownsAsset;
  return (
    <>
      {location.state?.uploaded && <div className="mb-5 rounded border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">Asset files saved successfully. {location.state.processing?.status === 'queue-failed' ? 'AI processing can be retried from the Metadata panel.' : 'AI processing has been queued.'}</div>}
      {location.state?.metadataWarning && <div className="mb-5 rounded border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3 text-sm text-amber-200/80">{location.state.metadataWarning} You can add it again from the Metadata panel.</div>}
      <PageHeader eyebrow={assetType(info.mimetype)} title={info.originalname} description={`${formatBytes(info.package?.totalSize || info.size)} · ${info.package ? `${info.package.fileCount} package files` : info.mimetype}`} actions={<><Link to={backTo} state={{ restoreScroll: location.state?.scrollY }} className="secondary-button"><ArrowLeft size={16} />{backTo.startsWith("/search") ? "Search results" : "Library"}</Link><button className="primary-button" disabled={downloading} onClick={() => download()}><Download size={16} /> {downloading ? 'Preparing…' : info.package ? 'Download ZIP' : 'Download'}</button></>} />
      {actionError && <div className="mb-5 rounded border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{actionError}</div>}
      <div className="mb-5 flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded border border-white/[0.08] bg-aether-surface p-1" role="tablist" aria-label="Asset sections">
        {[['details', FileText, 'Details'], ['versions', WandSparkles, 'Versions'], ['comments', MessageSquare, 'Comments']].map(([id, Icon, label]) => <button key={id} id={`asset-tab-${id}`} role="tab" tabIndex={activePanel === id ? 0 : -1} aria-controls={`asset-panel-${id}`} aria-selected={activePanel === id} onKeyDown={event => { const keys = ["details", "versions", "comments"]; let next; if (event.key === "ArrowRight") next = keys[(keys.indexOf(id) + 1) % keys.length]; if (event.key === "ArrowLeft") next = keys[(keys.indexOf(id) + keys.length - 1) % keys.length]; if (event.key === "Home") next = keys[0]; if (event.key === "End") next = keys[keys.length - 1]; if (next) { event.preventDefault(); document.getElementById(`asset-tab-${next}`)?.focus(); } }} className={`detail-tab ${activePanel === id ? 'detail-tab-active' : ''}`} onClick={() => selectPanel(id)}><Icon size={15} />{label}</button>)}
      </div>
      <div id="asset-panel-details" role="tabpanel" aria-labelledby="asset-tab-details" hidden={activePanel !== "details"} className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,.75fr)]">
        <div className="space-y-5">
          <section className="panel overflow-hidden">
            {activePanel === "details" && <AssetPreview assetId={assetId} info={info} />}
            <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.08] p-4"><span className="font-mono text-xs uppercase tracking-wider text-zinc-400">Repository tags</span>{state.tags.length ? state.tags.slice(0, 6).map((tag) => <span key={tag.id || tag.name} className="tag-chip">{tag.name}</span>) : <span className="text-xs text-zinc-400">No manual tags</span>}{state.tags.length > 6 && <span className="text-xs text-zinc-400">+{state.tags.length - 6} more in AI enrichment</span>}</div>
          </section>
          <section className="panel flex flex-wrap items-center justify-between gap-4 p-5"><div><h2 className="font-display text-sm font-semibold text-zinc-100">Asset actions</h2><p className="mt-1 text-xs text-zinc-400">{info.package ? 'Download the complete model package or its original main file.' : 'Download the current file.'}</p></div><div className="flex flex-wrap gap-2"><button className="secondary-button" disabled={downloading} onClick={() => download()}><Download size={15} /> {downloading ? 'Preparing…' : info.package ? 'Download ZIP' : 'Download'}</button>{info.package && <button className="secondary-button" disabled={downloading} onClick={() => download(true)}>Original main file</button>}{/\.(obj|fbx)$/i.test(info.originalname) && can('createVersion') && canManageAsset && <button className="secondary-button" onClick={() => { setVersionFormMode('companions'); setVersionRequest(value => value + 1); selectPanel('versions'); }}>Update materials / textures</button>}{can('deleteAsset') && canDeleteAsset && <button className="danger-button" disabled={pendingChanges} onClick={remove}><Trash2 size={15} /> Delete</button>}</div></section>
        </div>
        <MetadataPanel key={assetId} active={activePanel === "details"} assetId={assetId} assetFilename={info.filename || info.originalname} metadata={state.metadata} repositoryTags={state.tags} canEdit={can('manageMetadata') && canManageAsset} onMetadataChange={(metadata) => setState((current) => ({ ...current, metadata }))} onTagsChange={(tags) => setState((current) => ({ ...current, tags }))} />
      </div>
      <div id="asset-panel-versions" role="tabpanel" aria-labelledby="asset-tab-versions" hidden={activePanel !== "versions"}>{visited.versions && <VersionHistory key={assetId} assetId={assetId} assetName={info.originalname} assetInfo={info} active={activePanel === "versions"} initialMode={versionFormMode} modeRequest={versionRequest} canCreate={can('createVersion') && canManageAsset} onCurrentVersionChanged={() => load(false)} />}</div>
      <div id="asset-panel-comments" role="tabpanel" aria-labelledby="asset-tab-comments" hidden={activePanel !== "comments"}>{visited.comments && <CommentThread key={assetId} assetId={assetId} />}</div>
      {confirmation}
    </>
  );
}
