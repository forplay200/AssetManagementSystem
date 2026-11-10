import { getAssetDisplayName } from '../../utils/assetDisplayName';
import { ArrowUpRight } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { assetType, formatBytes, formatDate } from '../../utils/formatters';
import AssetThumbnail from './AssetThumbnail';

export default function AssetCard({ asset }) {
  const location = useLocation();
  const navigate = useNavigate();
  const name = getAssetDisplayName(asset);
  return (
    <Link to={`/assets/${asset.id}`} state={{ from: location.pathname + location.search }} onClick={event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(`/assets/${asset.id}`, { state: { from: location.pathname + location.search, scrollY: window.scrollY } });
    }} className="asset-card group" aria-label={`Open ${name}`}>
      <div className="relative flex aspect-video items-center justify-center overflow-hidden border-b border-white/[0.08] bg-zinc-950">
        <AssetThumbnail asset={asset} name={name} />
        {['video/mp4', 'video/webm'].includes(asset.mimetype) && <span className="absolute bottom-3 left-3 rounded bg-black/70 px-2 py-1 text-xs text-zinc-300">{asset.metadata?.media?.durationSeconds?.toFixed(1)} s · {asset.processingStatus || 'Video'}</span>}
      </div>
      <div className="p-4">
        <div className="flex items-start gap-2">
          <h2 className="min-w-0 flex-1 line-clamp-2 text-sm [overflow-wrap:anywhere] font-semibold text-zinc-100">{name}</h2>
          <ArrowUpRight size={15} className="mt-0.5 shrink-0 text-zinc-400 transition group-hover:text-aether-primary" />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 flex-wrap font-mono text-xs uppercase tracking-wide text-zinc-400">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-zinc-300">{assetType(asset.mimetype)}</span><span>{formatBytes(asset.size)}</span></div>
          <span>{formatDate(asset.uploadedAt)}</span>
        </div>
      </div>
    </Link>
  );
}
