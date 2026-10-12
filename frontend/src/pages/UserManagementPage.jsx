import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Building2, Eye, LoaderCircle, RefreshCw, Search, UserCheck, UsersRound, UserX } from 'lucide-react';
import { ACCOUNT_ROLES, accountRoleLabel, workspaceRoleLabel } from '../auth/roles';
import Dialog from '../components/common/Dialog';
import useConfirmation from '../hooks/useConfirmation';
import PageHeader from '../components/common/PageHeader';
import { useAuth } from '../context/AuthContext';
import { getApiError } from '../services/api';
import { userService } from '../services/userService';
import { formatDate, formatDateTime } from '../utils/formatters';

const roleOptions = [ACCOUNT_ROLES.SYSTEM_ADMINISTRATOR, ACCOUNT_ROLES.USER];

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const [state, setState] = useState({ loading: true, users: [], error: '', unavailable: false });
  const [filters, setFilters] = useState({ q: '', status: '', role: '' });
  const [notice, setNotice] = useState('');
  const [pendingId, setPendingId] = useState(null);
  const [details, setDetails] = useState({ user: null, loading: false, error: '' });

  const { confirm, confirmation } = useConfirmation();
  const listSequence = useRef(0);
  const detailsSequence = useRef(0);
  const closeDetails = () => { detailsSequence.current++; setDetails({ user: null, loading: false, error: '' }); };

  const load = useCallback(async (activeFilters = {}) => {
    const request = ++listSequence.current;
    setState((current) => ({ ...current, loading: true, error: '', unavailable: false }));
    try {
      const users = await userService.list(activeFilters);
      if (request !== listSequence.current) return;
      setState({ loading: false, users: Array.isArray(users) ? users : [], error: '', unavailable: false });
    } catch (error) {
      if (request !== listSequence.current) return;
      if (error.response?.status === 404) setState({ loading: false, users: [], error: '', unavailable: true });
      else setState((current) => ({ ...current, loading: false, error: getApiError(error, 'System users could not be loaded.') }));
    }
  }, []);

  useEffect(() => { const lists = listSequence; const detailRequests = detailsSequence; load(); return () => { lists.current++; detailRequests.current++; }; }, [load]);

  const search = (event) => {
    event.preventDefault();
    setNotice('');
    load({ q: filters.q.trim() || undefined, status: filters.status || undefined, role: filters.role || undefined });
  };

  const openDetails = async (user) => {
    const request = ++detailsSequence.current;
    setDetails({ user: null, loading: true, error: '' });
    try {
      const result = await userService.get(user.id);
      if (request === detailsSequence.current) setDetails({ user: result, loading: false, error: '' });
    } catch (error) {
      if (request === detailsSequence.current) setDetails({ user: null, loading: false, error: getApiError(error, 'User details could not be loaded.') });
    }
  };

  const setAccountStatus = user => {
    const nextStatus = user.isActive === false ? 'active' : 'inactive';
    return confirm({ title: nextStatus === 'inactive' ? 'Deactivate account?' : 'Activate account?', details: `${user.username} · ${user.email}`, description: nextStatus === 'inactive' ? 'This account’s active sessions will be blocked. Its records will be preserved.' : 'This account will be able to sign in and use its assigned access again.', confirmLabel: nextStatus === 'inactive' ? 'Deactivate account' : 'Activate account', danger: nextStatus === 'inactive', onConfirm: async () => {
      setPendingId(user.id); setNotice('');
      try {
        const { user: updated } = await userService.setStatus(user.id, nextStatus);
        setState(current => ({ ...current, users: current.users.map(item => item.id === updated.id ? { ...item, ...updated } : item) }));
        setDetails(current => current.user?.id === updated.id ? { ...current, user: { ...current.user, ...updated } } : current);
        setNotice(`${updated.username}'s account is now ${updated.isActive === false ? 'Inactive' : 'Active'}.`);
      } finally { setPendingId(null); }
    } });
  };

  if (state.loading && !state.users.length) {
    return <div className="grid min-h-[50vh] place-items-center"><LoaderCircle className="animate-spin text-aether-primary" /></div>;
  }

  return (
    <>
      <PageHeader eyebrow="System administration" title="System Users" description="Review registered accounts and control platform access. Workspace roles remain read-only here and are managed by each Workspace Owner." />
      {state.unavailable ? <ServiceUnavailable onRetry={() => load(filters)} /> : <>
        {state.error && <div className="mb-5 flex items-center justify-between rounded border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200" role="alert"><span>{state.error}</span><button onClick={() => load(filters)} className="flex items-center gap-2"><RefreshCw size={14} /> Retry</button></div>}
        {notice && <div className="mb-5 rounded border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200" role="status">{notice}</div>}
        <section className="panel overflow-hidden">
          <form className="grid gap-3 border-b border-white/[0.08] p-4 sm:grid-cols-2 2xl:grid-cols-[minmax(220px,1fr)_160px_200px_auto]" onSubmit={search}>
            <label className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" /><input className="input h-10 w-full pl-9" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="Search by name or email" aria-label="Search users" /></label>
            <select className="input h-10" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} aria-label="Filter by account status"><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
            <select className="input h-10" value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })} aria-label="Filter by account role"><option value="">All account roles</option>{roleOptions.map((role) => <option key={role} value={role}>{accountRoleLabel(role)}</option>)}</select>
            <button className="primary-button h-10" disabled={state.loading}>{state.loading ? <LoaderCircle size={15} className="animate-spin" /> : <Search size={15} />} Search</button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead><tr className="border-b border-white/[0.08] font-mono text-xs uppercase tracking-wider text-zinc-400"><th className="px-5 py-3 font-medium">User</th><th className="px-5 py-3 font-medium">Account role</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Registered</th><th className="px-5 py-3 text-right font-medium">Actions</th></tr></thead>
              <tbody className="divide-y divide-white/[0.06]">
                {state.users.map((user) => {
                  const active = user.isActive !== false;
                  const isCurrent = Number(user.id) === Number(currentUser?.id);
                  return <tr key={user.id} className="transition hover:bg-white/[0.02]">
                    <td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded bg-violet-400/[0.10] text-sm font-semibold text-violet-300">{user.username.slice(0, 1).toUpperCase()}</span><div><p className="text-sm font-medium text-zinc-200">{user.username}{isCurrent && <span className="ml-2 status-chip">You</span>}</p><p className="mt-1 text-xs text-zinc-400">{user.email}</p></div></div></td>
                    <td className="px-5 py-4"><RoleBadge role={user.role} /></td>
                    <td className="px-5 py-4"><StatusBadge active={active} /></td>
                    <td className="px-5 py-4 font-mono text-xs uppercase text-zinc-400">{formatDate(user.createdAt)}</td>
                    <td className="px-5 py-4"><div className="flex justify-end gap-2"><button className="secondary-button h-9 px-3 text-xs" onClick={() => openDetails(user)}><Eye size={14} /> Details</button><button className={active ? 'danger-button h-9 px-3 text-xs' : 'success-button h-9 px-3 text-xs'} disabled={pendingId === user.id || (active && isCurrent)} onClick={() => setAccountStatus(user)} title={active && isCurrent ? 'You cannot deactivate your own account' : undefined}>{pendingId === user.id ? <LoaderCircle size={14} className="animate-spin" /> : active ? <UserX size={14} /> : <UserCheck size={14} />}{active ? 'Deactivate' : 'Activate'}</button></div></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          {!state.loading && !state.error && !state.users.length && <div className="px-6 py-12 text-center"><UsersRound className="mx-auto text-zinc-700" size={27} /><p className="mt-3 text-sm text-zinc-400">No system users match these filters.</p></div>}
          <div className="border-t border-white/[0.08] px-5 py-3 font-mono text-xs uppercase tracking-wide text-zinc-400">{state.users.length} matching users</div>
        </section>
      </>}
      {(details.loading || details.user || details.error) && <UserDetailsModal state={details} pending={pendingId === details.user?.id} currentUserId={currentUser?.id} onClose={closeDetails} onStatusChange={setAccountStatus} />}
      {confirmation}
    </>
  );
}

