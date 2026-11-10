import { getAssetDisplayName } from '../../utils/assetDisplayName';
import { lazy, Suspense, useEffect, useState } from 'react';
import { AlertCircle, FileText, LoaderCircle } from 'lucide-react';
import { assetService } from '../../services/assetService';
import AssetTypeIcon from './AssetTypeIcon';
import VideoPreview from './VideoPreview';

const ThreeModelPreview = lazy(() => import('./ThreeModelPreview'));

const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_CHARS = 100000;

export function previewKind(info = {}) {
  const mime = (info.mimetype || '').toLowerCase();
  const extension = (info.originalname || '').split('.').pop()?.toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if ((!mime || mime === 'application/octet-stream') && ['png', 'jpg', 'jpeg', 'gif'].includes(extension)) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (['video/mp4', 'video/webm'].includes(mime)) return 'video';
  if (['obj', 'fbx'].includes(extension)) return 'model';
  if (mime.startsWith('text/') || ['json', 'xml'].some((type) => mime.includes(type)) || ['cs', 'js', 'txt', 'json', 'xml'].includes(extension)) return 'text';
  return 'unsupported';
}

function formatText(text, mimetype, originalname) {
  const isJson = mimetype?.includes('json') || originalname?.toLowerCase().endsWith('.json');
  if (!isJson) return text;
  try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
}

export default function AssetPreview({ assetId, info, versionId, recycleCycleId, canDownload = false, auditDownloads = false }) {
  const kind = previewKind(info);
  const { filename, originalname, mimetype, size } = info;
  const [state, setState] = useState({ loading: !['unsupported', 'model'].includes(kind), url: '', text: '', error: '', truncated: false });

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setState({ loading: !['unsupported', 'model'].includes(kind), url: '', text: '', error: '', truncated: false });

    if (['unsupported', 'model', 'video'].includes(kind)) return () => { active = false; };
    if (kind === 'text' && Number(size) > MAX_TEXT_BYTES) {
      setState({ loading: false, url: '', text: '', error: 'This text asset is larger than the 2 MB preview limit.', truncated: false });
      return () => { active = false; };
    }

    const controller = new AbortController();
    const preview = versionId
      ? assetService.getVersionPreview(assetId, versionId, controller.signal)
      : recycleCycleId
        ? assetService.getPreview(assetId, controller.signal, { recycleCycleId })
        : assetService.getPreview(assetId);
    preview.then(async (blob) => {
      if (!active) return;
      if (kind === 'text') {
        const formatted = formatText(await blob.text(), mimetype, originalname);
        if (active) setState({ loading: false, url: '', text: formatted.slice(0, MAX_TEXT_CHARS), error: '', truncated: formatted.length > MAX_TEXT_CHARS });
      } else {
        objectUrl = URL.createObjectURL(blob);
        setState({ loading: false, url: objectUrl, text: '', error: '', truncated: false });
      }
    }).catch(() => {
      if (active) setState({ loading: false, url: '', text: '', error: 'The protected preview could not be loaded.', truncated: false });
    });

    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [assetId, filename, kind, mimetype, originalname, recycleCycleId, size, versionId]);

  if (kind === 'video') return <VideoPreview assetId={assetId} sourceFilename={info.filename} recycleCycleId={recycleCycleId} canDownload={canDownload} auditDownloads={auditDownloads} />;
  if (state.loading) return <div className="flex min-h-[360px] items-center justify-center bg-zinc-950 sm:min-h-[460px]"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-aether-primary" size={22} /><p className="mt-3 text-xs text-zinc-400">Loading protected preview…</p></div></div>;
  if (kind === 'image' && state.url) return <div className={`flex items-center justify-center bg-zinc-950 p-6 ${versionId ? 'asset-thumbnail-checkerboard min-h-40' : 'min-h-[360px] sm:min-h-[460px]'}`}><img src={state.url} alt={`Preview of ${getAssetDisplayName(info)}`} className="max-h-[560px] max-w-full rounded object-contain" onError={() => setState(current => ({ ...current, url: '', error: 'This image could not be displayed.' }))} /></div>;
  if (kind === 'audio' && state.url) return <div className="flex min-h-[220px] items-center justify-center bg-zinc-950 p-6"><div className="w-full max-w-lg text-center"><div className="mx-auto mb-6 grid h-24 w-24 place-items-center rounded-xl border border-violet-400/20 bg-violet-400/10 text-aether-primary"><AssetTypeIcon mime={info.mimetype} size={42} /></div><audio aria-label="Audio preview" controls controlsList={canDownload && !auditDownloads ? undefined : 'nodownload'} className="w-full" src={state.url}>Your browser does not support audio preview.</audio></div></div>;
  if (kind === 'model') return <Suspense fallback={<div className="flex min-h-[360px] items-center justify-center bg-zinc-950 sm:min-h-[460px]"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-aether-primary" size={22} /><p className="mt-3 text-xs text-zinc-400">Preparing 3D viewer…</p></div></div>}><ThreeModelPreview assetId={assetId} info={info} recycleCycleId={recycleCycleId} /></Suspense>;
  if (kind === 'text' && !state.error) return <div className="bg-zinc-950"><div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3 font-mono text-xs uppercase tracking-wider text-zinc-400"><FileText size={13} /> Read-only source preview{state.truncated && <span className="ml-auto text-amber-300/70">First 100,000 characters</span>}</div><pre className="max-h-[560px] min-h-[360px] overflow-auto whitespace-pre p-5 font-mono text-xs leading-6 text-zinc-400 sm:min-h-[460px]" tabIndex="0" aria-label={`Read-only preview of ${getAssetDisplayName(info)}`}>{state.text || 'This file is empty.'}</pre></div>;
  return <div className="flex min-h-[360px] items-center justify-center bg-zinc-950 p-6 sm:min-h-[460px]"><div className="max-w-sm text-center text-zinc-400"><div className="mx-auto mb-5 grid h-24 w-24 place-items-center rounded-xl border border-white/[0.08] bg-zinc-900"><AssetTypeIcon mime={info.mimetype} size={40} /></div>{state.error && <AlertCircle className="mx-auto mb-2 text-amber-300/70" size={17} />}<p className="text-sm text-zinc-400">{state.error || 'Preview is not available for this file type.'}</p></div></div>;
}
