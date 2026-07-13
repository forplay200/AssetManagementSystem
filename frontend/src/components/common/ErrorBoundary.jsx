import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import BrandMark from './BrandMark';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (process.env.NODE_ENV !== 'production') console.error('Unhandled frontend error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="flex min-h-screen flex-col bg-aether-base p-6 text-zinc-200 sm:p-10">
        <BrandMark />
        <section className="m-auto flex w-full max-w-lg flex-col items-center rounded-xl border border-white/[0.08] bg-aether-surface p-8 text-center sm:p-10">
          <span className="grid h-14 w-14 place-items-center rounded-lg border border-red-400/20 bg-red-400/[0.08] text-red-300"><AlertTriangle size={25} /></span>
          <h1 className="mt-5 font-display text-2xl font-semibold text-zinc-50">The workspace hit an error</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-zinc-500">Your data has not been changed. Reload the interface to restore the current workspace session.</p>
          {process.env.NODE_ENV !== 'production' && <code className="mt-4 max-w-full overflow-auto rounded bg-black/30 px-3 py-2 font-mono text-[10px] text-red-200/70">{this.state.error.message}</code>}
          <button className="primary-button mt-6" onClick={() => window.location.reload()}><RefreshCw size={16} /> Reload workspace</button>
        </section>
      </main>
    );
  }
}
