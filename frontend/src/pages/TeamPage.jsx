import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, LoaderCircle, RefreshCw, ShieldCheck, Trash2, UsersRound } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { getApiError } from '../services/api';
import { teamService } from '../services/teamService';
import { formatDate } from '../utils/formatters';

const roles = ['owner', 'manager', 'collaborator'];

export default function TeamPage() {
  const [state, setState] = useState({ loading: true, team: null, error: '', copied: false, savingId: null });
  const { user, activateTeam } = useAuth();
  const { can, role } = usePermissions();

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const { team, role: currentRole } = await teamService.current();
      activateTeam({ id: team.id, name: team.name }, currentRole);
      setState({ loading: false, team, error: '', copied: false, savingId: null });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: getApiError(error, 'Team details could not be loaded.') }));
    }
  }, [activateTeam]);

  useEffect(() => { load(); }, [load]);

  const changeRole = async (member, nextRole) => {
    setState((current) => ({ ...current, savingId: member.id, error: '' }));
    try { await teamService.updateMemberRole(member.id, nextRole); await load(); }
    catch (error) { setState((current) => ({ ...current, savingId: null, error: getApiError(error, 'The role could not be updated.') })); }
  };

  const remove = async (member) => {
    if (!window.confirm(`Remove ${member.username} from this team?`)) return;
    setState((current) => ({ ...current, savingId: member.id, error: '' }));
    try { await teamService.removeMember(member.id); await load(); }
    catch (error) { setState((current) => ({ ...current, savingId: null, error: getApiError(error, 'The member could not be removed.') })); }
  };

  const copyInvite = async () => {
    await navigator.clipboard.writeText(state.team.inviteCode);
    setState((current) => ({ ...current, copied: true }));
  };

  const regenerate = async () => {
    setState((current) => ({ ...current, savingId: 'invite', error: '' }));
    try {
      const { inviteCode } = await teamService.regenerateInviteCode();
      setState((current) => ({ ...current, savingId: null, team: { ...current.team, inviteCode } }));
    } catch (error) { setState((current) => ({ ...current, savingId: null, error: getApiError(error, 'A new invite code could not be generated.') })); }
  };

  if (state.loading) return <div className="grid min-h-[45vh] place-items-center"><LoaderCircle className="animate-spin text-aether-primary" aria-label="Loading team" /></div>;
  if (!state.team) return <section className="panel p-8 text-center"><p className="text-sm text-red-200">{state.error}</p><button className="secondary-button mt-5" onClick={load}><RefreshCw size={15} /> Try again</button></section>;

  return (
    <>
      <PageHeader eyebrow="Team workspace" title={state.team.name} description={`${state.team.members.length} member${state.team.members.length === 1 ? '' : 's'} · Your role: ${role}`} />
      {state.error && <div className="mb-5 rounded border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200" role="alert">{state.error}</div>}
      {can('manageTeam') && <section className="panel mb-5 p-5 sm:p-6"><h2 className="section-title"><ShieldCheck size={16} className="text-aether-primary" /> Invite members</h2><p className="mt-2 text-sm text-zinc-500">Share this code privately. New members join with read-only Collaborator access.</p><div className="mt-5 flex flex-col gap-2 sm:flex-row"><code className="input flex min-h-10 flex-1 items-center font-mono tracking-[0.16em] text-zinc-200">{state.team.inviteCode}</code><button className="secondary-button" onClick={copyInvite}>{state.copied ? <Check size={15} /> : <Copy size={15} />}{state.copied ? 'Copied' : 'Copy code'}</button><button className="secondary-button" onClick={regenerate} disabled={state.savingId === 'invite'}>{state.savingId === 'invite' ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />} Rotate code</button></div></section>}
      <section className="panel overflow-hidden">
        <div className="flex items-center gap-3 border-b border-white/[0.08] p-5"><UsersRound size={17} className="text-aether-primary" /><div><h2 className="font-display text-sm font-semibold text-zinc-100">Workspace members</h2><p className="mt-1 text-xs text-zinc-600">Roles apply to this team only.</p></div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead><tr className="border-b border-white/[0.08] font-mono text-[9px] uppercase tracking-wider text-zinc-600"><th className="px-5 py-3 font-medium">Member</th><th className="px-5 py-3 font-medium">Team role</th><th className="px-5 py-3 font-medium">Joined</th><th className="px-5 py-3 text-right font-medium">Actions</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{state.team.members.map((member) => <tr key={member.id} className="hover:bg-white/[0.02]"><td className="px-5 py-4"><p className="text-sm font-medium text-zinc-200">{member.username}{member.id === user?.id && <span className="ml-2 status-chip">You</span>}</p><p className="mt-1 text-xs text-zinc-600">{member.email}</p></td><td className="px-5 py-4">{can('manageTeam') ? <select className="input h-9 w-40 capitalize" aria-label={`Role for ${member.username}`} value={member.role} disabled={state.savingId === member.id} onChange={(event) => changeRole(member, event.target.value)}>{roles.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select> : <RoleBadge role={member.role} />}</td><td className="px-5 py-4 font-mono text-[10px] uppercase text-zinc-600">{formatDate(member.joinedAt)}</td><td className="px-5 py-4 text-right">{can('manageTeam') && member.id !== user?.id && <button className="icon-action hover:text-red-300" disabled={state.savingId === member.id} onClick={() => remove(member)} aria-label={`Remove ${member.username}`}>{state.savingId === member.id ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}</button>}</td></tr>)}</tbody></table></div>
      </section>
    </>
  );
}

function RoleBadge({ role }) {
  const styles = { owner: 'border-violet-400/20 bg-violet-400/10 text-violet-300', manager: 'border-blue-400/20 bg-blue-400/10 text-blue-300', collaborator: 'border-zinc-400/15 bg-zinc-400/[0.06] text-zinc-400' };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-wide ${styles[role]}`}>{role}</span>;
}
