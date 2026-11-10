import { useEffect, useState } from 'react';
import api from '../../services/api';
export default function TrialUsage() {
  const [value, setValue] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => { let active = true; api.get('/teams/current/usage').then(({ data }) => { if (active) setValue(data); }).catch(() => { if (active) setError(true); }); return () => { active = false; }; }, []);
  if (error) return <p className="mb-4 text-xs text-zinc-400">Storage usage is temporarily unavailable. Upload limits still apply.</p>;
  if (!value?.enabled) return null;
  const mib = bytes => (bytes / 1048576).toFixed(1);
  return <aside className="panel mb-5 p-4" aria-label="Trial resource usage"><p className="text-sm text-zinc-300">Workspace storage: {mib(value.workspaceBytes)} / {mib(value.workspaceLimitBytes)} MiB</p><p className="mt-2 text-xs text-zinc-400">Includes historical versions and recycle-bin files. AI allowance: {value.aiDailyLimit} requests per account per day (UTC), including automatic analysis. Manual tagging remains available.</p></aside>;
}
