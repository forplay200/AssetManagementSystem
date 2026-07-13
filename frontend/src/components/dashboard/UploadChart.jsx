import { BarChart3 } from 'lucide-react';

export default function UploadChart({ assets }) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const next = new Date(date); next.setDate(next.getDate() + 1);
    return {
      date,
      label: new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date),
      count: assets.filter((asset) => {
        const uploaded = new Date(asset.uploadedAt);
        return uploaded >= date && uploaded < next;
      }).length,
    };
  });
  const max = Math.max(...days.map((day) => day.count), 1);

  return (
    <section className="panel p-5 sm:p-6">
      <div className="section-title"><BarChart3 size={16} className="text-aether-secondary" /> Upload activity <span className="ml-auto font-mono text-[10px] uppercase text-zinc-600">Last 7 days</span></div>
      <div className="mt-6 grid h-52 grid-cols-7 items-end gap-2 sm:gap-4" aria-label="Uploads over the last seven days">
        {days.map((day) => (
          <div key={day.date.toISOString()} className="flex h-full flex-col items-center justify-end gap-2">
            <span className="font-mono text-[10px] text-zinc-500">{day.count}</span>
            <div className="flex h-36 w-full items-end overflow-hidden rounded-sm bg-white/[0.025]">
              <div className="w-full rounded-sm bg-gradient-to-t from-blue-600 to-violet-400 transition-[height] duration-500" style={{ height: `${Math.max(day.count ? 10 : 2, (day.count / max) * 100)}%` }} />
            </div>
            <span className="font-mono text-[9px] uppercase text-zinc-600">{day.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
