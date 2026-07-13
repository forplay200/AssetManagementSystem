import AssetCard from './AssetCard';

export default function AssetGrid({ assets }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {assets.map((asset) => <AssetCard key={asset.id} asset={asset} />)}
    </div>
  );
}

export function AssetGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-label="Loading assets">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="panel overflow-hidden">
          <div className="aspect-video animate-pulse bg-zinc-950" />
          <div className="space-y-3 p-4"><div className="h-4 w-3/4 animate-pulse rounded bg-zinc-800" /><div className="h-3 w-1/2 animate-pulse rounded bg-zinc-900" /></div>
        </div>
      ))}
    </div>
  );
}
