import { ArrowLeft, FileQuestion, LayoutDashboard, Search } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export default function NotFoundPage() {
  const location = useLocation();
  return (
    <section className="panel flex min-h-[520px] flex-col items-center justify-center px-6 py-12 text-center">
      <span className="font-display text-7xl font-bold tracking-[-0.06em] text-white/[0.035] sm:text-8xl">404</span>
      <span className="-mt-12 grid h-16 w-16 place-items-center rounded-xl border border-violet-400/20 bg-violet-400/[0.08] text-violet-300"><FileQuestion size={28} /></span>
      <h1 className="mt-6 font-display text-2xl font-semibold text-zinc-50">Workspace page not found</h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-zinc-500">This address may be outdated or unavailable to your current workspace.</p>
      <code className="mt-4 max-w-full overflow-hidden text-ellipsis rounded border border-white/[0.06] bg-black/20 px-3 py-2 font-mono text-[10px] text-zinc-600">{location.pathname}</code>
      <div className="mt-7 flex flex-wrap justify-center gap-3"><Link to="/dashboard" className="primary-button"><LayoutDashboard size={16} /> Dashboard</Link><Link to="/search" className="secondary-button"><Search size={16} /> Search assets</Link></div>
      <button className="mt-5 flex items-center gap-2 text-xs text-zinc-600 transition hover:text-zinc-300" onClick={() => window.history.back()}><ArrowLeft size={13} /> Go back</button>
    </section>
  );
}