function UserDetailsModal({ state, pending, currentUserId, onClose, onStatusChange }) {

  const user = state.user;
  const active = user?.isActive !== false;
  const memberships = user?.teamMemberships || [];
  return <Dialog open title={user?.username || 'Loading account…'} onClose={onClose} busy={pending} wide>
    {state.loading ? <div className="grid min-h-56 place-items-center"><LoaderCircle className="animate-spin text-aether-primary" /></div> : state.error ? <div className="mt-6 rounded border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200" role="alert">{state.error}</div> : <>
      <dl className="mt-6 grid gap-3 sm:grid-cols-2"><Detail label="Email address" value={user.email} /><Detail label="Account role" value={accountRoleLabel(user.role)} /><Detail label="Account status" value={active ? 'Active' : 'Inactive'} /><Detail label="Registered" value={formatDateTime(user.createdAt)} /><Detail label="Last account update" value={formatDateTime(user.updatedAt)} /><Detail label="System user ID" value={`USR-${String(user.id).padStart(4, '0')}`} mono /></dl>
      <section className="mt-6 border-t border-white/[0.08] pt-5"><h3 className="flex items-center gap-2 font-display text-sm font-semibold text-zinc-100"><Building2 size={15} className="text-aether-secondary" /> Workspace role assignments</h3><p className="mt-1 text-xs text-zinc-400">Read-only. Workspace Owners control these assignments.</p>{memberships.length ? <div className="mt-4 space-y-2">{memberships.map((membership) => <div key={membership.id} className="flex items-center justify-between gap-4 rounded border border-white/[0.07] bg-black/20 px-4 py-3"><div><p className="text-sm text-zinc-300">{membership.team?.name || 'Unknown workspace'}</p><p className="mt-1 font-mono text-xs uppercase text-zinc-400">Joined {formatDate(membership.createdAt)}</p></div><span className="tag-chip">{workspaceRoleLabel(membership.role)}</span></div>)}</div> : <p className="mt-4 rounded border border-white/[0.06] bg-black/20 px-4 py-4 text-sm text-zinc-400">No workspace role assignments.</p>}</section>
      <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/[0.08] pt-5"><StatusBadge active={active} /><button className={active ? 'danger-button' : 'success-button'} disabled={pending || (active && Number(user.id) === Number(currentUserId))} onClick={() => onStatusChange(user)}>{pending ? <LoaderCircle size={15} className="animate-spin" /> : active ? <UserX size={15} /> : <UserCheck size={15} />}{active ? 'Deactivate account' : 'Activate account'}</button></div>
    </>}</Dialog>;
}

