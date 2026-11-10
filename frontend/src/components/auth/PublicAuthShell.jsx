import { Boxes, CheckCircle2 } from 'lucide-react';
import BrandMark from '../common/BrandMark';

export default function PublicAuthShell({ children }) {
  return (
    <main id="main-content" tabIndex="-1" className="grid min-h-screen bg-aether-base outline-none lg:grid-cols-[minmax(420px,0.88fr)_1.12fr]">
      <section className="flex min-h-screen flex-col px-6 py-6 sm:px-12 lg:px-16 xl:px-24">
        <div className="hidden lg:block"><BrandMark /></div>
        <div className="my-auto w-full max-w-md py-10 lg:py-12">
          <div className="mb-10 lg:hidden" aria-label="Aether, asset management for game teams">
            <span className="grid h-14 w-14 place-items-center rounded-xl bg-aether-primary text-white shadow-[0_0_40px_rgba(139,92,246,0.35)]"><Boxes size={30} strokeWidth={2.2} /></span>
            <p className="mt-4 font-display text-5xl font-bold tracking-tight text-white">Aether</p>
            <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-violet-300">Asset management for game teams</p>
          </div>
          {children}
        </div>
        <p className="text-xs text-zinc-400">Aether Asset Management · Team workspace</p>
      </section>
      <section className="login-visual relative hidden overflow-hidden border-l border-white/[0.08] lg:flex lg:flex-col lg:justify-end lg:p-14 xl:p-20">
        <div className="relative z-10 max-w-xl">
          <span className="mb-8 grid h-20 w-20 place-items-center rounded-2xl bg-aether-primary text-white shadow-[0_0_60px_rgba(139,92,246,0.45)]"><Boxes size={42} strokeWidth={2} /></span>
          <p className="bg-gradient-to-r from-white via-violet-100 to-violet-400 bg-clip-text font-display text-7xl font-bold leading-none tracking-tight text-transparent xl:text-8xl">Aether</p>
          <p className="mt-4 font-mono text-sm uppercase tracking-[0.2em] text-violet-300">Asset management for game teams</p>
          <h2 className="mt-10 font-display text-2xl font-semibold leading-snug tracking-tight text-white xl:text-3xl">Every sprite, mesh, sound and script,<br />versioned, tagged and found in seconds.</h2>
          <p className="mt-4 max-w-lg text-base leading-7 text-zinc-400">AI-assisted metadata makes your team's assets discoverable without disrupting your workflow.</p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            {['AI-generated tags', 'Version preservation', 'Advanced retrieval', 'Team feedback'].map((feature) => <div key={feature} className="flex items-center gap-2.5 rounded border border-white/[0.08] bg-white/[0.035] px-3 py-3 text-sm text-zinc-300 backdrop-blur"><CheckCircle2 size={15} className="text-aether-success" />{feature}</div>)}
          </div>
        </div>
      </section>
    </main>
  );
}
