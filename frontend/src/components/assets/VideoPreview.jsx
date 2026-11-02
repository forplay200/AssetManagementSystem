import { useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { assetService } from '../../services/assetService';
import { useAuth } from '../../context/AuthContext';

export default function VideoPreview({ assetId, sourceFilename, versionId, canDownload = false }) {
  const { user } = useAuth();
  const workspaceId = user?.team?.id;
  const [state, setState] = useState({ loading: true, url: '', error: '' });
  const [retry, setRetry] = useState(0);
  const player = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true, url = '';
    const element = player.current;
    setState({ loading: true, url: '', error: '' });
    const load = versionId ? assetService.getVersionPreview(assetId, versionId, controller.signal) : assetService.getPreview(assetId, controller.signal);
    load.then(blob => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setState({ loading: false, url, error: '' });
    }).catch(() => { if (active) setState({ loading: false, url: '', error: 'Video preview could not be loaded.' }); });
    return () => {
      active = false; controller.abort();
      if (element) { element.pause(); element.removeAttribute('src'); element.load(); }
      if (url) URL.revokeObjectURL(url);
    };
  }, [assetId, sourceFilename, versionId, workspaceId, retry]);
  return <div className="bg-zinc-950 p-4 sm:p-6">
    {state.loading && <div role="status" className="grid min-h-48 place-items-center text-sm text-zinc-400"><div><LoaderCircle className="mx-auto mb-3 animate-spin" />Loading protected video…</div></div>}
    {state.error && <div role="alert" className="p-5 text-sm text-red-200">{state.error}<button className="secondary-button ml-3" onClick={() => setRetry(n => n + 1)}>Retry preview</button></div>}
    <video ref={player} aria-label={versionId ? 'Historical video preview' : 'Video preview'} controls playsInline preload="metadata" controlsList={canDownload ? undefined : 'nodownload'} className={`max-h-[55vh] w-full rounded ${state.url ? '' : 'hidden'}`} src={state.url || undefined} onError={() => { if (state.url) setState(s => ({ ...s, error: 'This video could not be played by your browser.' })); }} />
    <p className="mt-3 text-xs text-zinc-400">The protected file loads before playback. Sound is played but is not used for AI tagging.</p>
  </div>;
}
