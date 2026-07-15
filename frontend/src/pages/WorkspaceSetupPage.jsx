import { useState } from 'react';
import { ArrowRight, Building2, KeyRound, LoaderCircle, Plus, UsersRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';
import { useAuth } from '../context/AuthContext';
import { getApiError } from '../services/api';
import { teamService } from '../services/teamService';

export default function WorkspaceSetupPage() {
  const [mode, setMode] = useState('create');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [status, setStatus] = useState({ loading: false, error: '' });
  const { user, activateTeam } = useAuth();
  const navigate = useNavigate();

  const submit = async (event) => {
    event.preventDefault();
    setStatus({ loading: true, error: '' });
    try {
      const result = mode === 'create' ? await teamService.create(name.trim()) : await teamService.join(inviteCode.trim());
      activateTeam(result.team, result.role);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setStatus({ loading: false, error: getApiError(error, `Unable to ${mode} the team.`) });
    }
  };

  return (
    <>
      <PageHeader eyebrow="Workspace onboarding" title={`Welcome, ${user?.username || 'creator'}`} description="Create a team workspace or join one with an invite code before accessing shared assets." />
      <div className="mx-auto max-w-3xl">
        <section className="panel overflow-hidden">
          <div className="grid grid-cols-2 border-b border-white/[0.08] bg-black/20 p-1">
            <button className={`detail-tab justify-center ${mode === 'create' ? 'detail-tab-active' : ''}`} onClick={() => setMode('create')}><Plus size={15} /> Create team</button>
            <button className={`detail-tab justify-center ${mode === 'join' ? 'detail-tab-active' : ''}`} onClick={() => setMode('join')}><UsersRound size={15} /> Join team</button>
          </div>
          <form className="p-6 sm:p-8" onSubmit={submit}>
            <span className="grid h-12 w-12 place-items-center rounded-lg border border-violet-400/20 bg-violet-400/[0.08] text-aether-primary">{mode === 'create' ? <Building2 size={22} /> : <KeyRound size={22} />}</span>
            <h2 className="mt-5 font-display text-xl font-semibold text-zinc-100">{mode === 'create' ? 'Start a new workspace' : 'Join your team'}</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">{mode === 'create' ? 'You become the Owner and can invite members, assign roles, and manage the repository.' : 'New members join as Collaborators. A team Owner can promote your role later.'}</p>
            {mode === 'create' ? <label className="mt-6 block"><span className="label">Team name</span><input className="input mt-2 w-full" required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Northstar Game Studio" /></label> : <label className="mt-6 block"><span className="label">Invite code</span><input className="input mt-2 w-full font-mono uppercase tracking-widest" required minLength={6} value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="A1B2C3D4E5F6" /></label>}
            {status.error && <div className="mt-4 rounded border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200" role="alert">{status.error}</div>}
            <button className="primary-button mt-6" disabled={status.loading}>{status.loading ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowRight size={16} />}{status.loading ? 'Connecting…' : mode === 'create' ? 'Create workspace' : 'Join workspace'}</button>
          </form>
        </section>
      </div>
    </>
  );
}
