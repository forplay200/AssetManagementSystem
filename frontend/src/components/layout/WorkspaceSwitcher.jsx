import { useCallback, useEffect, useState } from 'react';
import { Building2, LoaderCircle, RefreshCw } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { teamService } from '../../services/teamService';

export default function WorkspaceSwitcher({ onNavigate }) {
  const [state, setState] = useState({ loading: true, teams: [], error: '' });
  const { user, activateTeam } = useAuth();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const result = await teamService.list();
      setState({ loading: false, teams: result.teams || [], error: '' });
    } catch {
      setState((current) => ({ ...current, loading: false, error: 'Workspaces unavailable' }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectTeam = (event) => {
    const team = state.teams.find((item) => String(item.id) === event.target.value);
    if (!team || Number(team.id) === Number(user?.team?.id)) return;
    activateTeam({ id: team.id, name: team.name }, team.role);
    onNavigate?.();
    navigate('/dashboard');
  };

  return (
    <section className="border-b border-white/[0.08] px-4 py-4" aria-labelledby="workspace-switcher-label">
      <div className="mb-2 flex items-center justify-between">
        <label id="workspace-switcher-label" htmlFor="workspace-switcher" className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">Active workspace</label>
        <Link to="/workspace" onClick={onNavigate} className="text-[10px] text-zinc-600 transition hover:text-aether-primary">Add</Link>
      </div>
      {state.loading ? <div className="flex h-10 items-center gap-2 rounded border border-white/[0.08] bg-black/20 px-3 text-xs text-zinc-600"><LoaderCircle size={14} className="animate-spin" /> Loading workspaces</div> : state.error ? <button className="flex h-10 w-full items-center justify-between rounded border border-amber-400/15 bg-amber-400/[0.05] px-3 text-xs text-amber-200/70" onClick={load}><span>{state.error}</span><RefreshCw size={13} /></button> : <div className="relative"><Building2 size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-aether-primary" /><select id="workspace-switcher" aria-label="Active workspace" className="input h-10 w-full appearance-none truncate pl-9 pr-8 text-xs" value={user?.team?.id || ''} onChange={selectTeam}><option value="" disabled>{state.teams.length ? 'Select workspace' : 'No workspace yet'}</option>{state.teams.map((team) => <option key={team.id} value={team.id}>{team.name} · {roleLabel(team.role)}</option>)}</select><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600">▾</span></div>}
      {user?.team && <p className="mt-2 truncate font-mono text-[9px] uppercase tracking-wide text-zinc-600">{roleLabel(user.teamRole)} access</p>}
    </section>
  );
}

function roleLabel(role) {
  return role ? role[0].toUpperCase() + role.slice(1) : 'Member';
}