function Detail({ label, value, mono = false }) {
  return <div className="rounded border border-white/[0.07] bg-black/20 p-4"><dt className="font-mono text-xs uppercase tracking-wider text-zinc-400">{label}</dt><dd className={`mt-2 break-words text-sm text-zinc-300 ${mono ? 'font-mono text-xs' : ''}`}>{value || 'Not available'}</dd></div>;
}

function StatusBadge({ active }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 font-mono text-xs uppercase tracking-wide ${active ? 'border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300' : 'border-red-400/20 bg-red-400/[0.08] text-red-300'}`}>{active ? 'Active' : 'Inactive'}</span>;
}

function RoleBadge({ role }) {
  const system = role === ACCOUNT_ROLES.SYSTEM_ADMINISTRATOR;
  return <span className={`inline-flex rounded-full border px-2.5 py-1 font-mono text-xs uppercase tracking-wide ${system ? 'border-violet-400/20 bg-violet-400/[0.08] text-violet-300' : 'border-white/[0.08] bg-white/[0.04] text-zinc-400'}`}>{accountRoleLabel(role)}</span>;
}

function ServiceUnavailable({ onRetry }) {
  return <section className="panel flex min-h-[430px] flex-col items-center justify-center px-6 py-12 text-center"><span className="grid h-14 w-14 place-items-center rounded-lg border border-amber-400/20 bg-amber-400/[0.08] text-amber-300"><AlertTriangle size={24} /></span><h2 className="mt-5 font-display text-xl font-semibold text-zinc-100">System user service is unavailable</h2><p className="mt-2 max-w-lg text-sm leading-6 text-zinc-400">The protected platform-level user API could not be reached.</p><button className="secondary-button mt-6" onClick={onRetry}><RefreshCw size={15} /> Check again</button></section>;
}
