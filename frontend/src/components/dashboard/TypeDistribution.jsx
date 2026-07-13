import { Box, FileAudio, FileCode2, FileJson, Image, Layers3 } from 'lucide-react';
import { assetType } from '../../utils/formatters';

const typeMeta = {
  Image: { icon: Image, color: 'bg-violet-400' },
  Audio: { icon: FileAudio, color: 'bg-blue-400' },
  '3D Model': { icon: Box, color: 'bg-emerald-400' },
  Script: { icon: FileCode2, color: 'bg-amber-400' },
  Data: { icon: FileJson, color: 'bg-cyan-400' },
  Asset: { icon: Layers3, color: 'bg-zinc-500' },
};

export default function TypeDistribution({ assets }) {
  const counts = assets.reduce((result, asset) => {
    const type = assetType(asset.mimetype);
    result[type] = (result[type] || 0) + 1;
    return result;
  }, {});
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = assets.length || 1;

  return (
    <section className="panel p-5 sm:p-6">
      <div className="section-title"><Layers3 size={16} className="text-aether-primary" /> Asset types <span className="ml-auto font-mono text-[10px] uppercase text-zinc-600">Latest {assets.length}</span></div>
      {entries.length ? <div className="mt-5 space-y-4">{entries.map(([type, count]) => {
        const meta = typeMeta[type] || typeMeta.Asset;
        const Icon = meta.icon;
        return <div key={type}><div className="mb-2 flex items-center gap-2"><Icon size={14} className="text-zinc-500" /><span className="text-xs text-zinc-400">{type}</span><span className="ml-auto font-mono text-[10px] text-zinc-600">{count} · {Math.round((count / total) * 100)}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className={`h-full rounded-full ${meta.color}`} style={{ width: `${(count / total) * 100}%` }} /></div></div>;
      })}</div> : <p className="mt-6 text-sm text-zinc-600">No asset data is available.</p>}
    </section>
  );
}
