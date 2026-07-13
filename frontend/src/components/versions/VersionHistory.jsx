import { useEffect, useState } from 'react';
import { Check, Clock3, Download, FileUp, GitBranch, LoaderCircle, Plus, UploadCloud, X } from 'lucide-react';
import { getApiError } from '../../services/api';
import { assetService } from '../../services/assetService';
import { formatBytes, formatDate } from '../../utils/formatters';

const acceptedExtensions = ['png', 'jpg', 'jpeg', 'gif', 'mp3', 'wav', 'fbx', 'obj', 'cs', 'js', 'txt', 'json', 'xml'];

export default function VersionHistory({ assetId, assetName, canCreate = false, onCurrentVersionChanged }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [formMode, setFormMode] = useState(null);
  const [changeLog, setChangeLog] = useState('');
  const [replacementFile, setReplacementFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

  const closeForm = () => { setFormMode(null); setChangeLog(''); setReplacementFile(null); setProgress(0); };

  const create = async (event) => {
    event.preventDefault();
    if (!changeLog.trim()) return;
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
    if (!replacementFile || !changeLog.trim()) return;
    setCreating(true); setError(''); setSuccess(''); setProgress(0);
    try {
      const response = await assetService.uploadVersion(assetId, replacementFile, changeLog.trim(), (uploadEvent) => {
        if (uploadEvent.total) setProgress(Math.round((uploadEvent.loaded * 100) / uploadEvent.total));
      });
      setVersions((current) => [...current, response.version]);
      setSuccess(`The new current file was uploaded. Previous state preserved as v${response.version.versionNumber}.`);
      closeForm();
      await onCurrentVersionChanged?.(response.asset);
    } catch (requestError) {
      setError(getApiError(requestError, 'The replacement file could not be uploaded.'));
    } finally { setCreating(false); }
  };

  const selectReplacement = (file) => {
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!acceptedExtensions.includes(extension)) { setReplacementFile(null); setError(`.${extension || 'unknown'} files are not supported.`); return; }
    setError(''); setReplacementFile(file); setProgress(0);
  };

  const download = async (version) => {
    setError('');
    try {
      const url = URL.createObjectURL(await assetService.downloadVersion(assetId, version.id));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = version.originalName || assetName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(getApiError(requestError, 'This version could not be downloaded.'));
    }
  };

  return (
    <section className="panel overflow-hidden" aria-labelledby="version-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
        <div>
          <h2 id="version-heading" className="flex items-center gap-2 font-display text-sm font-semibold text-zinc-100"><GitBranch size={16} className="text-aether-success" /> Version history</h2>
          <p className="mt-1 text-xs text-zinc-500">Preserved file states and their change notes.</p>
        </div>
        {canCreate && <div className="flex flex-wrap gap-2"><button className="secondary-button" onClick={() => setFormMode(formMode === 'snapshot' ? null : 'snapshot')}><Plus size={16} /> Preserve snapshot</button><button className="success-button" onClick={() => setFormMode(formMode === 'upload' ? null : 'upload')}><UploadCloud size={16} /> Upload new version</button></div>}
      </div>

      {formMode && (
        <form className="border-b border-white/[0.08] bg-black/15 p-5" onSubmit={formMode === 'upload' ? upload : create}>
          <div className="mb-4"><h3 className="font-display text-sm font-semibold text-zinc-200">{formMode === 'upload' ? 'Replace current asset file' : 'Preserve current snapshot'}</h3><p className="mt-1 text-xs text-zinc-600">{formMode === 'upload' ? 'The current file is preserved in history before the replacement becomes active and AI processing restarts.' : 'Store the current file in history without changing the active asset.'}</p></div>
          {formMode === 'upload' && <label className="mb-4 block"><span className="label">Replacement file</span><input type="file" className="input mt-2 h-auto w-full cursor-pointer py-2 file:mr-3 file:rounded file:border-0 file:bg-violet-400/10 file:px-3 file:py-1.5 file:text-xs file:text-violet-200" accept={acceptedExtensions.map((extension) => `.${extension}`).join(',')} onChange={(event) => selectReplacement(event.target.files?.[0])} required /></label>}
          <label className="block"><span className="label">Version note</span><textarea className="input mt-2 min-h-24 w-full resize-y py-3" value={changeLog} onChange={(event) => setChangeLog(event.target.value)} maxLength={500} placeholder="Describe what changed in this version…" required /></label>
          {creating && formMode === 'upload' && <div className="mt-4"><div className="mb-2 flex justify-between font-mono text-[10px] uppercase text-zinc-600"><span>Uploading replacement</span><span>{progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className="h-full bg-aether-success transition-all" style={{ width: `${progress}%` }} /></div></div>}
          <div className="mt-3 flex items-center justify-between gap-3"><span className="font-mono text-[10px] text-zinc-600">{changeLog.length}/500</span><div className="flex gap-2"><button type="button" className="secondary-button" onClick={closeForm} disabled={creating}><X size={15} /> Cancel</button><button className="success-button" disabled={creating || !changeLog.trim() || (formMode === 'upload' && !replacementFile)}>{creating ? <LoaderCircle size={15} className="animate-spin" /> : formMode === 'upload' ? <FileUp size={15} /> : <Check size={15} />}{creating ? 'Working…' : formMode === 'upload' ? 'Upload version' : 'Create snapshot'}</button></div></div>
        </form>
      )}

      {error && <div className="m-5 rounded border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200" role="alert">{error}</div>}
      {success && <div className="m-5 rounded border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{success}</div>}

      {loading ? <div className="grid min-h-40 place-items-center"><LoaderCircle className="animate-spin text-aether-primary" size={20} /></div> : versions.length ? (
        <ol className="divide-y divide-white/[0.06]">
          {[...versions].reverse().map((version, index) => (
            <li key={version.id} className="grid gap-4 px-5 py-4 sm:grid-cols-[48px_minmax(0,1fr)_auto] sm:items-center">
              <span className="grid h-10 w-10 place-items-center rounded border border-emerald-400/20 bg-emerald-400/[0.07] font-mono text-[11px] text-emerald-300">v{version.versionNumber}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-medium text-zinc-200">{version.originalName || assetName}</p>{index === 0 && <span className="status-chip">Latest snapshot</span>}</div>
                <p className="mt-1 text-sm text-zinc-500">{version.changeLog || 'No change note provided.'}</p>
                <div className="mt-2 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-wide text-zinc-600"><span className="flex items-center gap-1"><Clock3 size={11} /> {formatDate(version.createdAt)}</span><span>{formatBytes(version.size)}</span><span>Author #{version.createdBy}</span></div>
              </div>
              <button className="secondary-button w-fit" onClick={() => download(version)}><Download size={15} /> Download</button>
            </li>
          ))}
        </ol>
      ) : <div className="px-6 py-12 text-center"><GitBranch className="mx-auto text-zinc-700" size={27} /><p className="mt-3 text-sm font-medium text-zinc-300">No preserved versions</p><p className="mt-1 text-xs text-zinc-600">Create a snapshot of the current asset to begin its history.</p></div>}
    </section>
  );
}
