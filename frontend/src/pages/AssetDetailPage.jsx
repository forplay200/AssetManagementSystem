import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Download, Ellipsis, FileText, LoaderCircle, MessageSquare, Pencil, Trash2, WandSparkles, X } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import RenameDialog from '../components/common/RenameDialog';
import { getAssetDisplayName } from '../utils/assetDisplayName';
import AssetPreview from '../components/assets/AssetPreview';
import AssetActionPopover from '../components/assets/AssetActionPopover';
import CommentThread from '../components/comments/CommentThread';
import MetadataPanel from '../components/metadata/MetadataPanel';
import VersionHistory from '../components/versions/VersionHistory';
import { usePermissions } from '../hooks/usePermissions';
import { useAuth } from '../context/AuthContext';
import { canManageAsset as mayManageAsset, canDeleteAsset as mayDeleteAsset, canManageWorkspaceVocabulary, canDownloadAsset as mayDownloadAsset } from '../auth/assetPermissions';
import { getApiError } from '../services/api';
import { assetService, saveDownload } from '../services/assetService';
import { getEditContext } from '../services/assetEditContext';
import { assetType, formatBytes } from '../utils/formatters';
import useConfirmation from '../hooks/useConfirmation';
import { useLeaveGuard, usePendingChanges, useHasUnsavedChanges } from '../context/UnsavedChangesContext';
import useAssetEditing from '../hooks/useAssetEditing';
import TrashAssetDialog from '../components/assets/TrashAssetDialog';
import AssetActivityDrawer from '../components/audit/AssetActivityDrawer';

const actionOption = 'flex min-h-11 w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-violet-400 disabled:opacity-40 sm:min-h-9';

