import { useEffect, useRef, useState } from 'react';
import { ImageOff, LoaderCircle } from 'lucide-react';
import { assetService } from '../../services/assetService';
import AssetTypeIcon from './AssetTypeIcon';

export function supportsImageThumbnail(mime = '') {
  return mime.toLowerCase().startsWith('image/');
}

export default function AssetThumbnail({ asset, name }) {
  const containerRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState({ loading: false, url: '', failed: false });
  const supported = supportsImageThumbnail(asset.mimetype);

  useEffect(() => {
    if (!supported) return undefined;
    if (!('IntersectionObserver' in window)) { setVisible(true); return undefined; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '160px' });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [supported]);

  useEffect(() => {
    if (!supported || !visible) return undefined;
    let active = true;
    let objectUrl = '';
    setState({ loading: true, url: '', failed: false });
    assetService.getPreview(asset.id).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setState({ loading: false, url: objectUrl, failed: false });
    }).catch(() => {
      if (active) setState({ loading: false, url: '', failed: true });
    });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [asset.id, supported, visible]);

  return (
    <div ref={containerRef} className="absolute inset-0 flex items-center justify-center bg-zinc-950">
      {state.url ? <img src={state.url} alt={`Preview of ${name}`} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.025]" /> : <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(139,92,246,.13),transparent_55%)]" />}
      {!state.url && <div className="relative grid h-14 w-14 place-items-center rounded-lg border border-white/[0.08] bg-zinc-900 text-zinc-500 transition group-hover:border-violet-400/30 group-hover:text-aether-primary">{state.loading ? <LoaderCircle size={22} className="animate-spin" /> : state.failed ? <ImageOff size={25} /> : <AssetTypeIcon mime={asset.mimetype} />}</div>}
      {state.url && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />}
    </div>
  );
}
