import { useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, FileText, FileUp, FolderKanban, Tags, UploadCloud, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';
import { getApiError } from '../services/api';
import { assetService } from '../services/assetService';
import { formatBytes } from '../utils/formatters';
import { compactMetadata } from '../utils/metadata';

const acceptedExtensions = ['png', 'jpg', 'jpeg', 'gif', 'mp3', 'wav', 'fbx', 'obj', 'cs', 'js', 'txt', 'json', 'xml'];

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState({ loading: false, error: '' });
  const [metadata, setMetadata] = useState({ description: '', category: '', project: '' });
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const selectFile = (candidate) => {
    setStatus({ loading: false, error: '' });
    if (!candidate) return;
    const extension = candidate.name.split('.').pop()?.toLowerCase();
    if (!acceptedExtensions.includes(extension)) {
      setFile(null);
      setStatus({ loading: false, error: `.${extension || 'unknown'} files are not supported.` });
      return;
    }
    setFile(candidate);
    setProgress(0);
  };

  const upload = async () => {
    if (!file) return;
    setStatus({ loading: true, error: '' });
    try {
      const response = await assetService.upload(file, (event) => {
        if (event.total) setProgress(Math.round((event.loaded * 100) / event.total));
      });
      const initialMetadata = compactMetadata(metadata);
      let metadataWarning = '';
      if (Object.keys(initialMetadata).length) {
        try {
          const current = await assetService.getMetadata(response.asset.id);
          await assetService.updateMetadata(response.asset.id, { ...(current.metadata || {}), ...initialMetadata });
        } catch (metadataError) {
          metadataWarning = getApiError(metadataError, 'The file uploaded, but its initial metadata could not be saved.');
        }
      }
      navigate(`/assets/${response.asset.id}`, { state: { uploaded: true, metadataWarning } });
    } catch (error) {
      setStatus({ loading: false, error: getApiError(error, 'The asset could not be uploaded.') });
    }
  };

  return (
    <>
      <PageHeader eyebrow="Asset repository" title="Upload Asset" description="Add a supported game asset. AI metadata processing starts automatically after upload." actions={<Link to="/assets" className="secondary-button"><ArrowLeft size={16} /> Library</Link>} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="panel p-5 sm:p-7">
          <input ref={inputRef} type="file" className="sr-only" accept={acceptedExtensions.map((ext) => `.${ext}`).join(',')} onChange={(event) => selectFile(event.target.files?.[0])} />
          <button
            type="button"
            className={`upload-zone w-full ${dragging ? 'upload-zone-active' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files?.[0]); }}
          >
            <span className="grid h-14 w-14 place-items-center rounded-lg border border-violet-400/20 bg-violet-400/10 text-aether-primary"><UploadCloud size={26} /></span>
            <span className="mt-5 font-display text-lg font-semibold text-zinc-100">Drop an asset here</span>
            <span className="mt-2 text-sm text-zinc-500">or click to browse your files</span>
            <span className="mt-5 font-mono text-[10px] uppercase tracking-wider text-zinc-600">Images · Audio · 3D · Scripts · Data</span>
          </button>

          {file && (
            <div className="mt-5 rounded-lg border border-white/[0.08] bg-zinc-950/60 p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded bg-zinc-900 text-zinc-400"><FileUp size={19} /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-zinc-100">{file.name}</p><p className="mt-1 font-mono text-[10px] uppercase text-zinc-500">{formatBytes(file.size)} · Ready</p></div>
                <button className="p-2 text-zinc-500 hover:text-zinc-200" onClick={() => setFile(null)} disabled={status.loading} aria-label="Remove selected file"><X size={18} /></button>
              </div>
              {status.loading && <div className="mt-4"><div className="mb-2 flex justify-between font-mono text-[10px] uppercase text-zinc-500"><span>Uploading</span><span>{progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className="h-full bg-aether-primary transition-all" style={{ width: `${progress}%` }} /></div></div>}
            </div>
          )}
          <div className="mt-6 border-t border-white/[0.08] pt-6">
            <div className="mb-4"><h2 className="font-display text-sm font-semibold text-zinc-100">Initial organization</h2><p className="mt-1 text-xs text-zinc-600">Optional metadata helps teammates retrieve this asset before AI processing completes.</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className="label flex items-center gap-2"><FileText size={12} /> Description</span><textarea className="input mt-2 min-h-24 w-full resize-y py-3" maxLength={1000} value={metadata.description} onChange={(event) => setMetadata({ ...metadata, description: event.target.value })} disabled={status.loading} placeholder="Purpose, visual style, or usage notes…" /></label>
              <label><span className="label flex items-center gap-2"><Tags size={12} /> Category</span><input className="input mt-2 w-full" maxLength={80} value={metadata.category} onChange={(event) => setMetadata({ ...metadata, category: event.target.value })} disabled={status.loading} placeholder="e.g. Environment" /></label>
              <label><span className="label flex items-center gap-2"><FolderKanban size={12} /> Project</span><input className="input mt-2 w-full" maxLength={120} value={metadata.project} onChange={(event) => setMetadata({ ...metadata, project: event.target.value })} disabled={status.loading} placeholder="e.g. Project Aether" /></label>
            </div>
          </div>
          {status.error && <div className="mt-5 rounded border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200" role="alert">{status.error}</div>}
          <div className="mt-6 flex justify-end gap-3"><Link to="/assets" className="secondary-button">Cancel</Link><button className="primary-button" disabled={!file || status.loading} onClick={upload}>{status.loading ? 'Uploading…' : 'Upload asset'}<FileUp size={16} /></button></div>
        </section>
        <aside className="panel h-fit p-5">
          <h2 className="font-display text-sm font-semibold text-zinc-100">Upload pipeline</h2>
          <ol className="mt-5 space-y-5">
            {['Secure file storage', 'AI metadata extraction', 'Search indexing'].map((item, index) => <li key={item} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded border border-white/10 bg-zinc-900 font-mono text-[10px] text-zinc-400">0{index + 1}</span><div><p className="text-sm text-zinc-300">{item}</p><p className="mt-1 text-xs leading-5 text-zinc-600">{index === 0 ? 'Stored in the protected object repository.' : index === 1 ? 'Tags and keywords are generated asynchronously.' : 'The asset becomes available to your team.'}</p></div></li>)}
          </ol>
          <div className="mt-6 flex items-start gap-2 rounded bg-emerald-400/[0.07] p-3 text-xs leading-5 text-emerald-200/80"><CheckCircle2 size={15} className="mt-0.5 shrink-0" />All PRD-supported asset formats are accepted.</div>
        </aside>
      </div>
    </>
  );
}
