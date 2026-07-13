export default function StatCard({ icon: Icon, label, value, detail, tone = 'violet' }) {
  const tones = {
    violet: 'border-violet-400/20 bg-violet-400/[0.08] text-violet-300',
    blue: 'border-blue-400/20 bg-blue-400/[0.08] text-blue-300',
    emerald: 'border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300',
  };

  return (
    <article className="panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">{label}</p><p className="mt-3 font-display text-3xl font-semibold tracking-tight text-zinc-50">{Number(value || 0).toLocaleString()}</p></div>
        <span className={`grid h-10 w-10 place-items-center rounded border ${tones[tone]}`}><Icon size={19} /></span>
      </div>
      <p className="mt-4 border-t border-white/[0.06] pt-3 text-xs text-zinc-500">{detail}</p>
    </article>
  );
}
