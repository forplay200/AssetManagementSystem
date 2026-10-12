import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Check, Clock3, Download, FileUp, GitBranch, LoaderCircle, Plus, UploadCloud, X } from 'lucide-react';
import { getApiError } from '../../services/api';
import { assetService, saveDownload } from '../../services/assetService';
import useConfirmation from '../../hooks/useConfirmation';
import { useUnsavedChanges } from '../../context/UnsavedChangesContext';
import ExpandableText from '../common/ExpandableText';
import ExpandableList from '../common/ExpandableList';
import ModelPackageEditor from '../assets/ModelPackageEditor';
import { formatBytes, formatDate } from '../../utils/formatters';

const acceptedExtensions = ['png', 'jpg', 'jpeg', 'gif', 'mp3', 'wav', 'fbx', 'obj', 'cs', 'js', 'txt', 'json', 'xml'];
const ThreeModelPreview = lazy(() => import('../assets/ThreeModelPreview'));

export default function VersionHistory({ assetId, assetName, canCreate = false, onCurrentVersionChanged, assetInfo, initialMode, modeRequest = 0, active = true }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [formMode, setFormMode] = useState(null);
  const [changeLog, setChangeLog] = useState('');
  const [replacementFile, setReplacementFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modelBundle, setModelBundle] = useState(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [existingCompanions, setExistingCompanions] = useState([]);
  const [existingBindings, setExistingBindings] = useState({});
  const [previewVersion, setPreviewVersion] = useState(null);
  const appliedModeRequest = useRef(null);
  const { confirm, confirmation } = useConfirmation();
  const [downloading, setDownloading] = useState(null);
  const dirty = Boolean(formMode && (changeLog.trim() || replacementFile));
  useUnsavedChanges(dirty, "Version draft", creating || sourceLoading);
  const isCurrentModel = /\.(obj|fbx)$/i.test(assetName || '');
  const replacementIsModel = /\.(obj|fbx)$/i.test(replacementFile?.name || '');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setVersions(await assetService.getVersions(assetId));
    } catch (requestError) {
      setError(getApiError(requestError, 'Version history could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [assetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeForm = () => { setFormMode(null); setChangeLog(''); setReplacementFile(null); setProgress(0); setModelBundle(null); setExistingCompanions([]); setExistingBindings({}); };
  const discardDraft = () => !dirty ? Promise.resolve(true) : confirm({ title: 'Discard version draft?', description: 'Your selected files, attachment changes and version note will be lost.', confirmLabel: 'Discard draft', cancelLabel: 'Keep editing' });
  const changeMode = async mode => { if (await discardDraft()) { closeForm(); setFormMode(formMode === mode ? null : mode); } };
  const cancelForm = async () => { if (await discardDraft()) closeForm(); };
  const openCompanions = async () => {
    if (!await discardDraft()) return;
    closeForm(); setFormMode('companions'); setSourceLoading(true); setError(''); setSuccess('');
    try {
      const manifest = await assetService.getPackage(assetId);
      const source = manifest?.files.find(resource => resource.kind === 'source');
      const mainBlob = source ? await assetService.getResource(assetId, source.id, { packageId: manifest.packageId }) : await assetService.getPreview(assetId);
      const companions = [];
      const resources = manifest?.files.filter(resource => resource.kind !== 'source') || [];
      for (let start = 0; start < resources.length; start += 4) {
        companions.push(...await Promise.all(resources.slice(start, start + 4).map(async resource => {
          const blob = await assetService.getResource(assetId, resource.id, { packageId: manifest.packageId });
          return { id: resource.id, path: resource.path, kind: resource.kind, file: new File([blob], resource.path.split('/').pop(), { type: resource.mime }) };
        })));
      }
      setExistingCompanions(companions); setExistingBindings(manifest?.bindings || {});
      setReplacementFile(new File([mainBlob], assetName, { type: assetInfo?.mimetype || mainBlob.type }));
      setChangeLog('Updated model materials / textures');
    } catch (requestError) { setError(getApiError(requestError, 'The current model files could not be loaded.')); }
    finally { setSourceLoading(false); }
  };
  useEffect(() => {
    const request = `${initialMode}:${modeRequest}`;
    if (initialMode !== 'companions' || appliedModeRequest.current === request) return;
    appliedModeRequest.current = request;
    openCompanions();
  }, [initialMode, modeRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async (event) => {
    event.preventDefault();
    if (creating || !changeLog.trim()) return;
    setCreating(true);
    setError('');
    setSuccess('');
    try {
      const response = await assetService.createVersion(assetId, changeLog.trim());
      setVersions((current) => [...current, response.version]);
      setChangeLog('');
      closeForm();
      setSuccess(`Version ${response.version.versionNumber} was preserved.`);
    } catch (requestError) {
      setError(getApiError(requestError, 'A new version could not be created.'));
    } finally {
      setCreating(false);
    }
  };

  const upload = async (event) => {
    event.preventDefault();
    if (creating || !replacementFile || !changeLog.trim() || (replacementIsModel && !modelBundle?.canUpload)) return;
    const nextAttachments = modelBundle?.attachments || [];
    const removed = existingCompanions.filter(item => !nextAttachments.some(next => next.id === item.id));
    if (!await confirm({ title: formMode === 'companions' ? 'Save material and texture changes?' : 'Replace the current asset file?', description: 'The current files will be preserved as a snapshot. Existing AI results will be cleared and processing requested for the new version.', details: <div className="space-y-2"><p>Current: {assetName}</p><p>New: {replacementFile.name} · {formatBytes(replacementFile.size)}</p><p>{nextAttachments.length} companion files in the new package.{formMode === 'companions' ? ` ${removed.length} removed from the current package.` : ' Only the selected files will be included.'}</p>{modelBundle?.geometryOnly && <p className="text-amber-200">Geometry only: materials and textures will not be displayed.</p>}<p>Version note: {changeLog}</p></div>, confirmLabel: 'Save new version', danger: false })) return;
    setCreating(true); setError(''); setSuccess(''); setProgress(0);
    try {
      const response = await assetService.uploadVersion(assetId, replacementFile, changeLog.trim(), (uploadEvent) => {
        if (uploadEvent.total) setProgress(Math.round((uploadEvent.loaded * 100) / uploadEvent.total));
      }, { ...(modelBundle || {}), reuseSource: formMode === 'companions', expectedFilename: assetInfo?.filename });
      setVersions((current) => [...current, response.version]);
      setSuccess(`The new version was saved. Previous files preserved as v${response.version.versionNumber}.` + (response.processing?.status === 'queue-failed' ? ' AI processing can be retried from Metadata.' : ' AI processing is queued.'));
      closeForm();
      await onCurrentVersionChanged?.(response.asset);
    } catch (requestError) {
      setError(getApiError(requestError, 'The replacement file could not be uploaded.'));
    } finally { setCreating(false); }
  };

  const selectReplacement = (file) => {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { setError('The main file exceeds 50 MB.'); return; }
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!acceptedExtensions.includes(extension)) { setError(`.${extension || 'unknown'} files are not supported. Your previous selection has been kept.`); return; }
    setError(''); setReplacementFile(file); setProgress(0); setModelBundle(null); setExistingCompanions([]); setExistingBindings({});
  };

  const download = async (version) => {
    if (downloading) return;
    setDownloading(version.id); setError('');
    try {
      saveDownload(await assetService.downloadVersion(assetId, version.id, { filename: version.originalName || assetName }));
    } catch (requestError) {
      setError(getApiError(requestError, 'This version could not be downloaded.'));
    } finally { setDownloading(null); }
  };

  return (
    <section className="panel overflow-hidden" aria-labelledby="version-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
        <div>
          <h2 id="version-heading" className="flex items-center gap-2 font-display text-sm font-semibold text-zinc-100"><GitBranch size={16} className="text-aether-success" /> Version history</h2>
          <p className="mt-1 text-xs text-zinc-400">Preserved files, materials and textures with their change notes.</p>
        </div>
        {canCreate && <div className="flex flex-wrap gap-2"><button className="secondary-button" disabled={creating || sourceLoading} onClick={() => changeMode('snapshot')}><Plus size={16} /> Preserve snapshot</button><button className="success-button" disabled={creating || sourceLoading} onClick={() => changeMode('upload')}><UploadCloud size={16} /> Upload new version</button>{isCurrentModel && <button className="secondary-button" disabled={creating || sourceLoading} onClick={openCompanions}><FileUp size={16} /> Update materials / textures</button>}</div>}
      </div>

      {formMode && (
        <form className="border-b border-white/[0.08] bg-black/15 p-5" onSubmit={formMode === 'snapshot' ? create : upload}><fieldset disabled={creating || sourceLoading}>
          <div className="mb-4"><h3 className="font-display text-sm font-semibold text-zinc-200">{formMode === 'companions' ? 'Update model materials / textures' : formMode === 'upload' ? 'Replace current asset file' : 'Preserve current snapshot'}</h3><p className="mt-1 text-xs text-zinc-400">{formMode === 'companions' ? 'Reuse the current model. Keep, replace or add companion files; the full previous package is preserved.' : formMode === 'upload' ? 'The complete current asset is preserved before the replacement becomes active.' : 'Preserve all current files without changing the active asset.'}</p></div>
          {formMode === 'upload' && <label className="mb-4 block"><span className="label">Replacement file</span><input type="file" className="input mt-2 h-auto w-full cursor-pointer py-2 file:mr-3 file:rounded file:border-0 file:bg-violet-400/10 file:px-3 file:py-1.5 file:text-xs file:text-violet-200" accept={acceptedExtensions.map((extension) => `.${extension}`).join(',')} onChange={(event) => selectReplacement(event.target.files?.[0])} required /></label>}
          {sourceLoading && <p className="mb-4 flex items-center gap-2 text-xs text-zinc-400"><LoaderCircle size={14} className="animate-spin" /> Loading current model files…</p>}
          {formMode !== 'snapshot' && replacementIsModel && <ModelPackageEditor key={replacementFile.name + replacementFile.lastModified} file={replacementFile} initialAttachments={existingCompanions} initialBindings={existingBindings} onChange={setModelBundle} disabled={creating || sourceLoading} />}
          <label className="mt-4 block"><span className="label">Version note</span><textarea className="input mt-2 min-h-24 w-full resize-y py-3" value={changeLog} onChange={(event) => setChangeLog(event.target.value)} maxLength={500} placeholder="Describe what changed in this version…" required /></label>
          {creating && formMode !== 'snapshot' && <div className="mt-4"><div className="mb-2 flex justify-between font-mono text-xs uppercase text-zinc-400"><span>{progress === 100 ? 'Saving files…' : 'Uploading replacement'}</span><span>{progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className="h-full bg-aether-success transition-all" style={{ width: `${progress}%` }} /></div></div>}
          <div className="editor-actions items-center justify-between"><span className="font-mono text-xs text-zinc-400">{changeLog.length}/500</span><div className="flex gap-2"><button type="button" className="secondary-button" onClick={cancelForm} disabled={creating || sourceLoading}><X size={15} /> Cancel</button><button className="success-button" disabled={creating || !changeLog.trim() || (formMode !== 'snapshot' && (!replacementFile || sourceLoading || (replacementIsModel && !modelBundle?.canUpload)))}>{creating ? <LoaderCircle size={15} className="animate-spin" /> : formMode !== 'snapshot' ? <FileUp size={15} /> : <Check size={15} />}{creating ? 'Working…' : formMode !== 'snapshot' ? 'Save version' : 'Create snapshot'}</button></div></div>
        </fieldset></form>
      )}

      {error && <div className="m-5 rounded border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200" role="alert">{error}</div>}
      {success && <div role="status" className="m-5 rounded border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{success}</div>}

      {loading ? <div className="grid min-h-40 place-items-center"><LoaderCircle className="animate-spin text-aether-primary" size={20} /></div> : versions.length ? (
        <ExpandableList items={[...versions].reverse()} limit={10} label="versions" className="divide-y divide-white/[0.06]" renderItem={(version, index) => (
            <article key={version.id} className="grid gap-4 px-5 py-4 sm:grid-cols-[48px_minmax(0,1fr)_auto] sm:items-center">
              <span className="grid h-10 w-10 place-items-center rounded border border-emerald-400/20 bg-emerald-400/[0.07] font-mono text-xs text-emerald-300">v{version.versionNumber}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium text-zinc-200 [overflow-wrap:anywhere]">{version.originalName || assetName}</p>{index === 0 && <span className="status-chip">Latest snapshot</span>}</div>
                <ExpandableText value={version.changeLog || "No change note provided."} label="Version note" lines={4} className="mt-2" />
                <div className="mt-2 flex flex-wrap gap-3 font-mono text-xs uppercase tracking-wide text-zinc-400"><span className="flex items-center gap-1"><Clock3 size={11} /> {formatDate(version.createdAt)}</span><span>{formatBytes(version.package?.totalSize || version.size)}</span>{version.package && <span>{version.package.fileCount} package files</span>}<span>Author #{version.createdBy}</span></div>
              </div>
              <div className="flex flex-wrap gap-2">{/\.(obj|fbx)$/i.test(version.originalName || '') && <button className="secondary-button" onClick={() => setPreviewVersion(previewVersion === version.id ? null : version.id)}>Preview</button>}<button className="secondary-button w-fit" disabled={Boolean(downloading)} onClick={() => download(version)}><Download size={15} /> {downloading === version.id ? 'Preparing…' : version.package ? 'Download ZIP' : 'Download'}</button></div>
              {active && previewVersion === version.id && <div className="overflow-hidden rounded border border-white/[0.08] sm:col-span-3"><Suspense fallback={<div className="grid min-h-40 place-items-center"><LoaderCircle className="animate-spin" size={18} /></div>}><ThreeModelPreview assetId={assetId} versionId={version.id} info={{ originalname: version.originalName, filename: version.fileName, package: version.package }} /></Suspense></div>}
            </article>
          )} />
      ) : !error && <div className="px-6 py-12 text-center"><GitBranch className="mx-auto text-zinc-700" size={27} /><p className="mt-3 text-sm font-medium text-zinc-300">No preserved versions</p><p className="mt-1 text-xs text-zinc-400">Create a snapshot of the current asset to begin its history.</p></div>}
      {confirmation}
    </section>
  );
}
