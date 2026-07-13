import { CheckCircle2, Sparkles } from 'lucide-react';
import BrandMark from '../common/BrandMark';

export default function PublicAuthShell({ children }) {
  return (
    <main id="main-content" tabIndex="-1" className="grid min-h-screen bg-aether-base outline-none lg:grid-cols-[minmax(420px,0.88fr)_1.12fr]">
      <section className="flex min-h-screen flex-col px-6 py-6 sm:px-12 lg:px-16 xl:px-24">
        <BrandMark />
        <div className="my-auto w-full max-w-md py-12">{children}</div>
        <p className="text-xs text-zinc-700">Aether Asset Management · Team workspace</p>
      </section>
      <section className="login-visual relative hidden overflow-hidden border-l border-white/[0.08] lg:flex lg:flex-col lg:justify-end lg:p-14 xl:p-20">
        <div className="relative z-10 max-w-xl">
          <span className="mb-6 grid h-12 w-12 place-items-center rounded-lg border border-violet-300/20 bg-violet-400/10 text-aether-primary backdrop-blur"><Sparkles size={23} /></span>
          <h2 className="font-display text-4xl font-semibold leading-tight tracking-tight text-white xl:text-5xl">Your creative pipeline,<br />intelligently organized.</h2>
          <p className="mt-5 max-w-lg text-base leading-7 text-zinc-400">AI-assisted metadata makes every sprite, sound, script, and model discoverable without disrupting your workflow.</p>
          <div className="mt-9 grid grid-cols-2 gap-3">
            {['AI-generated tags', 'Version preservation', 'Advanced retrieval', 'Team feedback'].map((feature) => <div key={feature} className="flex items-center gap-2.5 rounded border border-white/[0.08] bg-white/[0.035] px-3 py-3 text-sm text-zinc-300 backdrop-blur"><CheckCircle2 size={15} className="text-aether-success" />{feature}</div>)}
          </div>
        </div>
      </section>
    </main>
  );
}
