import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, LoaderCircle, Pencil, RefreshCw, ShieldCheck, Trash2, UsersRound } from 'lucide-react';
import useConfirmation from '../hooks/useConfirmation';
import RenameDialog from '../components/common/RenameDialog';
import PageHeader from '../components/common/PageHeader';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { getApiError } from '../services/api';
import { teamService } from '../services/teamService';
import { formatDate } from '../utils/formatters';
import { WORKSPACE_ROLES, workspaceRoleLabel } from '../auth/roles';

const roles = Object.values(WORKSPACE_ROLES);

export default function TeamPage() {
  const [state, setState] = useState({ loading: true, team: null, error: '', copied: false, savingId: null });
  const { confirm, confirmation } = useConfirmation();
  const { user, token, activateTeam, updateWorkspaceName, applyWorkspaceName, getNameRevision } = useAuth();
  const [renaming, setRenaming] = useState(false);
  const [notice, setNotice] = useState('');
  const sequence = useRef(0);
  const identity = useRef(null);
  identity.current = { token, workspaceId: user?.team?.id };
  const workspaceId = user?.team?.id;
  const { can, role } = usePermissions();

  const load = useCallback(async () => {
    const request = ++sequence.current;
    const expected = { token, workspaceId, nameRevision: getNameRevision?.() };
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const { team, role: currentRole } = await teamService.current();
      if (request !== sequence.current || identity.current.token !== expected.token || identity.current.workspaceId !== expected.workspaceId) return;
      const namedTeam = applyWorkspaceName ? applyWorkspaceName(team, expected.nameRevision) : team;
      activateTeam({ id: team.id, name: namedTeam.name }, currentRole, expected);
      setState({ loading: false, team: namedTeam, error: '', copied: false, savingId: null });
    } catch (error) {
      if (request !== sequence.current) return;
      setState((current) => ({ ...current, loading: false, error: getApiError(error, 'Team details could not be loaded.') }));
    }
  }, [activateTeam, applyWorkspaceName, getNameRevision, token, workspaceId]);

  useEffect(() => { const counter = sequence; setRenaming(false); load(); return () => { counter.current++; }; }, [load]);

  const changeRole = async (member, nextRole) => {
    if (member.role === nextRole) return;
    const impact = nextRole === WORKSPACE_ROLES.OWNER ? 'Owners can manage members, assign roles and delete assets.' : nextRole === WORKSPACE_ROLES.MANAGER ? 'Managers can upload assets, manage metadata and create versions.' : 'Collaborators can view, download and discuss assets; they cannot manage asset files.';
    if (await confirm({ title: 'Change workspace role?', details: `${member.username}: ${workspaceRoleLabel(member.role)} → ${workspaceRoleLabel(nextRole)}`, description: `${impact}${member.id === user?.id ? ' This changes your own access.' : ''}`, confirmLabel: 'Change role', danger: false, onConfirm: () => teamService.updateMemberRole(member.id, nextRole) })) await load();
  };

  const remove = async (member) => {
    if (await confirm({ title: 'Remove workspace member?', details: `${member.username} · ${state.team.name}`, description: 'This member will lose access to this workspace.', confirmLabel: 'Remove member', onConfirm: () => teamService.removeMember(member.id) })) await load();
  };

  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(state.team.inviteCode); setState(current => ({ ...current, copied: true, error: '' })); }
    catch { setState(current => ({ ...current, copied: false, error: 'The code could not be copied. Select it and copy it manually.' })); }
  };

  const regenerate = () => confirm({ title: 'Rotate invitation code?', details: state.team.name, description: 'The old code will stop working immediately. Existing members keep their access.', confirmLabel: 'Rotate code', onConfirm: async () => {
    const { inviteCode } = await teamService.regenerateInviteCode();
    setState(current => ({ ...current, copied: false, team: { ...current.team, inviteCode } }));
  } });

  if (state.loading) return <div className="grid min-h-[45vh] place-items-center"><LoaderCircle className="animate-spin text-aether-primary" aria-label="Loading team" /></div>;
  if (!state.team) return <section className="panel p-8 text-center"><p className="text-sm text-red-200">{state.error}</p><button className="secondary-button mt-5" onClick={load}><RefreshCw size={15} /> Try again</button></section>;

  return (
    <>
      <PageHeader eyebrow="Team workspace" title={<span className="flex items-start gap-3"><span className="min-w-0">{state.team.name}</span>{role === WORKSPACE_ROLES.OWNER && <button className="icon-action mt-1 shrink-0" aria-label="Rename workspace" onClick={() => setRenaming(true)}><Pencil size={16} /></button>}</span>} description={`${state.team.members.length} member${state.team.members.length === 1 ? '' : 's'} · Your role: ${workspaceRoleLabel(role)}`} />
      {notice && <p role="status" className="mb-5 text-sm text-emerald-300">{notice}</p>}
      {state.error && <div className="mb-5 rounded border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200" role="alert">{state.error}</div>}
      {can('manageTeam') && <section className="panel mb-5 p-5 sm:p-6"><h2 className="section-title"><ShieldCheck size={16} className="text-aether-primary" /> Invite members</h2><p className="mt-2 text-sm text-zinc-400">Share this code privately. New members join with read-only Collaborator access.</p><div className="mt-5 flex flex-col gap-2 sm:flex-row"><code className="input flex min-h-10 flex-1 items-center font-mono tracking-[0.16em] text-zinc-200">{state.team.inviteCode}</code><button className="secondary-button" onClick={copyInvite}>{state.copied ? <Check size={15} /> : <Copy size={15} />}{state.copied ? 'Copied' : 'Copy code'}</button><button className="secondary-button" onClick={regenerate} disabled={state.savingId === 'invite'}>{state.savingId === 'invite' ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />} Rotate code</button></div></section>}
      <section className="panel overflow-hidden">
        <div className="flex items-center gap-3 border-b border-white/[0.08] p-5"><UsersRound size={17} className="text-aether-primary" /><div><h2 className="font-display text-sm font-semibold text-zinc-100">Workspace members</h2><p className="mt-1 text-xs text-zinc-400">Roles apply to this team only.</p></div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead><tr className="border-b border-white/[0.08] font-mono text-xs uppercase tracking-wider text-zinc-400"><th className="px-5 py-3 font-medium">Member</th><th className="px-5 py-3 font-medium">Team role</th><th className="px-5 py-3 font-medium">Joined</th><th className="px-5 py-3 text-right font-medium">Actions</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{state.team.members.map((member) => <tr key={member.id} className="hover:bg-white/[0.02]"><td className="px-5 py-4"><p className="text-sm font-medium text-zinc-200">{member.username}{member.id === user?.id && <span className="ml-2 status-chip">You</span>}</p><p className="mt-1 text-xs text-zinc-400">{member.email}</p></td><td className="px-5 py-4">{can('manageTeam') ? <select className="input h-9 w-44" aria-label={`Role for ${member.username}`} value={member.role} disabled={state.savingId === member.id} onChange={(event) => changeRole(member, event.target.value)}>{roles.map((item) => <option key={item} value={item}>{workspaceRoleLabel(item)}</option>)}</select> : <RoleBadge role={member.role} />}</td><td className="px-5 py-4 font-mono text-xs uppercase text-zinc-400">{formatDate(member.joinedAt)}</td><td className="px-5 py-4 text-right">{can('manageTeam') && member.id !== user?.id && <button className="icon-action hover:text-red-300" disabled={state.savingId === member.id} onClick={() => remove(member)} aria-label={`Remove ${member.username}`}>{state.savingId === member.id ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}</button>}</td></tr>)}</tbody></table></div>
      </section>
      {renaming && <RenameDialog title="Rename workspace" initialName={state.team.name} minLength={2} maxLength={100} onClose={() => setRenaming(false)} onSave={async name => {
        const expected = identity.current;
        const { team } = await teamService.rename(name);
        updateWorkspaceName(team, expected.token);
        if (identity.current.token !== expected.token || identity.current.workspaceId !== expected.workspaceId) return;
        setState(current => ({ ...current, team: { ...current.team, name: team.name } }));
        setNotice('Workspace name saved.');
      }} />}
      {confirmation}
    </>
  );
}

function RoleBadge({ role }) {
  const styles = { [WORKSPACE_ROLES.OWNER]: 'border-violet-400/20 bg-violet-400/10 text-violet-300', [WORKSPACE_ROLES.MANAGER]: 'border-blue-400/20 bg-blue-400/10 text-blue-300', [WORKSPACE_ROLES.COLLABORATOR]: 'border-zinc-400/15 bg-zinc-400/[0.06] text-zinc-400' };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 font-mono text-xs uppercase tracking-wide ${styles[role] || ''}`}>{workspaceRoleLabel(role)}</span>;
}
