import { Boxes } from 'lucide-react';

export default function BrandMark({ compact = false }) {
  return (
    <div className="flex items-center gap-3" aria-label="Aether home">
      <span className="grid h-9 w-9 place-items-center rounded bg-aether-primary text-white">
        <Boxes size={20} strokeWidth={2.2} />
      </span>
      {!compact && (
        <span>
          <span className="block font-display text-base font-semibold tracking-tight text-white">Aether</span>
          <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">Asset Management</span>
        </span>
      )}
    </div>
  );
}
