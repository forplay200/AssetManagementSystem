import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw, WifiOff } from 'lucide-react';
import { healthService } from '../../services/healthService';

const states = {
  checking: { label: 'Checking services', icon: LoaderCircle, iconClass: 'animate-spin text-zinc-500', dotClass: 'bg-zinc-600' },
  ok: { label: 'Services operational', icon: CheckCircle2, iconClass: 'text-emerald-400', dotClass: 'bg-aether-success shadow-[0_0_8px_rgba(16,185,129,.5)]' },
  degraded: { label: 'Services degraded', icon: AlertCircle, iconClass: 'text-amber-300', dotClass: 'bg-amber-400' },
  offline: { label: 'Backend unavailable', icon: WifiOff, iconClass: 'text-red-300', dotClass: 'bg-red-400' },
};

export default function SystemStatus() {
  const [status, setStatus] = useState({ state: 'checking', health: null });

  const check = useCallback(async () => {
    setStatus((current) => ({ ...current, state: 'checking' }));
    try {
      const health = await healthService.check();
      setStatus({ state: health.status === 'ok' ? 'ok' : 'degraded', health });
    } catch {
      setStatus({ state: 'offline', health: null });
    }
  }, []);

  useEffect(() => {
    check();
    const interval = window.setInterval(check, 60000);
    return () => window.clearInterval(interval);
  }, [check]);

  const current = states[status.state];
  const Icon = current.icon;
  const details = status.health?.services ? Object.entries(status.health.services).map(([name, value]) => `${name}: ${value.status}`).join(' · ') : current.label;

  return (
    <div className="rounded border border-white/[0.06] bg-black/15 p-3" aria-live="polite" title={details}>
      <div className="flex items-center gap-2.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${current.dotClass}`} />
        <div className="min-w-0 flex-1"><p className="truncate text-xs text-zinc-400">{current.label}</p><p className="mt-0.5 truncate font-mono text-[8px] uppercase text-zinc-700">{status.health?.timestamp ? `Checked ${new Date(status.health.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'API health'}</p></div>
        <button className="grid h-7 w-7 shrink-0 place-items-center rounded text-zinc-600 transition hover:bg-white/[0.05] hover:text-zinc-300" onClick={check} disabled={status.state === 'checking'} aria-label="Refresh service status">{status.state === 'checking' ? <Icon size={13} className={current.iconClass} /> : <RefreshCw size={13} />}</button>
      </div>
    </div>
  );
}