export default function AssetDetailPage() {
  const { assetId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, info: null, metadata: {}, tags: [], error: '' });
  const [renaming, setRenaming] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [focusedVersion, setFocusedVersion] = useState(null);
  const [notice, setNotice] = useState('');
  const [dismissedUpload, setDismissedUpload] = useState(null);
  const savedNames = useRef({});
  const [actionError, setActionError] = useState('');
  const [activePanel, setActivePanel] = useState('details');
  const [versionFormMode, setVersionFormMode] = useState(null);
  const [versionRequest, setVersionRequest] = useState(0);
  const [visited, setVisited] = useState({ details: true });
  const [downloading, setDownloading] = useState(false);
  const { confirm, confirmation } = useConfirmation();
  const requestLeave = useLeaveGuard();
  const pendingChanges = usePendingChanges();
  const hasUnsavedChanges = useHasUnsavedChanges();
  const sequence = useRef(0);
  const backTo = /^\/(assets|search)(\?|$)/.test(location.state?.from || '') ? location.state.from : '/assets';
  const { can } = usePermissions();
  const { user, token } = useAuth();
  const editing = useAssetEditing(assetId, Boolean(state.info?.governanceEnabled), `${token}:${user?.team?.id}`);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const identity = useRef(null);
  identity.current = { assetId, token, workspaceId: user?.team?.id };

  const load = useCallback(async (showLoading = true) => {
    const request = ++sequence.current;
    const nameRevision = savedNames.current[assetId];
    if (showLoading) setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const [info, metadataResult, tagsResult] = await Promise.all([
        assetService.getInfo(assetId), assetService.getMetadata(assetId), assetService.getTags(assetId),
      ]);
      if (request === sequence.current) setState({ loading: false, info: savedNames.current[assetId] !== nameRevision ? { ...info, displayName: savedNames.current[assetId] } : info, metadata: metadataResult.metadata || {}, tags: tagsResult.tags || [], error: '' });
    } catch (error) {
      if (request === sequence.current) setState((current) => ({ ...current, loading: false, error: getApiError(error, 'Unable to load this asset.') }));
    }
  }, [assetId]);

  useEffect(() => { const counter = sequence; setRenaming(false); setTrashOpen(false); setActivityOpen(false); setFocusedVersion(null); setNotice(''); setActionError(''); setVisited({ details: true }); setActivePanel('details'); setVersionFormMode(null); setVersionRequest(0); load(); return () => { counter.current++; }; }, [load]);

  const aiProcessing = !state.loading && state.info?.aiProcessing;
  useEffect(() => {
    if (!aiProcessing) return undefined;
    let stopped = false;
    let timer;
    const deadline = Date.now() + 5 * 60 * 1000;
    const poll = async () => {
      const request = sequence.current;
      try {
        const { aiProcessing, pendingAiResult } = await assetService.getInfo(assetId);
        if (stopped) return;
        if (request === sequence.current) {
          setState(current => ({ ...current, info: { ...current.info, aiProcessing, pendingAiResult } }));
          if (!aiProcessing) return;
        }
      } catch (error) {
        if ([401, 403, 404, 410].includes(error.response?.status)) return;
      }
      if (!stopped && Date.now() < deadline) timer = setTimeout(poll, 3000);
    };
    timer = setTimeout(poll, 3000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [assetId, aiProcessing, token, user?.team?.id]);

  const download = async (main = false) => {
    if (downloading || !mayDownloadAsset(user, state.info)) return;
    setDownloading(true);
    setActionError('');
    try {
      saveDownload(await assetService.download(assetId, { main, filename: state.info.originalname }));
    } catch (error) { setActionError(getApiError(error, 'Download failed.')); }
    finally { setDownloading(false); }
  };

  const remove = async () => {
    if (state.info?.governanceEnabled) { setTrashOpen(true); return; }
    const removed = await confirm({ title: 'Delete this asset?', details: `${getAssetDisplayName(state.info)} · ${user?.team?.name || 'Current workspace'}`, description: 'The current file, companion files and preserved versions will be deleted. This cannot be undone in the app.', confirmLabel: 'Delete asset', onConfirm: () => assetService.remove(assetId) });
    if (removed) requestLeave(() => navigate('/assets', { replace: true }), { discard: true });
  };

  const selectPanel = id => { setVisited(current => ({ ...current, [id]: true })); setActivePanel(id); };
  useEffect(() => {
    if (state.loading) return;
    const query = new URLSearchParams(location.search);
    const panel = query.get('panel');
    if (['details', 'versions', 'comments'].includes(panel)) { setVisited(current => ({ ...current, [panel]: true })); setActivePanel(panel); }
    setFocusedVersion(query.get('version'));
  }, [location.search, assetId, state.loading]);
  const startEditing = async (downloadFile = false) => {
    if (pendingChanges) return;
    if (hasUnsavedChanges() && !await confirm({ title: 'Start a fresh editing session?', description: 'Copy any changes you want to keep. Starting again discards the previous page draft and loads the latest asset.', confirmLabel: 'Discard draft and start', danger: false })) return;
    if (await editing.start()) {
      setEditorGeneration(value => value + 1); setRenaming(false); setVersionFormMode(null);
      await load(false);
      if (downloadFile) await download();
    }
  };
  const cancelEditing = async () => {
    if (pendingChanges) return;
    if (hasUnsavedChanges() && !await confirm({ title: 'Cancel editing?', description: 'Your unsubmitted page changes will be discarded.', confirmLabel: 'Discard and release' })) return;
    if (await editing.cancel()) { setEditorGeneration(value => value + 1); setRenaming(false); }
  };
  const openRename = async () => {
    const expected = identity.current;
    let acquiredToken;
    if (state.info?.governanceEnabled && !editing.session) {
      setRenaming({ opening: true });
      if (!await editing.start()) { setRenaming(false); return; }
      acquiredToken = getEditContext(assetId)?.token;
      await load(false);
      if (identity.current.assetId !== expected.assetId || identity.current.token !== expected.token || identity.current.workspaceId !== expected.workspaceId) return;
      if (getEditContext(assetId)?.token !== acquiredToken) { setRenaming(false); return; }
    }
    setRenaming({ acquiredToken });
  };
  const closeRename = () => {
    if (renaming.acquiredToken && getEditContext(assetId)?.token === renaming.acquiredToken) editing.cancel();
    setRenaming(false);
  };

  if (state.loading) return <div className="grid min-h-[55vh] place-items-center"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-aether-primary" /><p className="mt-3 text-sm text-zinc-400">Loading asset details…</p></div></div>;
  if (state.error) return <div className="panel p-8 text-center"><p className="text-red-200">{state.error}</p><button className="secondary-button mt-5" onClick={load}>Try again</button></div>;

  const { info } = state;
  const canRenameAsset = mayManageAsset(user, info);
  const lockedByAnotherEditor = info.governanceEnabled && editing.status?.locked && !editing.session;
  const canManageAsset = canRenameAsset && (!info.governanceEnabled || Boolean(editing.session));
  const canDeleteAsset = mayDeleteAsset(user, info);
  const canDownload = mayDownloadAsset(user, info);
  const canUpdateMaterials = /\.(obj|fbx)$/i.test(info.originalname) && can('createVersion') && canManageAsset;
  const showDelete = can('deleteAsset') && canDeleteAsset;
  const deleteLabel = info.governanceEnabled ? 'Move to recycle bin' : 'Delete';
  const deleteUnavailable = pendingChanges || lockedByAnotherEditor;
  const canManageVocabulary = canManageWorkspaceVocabulary(user, info);
  const canStartEditing = info.governanceEnabled && canRenameAsset && !editing.session;
  const editUnavailable = editing.busy || pendingChanges || lockedByAnotherEditor;
  const canDownloadAndEdit = canStartEditing && !lockedByAnotherEditor;
  const editingStatus = editing.session ? 'You are editing this asset.'
    : lockedByAnotherEditor ? `${editing.status.holderName || 'Another member'} is editing this asset.`
      : editing.status ? 'Asset is available for editing.' : 'Checking editing status…';
  const statusColor = editing.session ? 'border-violet-400/25 bg-violet-400/10 text-violet-200'
    : lockedByAnotherEditor ? 'border-amber-400/25 bg-amber-400/10 text-amber-200'
      : 'border-white/10 bg-white/[0.04] text-zinc-300';
  return (
    <>
      <header className="mb-4">
        <Link to={backTo} state={{ restoreScroll: location.state?.scrollY }} className="inline-flex min-h-11 items-center gap-2 rounded text-sm text-zinc-400 hover:text-zinc-100 focus-visible:outline focus-visible:outline-violet-400 sm:min-h-7">
          <ArrowLeft size={15} />{backTo.startsWith('/search') ? 'Search results' : 'Library'}
        </Link>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-aether-primary">{assetType(info.mimetype)}</p>
            <div className="mt-1 flex items-center gap-2">
              <h1 className="min-w-0 font-display text-2xl font-semibold leading-snug text-zinc-50 [overflow-wrap:anywhere] sm:text-[28px]">{getAssetDisplayName(info)}</h1>
              {canRenameAsset && <button type="button" className="icon-action" aria-label="Rename asset" onClick={openRename} disabled={editUnavailable || renaming.opening} title={lockedByAnotherEditor ? editingStatus : undefined}><Pencil size={16} aria-hidden="true" /></button>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-400">
              <p>{formatBytes(info.package?.totalSize || info.size)} · {info.package ? info.package.fileCount + ' package files' : info.mimetype}</p>
              {info.governanceEnabled && <AssetActionPopover alignLeft ariaLabel={editingStatus}
                className={'inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-left text-xs focus-visible:outline focus-visible:outline-violet-400 sm:min-h-7 ' + statusColor}
                label={<><span role="status" className="[overflow-wrap:anywhere]">{editingStatus}</span><ChevronDown size={13} className="shrink-0" aria-hidden="true" /></>}>
                {close => <>
                  <p className="px-3 py-2 text-xs leading-relaxed text-zinc-300">Changes require an editing session. Sessions expire 30 minutes after the last connection.</p>
                  <button type="button" className={actionOption} onClick={() => { close(); load(false); }}>Refresh asset and suggestions</button>
                </>}
              </AssetActionPopover>}
            </div>
          </div>
          <div className="relative flex flex-wrap items-center gap-2 text-zinc-200 lg:shrink-0" role="group" aria-label="Current asset actions">
            {canDownload && (info.package || canDownloadAndEdit ? (
              <AssetActionPopover className="primary-button disabled:opacity-50" disabled={downloading}
                label={<><Download size={16} aria-hidden="true" />{downloading ? 'Preparing…' : 'Download'}<ChevronDown size={14} aria-hidden="true" /></>}>
                {close => <>
                  <button type="button" className={actionOption} onClick={() => { close(); download(); }}>{info.package ? 'Download ZIP' : 'Download current file'}</button>
                  {info.package && <button type="button" className={actionOption} onClick={() => { close(); download(true); }}>Original main file</button>}
                  {canDownloadAndEdit && <button type="button" className={actionOption} disabled={editUnavailable} onClick={() => { close(); startEditing(true); }}>Download and start editing</button>}
                </>}
              </AssetActionPopover>
            ) : <button type="button" className="primary-button disabled:opacity-50" disabled={downloading} onClick={() => download()}><Download size={16} aria-hidden="true" />{downloading ? 'Preparing…' : 'Download'}</button>)}
            {info.governanceEnabled && canRenameAsset && (editing.session ? (
              <button type="button" className="secondary-button disabled:opacity-50" disabled={editing.busy || pendingChanges} onClick={cancelEditing}>Cancel editing</button>
            ) : <button type="button" className="secondary-button disabled:opacity-50" disabled={editUnavailable} onClick={() => startEditing()}>Start editing</button>)}
            {info.governanceEnabled && <button type="button" className="secondary-button" onClick={() => setActivityOpen(true)}>Activity</button>}
            {showDelete && !canUpdateMaterials && <button type="button" className="danger-button w-10 min-w-11 px-0 sm:min-w-0" disabled={deleteUnavailable} aria-label={deleteLabel} title={deleteLabel} onClick={remove}>
              <Trash2 size={16} aria-hidden="true" />
            </button>}
            {canUpdateMaterials && <AssetActionPopover className="secondary-button px-3" label={<><Ellipsis size={18} aria-hidden="true" /><span className="sr-only">More actions</span></>}>
              {close => <>
                <button type="button" className={actionOption} onClick={() => {
                  close(); setVersionFormMode('companions'); setVersionRequest(value => value + 1); selectPanel('versions');
                }}>Update materials / textures</button>
                {showDelete && <button type="button" className={actionOption + ' text-red-200'} disabled={deleteUnavailable} onClick={() => { close(); remove(); }}>
                  <Trash2 size={15} aria-hidden="true" />{deleteLabel}
                </button>}
              </>}
            </AssetActionPopover>}
          </div>
        </div>
        {editing.error && <p role="alert" className="mt-2 text-sm text-red-200">{editing.error}</p>}
        {actionError && <p role="alert" className="mt-2 text-sm text-red-200">{actionError}</p>}
        {notice && <p role="status" className="mt-2 text-sm text-emerald-300">{notice}</p>}
        {location.state?.uploaded && dismissedUpload !== location.key && <div className="mt-2 flex items-center gap-2 text-sm text-emerald-200">
          <p role="status">Asset files saved successfully. {location.state.processing?.status === 'queue-failed' ? 'Retry AI processing in Metadata.' : 'AI processing has been queued.'}</p>
          <button type="button" className="icon-action" onClick={() => setDismissedUpload(location.key)} aria-label="Dismiss upload message"><X size={15} aria-hidden="true" /></button>
        </div>}
        {location.state?.metadataWarning && <p role="status" className="mt-2 text-sm text-amber-200">{location.state.metadataWarning} You can add it again from the Metadata panel.</p>}
      </header>
      <div className="mb-5 flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded border border-white/[0.08] bg-aether-surface p-1" role="tablist" aria-label="Asset sections">
        {[['details', FileText, 'Details'], ['versions', WandSparkles, 'Versions'], ['comments', MessageSquare, 'Comments']].map(([id, Icon, label]) => <button key={id} id={`asset-tab-${id}`} role="tab" tabIndex={activePanel === id ? 0 : -1} aria-controls={`asset-panel-${id}`} aria-selected={activePanel === id} onKeyDown={event => { const keys = ["details", "versions", "comments"]; let next; if (event.key === "ArrowRight") next = keys[(keys.indexOf(id) + 1) % keys.length]; if (event.key === "ArrowLeft") next = keys[(keys.indexOf(id) + keys.length - 1) % keys.length]; if (event.key === "Home") next = keys[0]; if (event.key === "End") next = keys[keys.length - 1]; if (next) { event.preventDefault(); document.getElementById(`asset-tab-${next}`)?.focus(); } }} className={`detail-tab ${activePanel === id ? 'detail-tab-active' : ''}`} onClick={() => selectPanel(id)}><Icon size={15} />{label}</button>)}
      </div>
      <div id="asset-panel-details" role="tabpanel" aria-labelledby="asset-tab-details" hidden={activePanel !== "details"} className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,.75fr)]">
        <div className="space-y-5">
          <section className="panel overflow-hidden">
            {activePanel === "details" && <AssetPreview auditDownloads assetId={assetId} info={info} canDownload={canDownload} />}
            {info.mimetype?.startsWith('audio/') && <div className="flex justify-end px-4 pb-4">
              <button type="button" className="secondary-button" onClick={() => document.getElementById('asset-ai-results')?.focus()}>View audio AI results</button>
            </div>}
            <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.08] p-4"><span className="font-mono text-xs uppercase tracking-wider text-zinc-400">Repository tags</span>{state.tags.length ? state.tags.slice(0, 6).map((tag) => <span key={tag.id || tag.name} className="tag-chip">{tag.name}</span>) : <span className="text-xs text-zinc-400">No manual tags</span>}{state.tags.length > 6 && <span className="text-xs text-zinc-400">+{state.tags.length - 6} more in AI enrichment</span>}</div>
          </section>
        </div>
        <MetadataPanel canRequestEditing={mayManageAsset(user, info)} governanceEnabled={info.governanceEnabled} aiProcessing={info.aiProcessing} pendingAiResult={info.pendingAiResult} onRefreshAsset={() => load(false)} onCancelEditing={info.governanceEnabled ? cancelEditing : undefined} key={`${assetId}:${editorGeneration}`} active={activePanel === "details"} assetId={assetId} assetFilename={info.filename || info.originalname} metadata={state.metadata} repositoryTags={state.tags} canDownload={canDownload} canEdit={can('manageMetadata') && canManageAsset} canManageVocabulary={canManageVocabulary} onMetadataChange={(metadata) => setState((current) => ({ ...current, metadata }))} onTagsChange={(tags) => setState((current) => ({ ...current, tags }))} />
      </div>
      <div id="asset-panel-versions" role="tabpanel" aria-labelledby="asset-tab-versions" hidden={activePanel !== "versions"}>{visited.versions && <VersionHistory focusedVersion={focusedVersion} onCancelEditing={info.governanceEnabled ? cancelEditing : undefined} key={`${assetId}:${editorGeneration}`} assetId={assetId} assetName={info.originalname} assetInfo={info} active={activePanel === "versions"} initialMode={versionFormMode} modeRequest={versionRequest} canDownload={canDownload} canCreate={can('createVersion') && canManageAsset} onCurrentVersionChanged={() => load(false)} />}</div>
      <div id="asset-panel-comments" role="tabpanel" aria-labelledby="asset-tab-comments" hidden={activePanel !== "comments"}>{visited.comments && <CommentThread key={assetId} assetId={assetId} />}</div>
      {renaming && !renaming.opening && <RenameDialog title="Rename asset" initialName={getAssetDisplayName(info)} sourceName={info.originalname} maxLength={200} onClose={closeRename} onSave={async name => {
        const expected = identity.current;
        const { asset } = await assetService.rename(assetId, name);
        if (identity.current.assetId !== expected.assetId || identity.current.token !== expected.token || identity.current.workspaceId !== expected.workspaceId) return;
        savedNames.current[assetId] = asset.displayName;
        setState(current => ({ ...current, info: { ...current.info, displayName: asset.displayName } }));
        setNotice('Asset name saved.');
      }} />}
      {confirmation}
      <AssetActivityDrawer open={activityOpen} assetId={assetId} onClose={() => setActivityOpen(false)} onViewVersions={versionId => { setActivityOpen(false); setFocusedVersion(versionId || null); selectPanel('versions'); }} />
      {trashOpen && <TrashAssetDialog key={assetId} asset={info} userId={user.id} onClose={() => setTrashOpen(false)} onTrashed={() => { setTrashOpen(false); window.dispatchEvent(new Event('aether:notifications-changed')); requestLeave(() => navigate('/assets', { replace: true }), { discard: true }); }} />}
    </>
  );
}
