import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Building2, Eye, LoaderCircle, RefreshCw, Search, UserCheck, UsersRound, UserX, X } from 'lucide-react';
import { accountRoleLabel } from '../auth/roles';
import PageHeader from '../components/common/PageHeader';
import { useAuth } from '../context/AuthContext';
import { getApiError } from '../services/api';
import { userService } from '../services/userService';
import { formatDate, formatDateTime } from '../utils/formatters';

const roleOptions = ['systemAdministrator', 'user', 'developer', 'designer', 'collaborator'];

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const [state, setState] = useState({ loading: true, users: [], error: '', unavailable: false });
  const [filters, setFilters] = useState({ q: '', status: '', role: '' });
  const [notice, setNotice] = useState('');
  const [pendingId, setPendingId] = useState(null);
  const [details, setDetails] = useState({ user: null, loading: false, error: '' });

  const load = useCallback(async (activeFilters = {}) => {
    setState((current) => ({ ...current, loading: true, error: '', unavailable: false }));
    try {
      const users = await userService.list(activeFilters);
      setState({ loading: false, users: Array.isArray(users) ? users : [], error: '', unavailable: false });
    } catch (error) {
      if (error.response?.status === 404) setState({ loading: false, users: [], error: '', unavailable: true });
      else setState((current) => ({ ...current, loading: false, error: getApiError(error, 'System users could not be loaded.') }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const search = (event) => {
    event.preventDefault();
    setNotice('');
    load({ q: filters.q.trim() || undefined, status: filters.status || undefined, role: filters.role || undefined });
  };

  const openDetails = async (user) => {
    setDetails({ user: null, loading: true, error: '' });
    try {
      setDetails({ user: await userService.get(user.id), loading: false, error: '' });
    } catch (error) {
      setDetails({ user: null, loading: false, error: getApiError(error, 'User details could not be loaded.') });
    }
  };

  const setAccountStatus = async (user) => {
    const nextStatus = user.isActive === false ? 'active' : 'inactive';
    if (nextStatus === 'inactive' && !window.confirm(`Deactivate ${user.username}? Their active sessions will be blocked.`)) return;
    setPendingId(user.id);
    setNotice('');
    try {
      const response = await userService.setStatus(user.id, nextStatus);
      const updated = response.user;
      setState((current) => ({ ...current, users: current.users.map((item) => item.id === updated.id ? { ...item, ...updated } : item) }));
      setDetails((current) => current.user?.id === updated.id ? { ...current, user: { ...current.user, ...updated } } : current);
      setNotice(`${updated.username}'s account is now ${updated.isActive === false ? 'Inactive' : 'Active'}.`);
    } catch (error) {
      setState((current) => ({ ...current, error: getApiError(error, 'The account status could not be updated.') }));
    } finally {
      setPendingId(null);
    }
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
          <form className="grid gap-3 border-b border-white/[0.08] p-4 md:grid-cols-[minmax(240px,1fr)_180px_210px_auto]" onSubmit={search}>
            <label className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" /><input className="input h-10 w-full pl-9" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="Search by name or email" aria-label="Search users" /></label>
            <select className="input h-10" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} aria-label="Filter by account status"><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
            <select className="input h-10" value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })} aria-label="Filter by account role"><option value="">All account roles</option>{roleOptions.map((role) => <option key={role} value={role}>{accountRoleLabel(role)}</option>)}</select>
            <button className="primary-button h-10" disabled={state.loading}>{state.loading ? <LoaderCircle size={15} className="animate-spin" /> : <Search size={15} />} Search</button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead><tr className="border-b border-white/[0.08] font-mono text-[9px] uppercase tracking-wider text-zinc-600"><th className="px-5 py-3 font-medium">User</th><th className="px-5 py-3 font-medium">Account role</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Registered</th><th className="px-5 py-3 text-right font-medium">Actions</th></tr></thead>
              <tbody className="divide-y divide-white/[0.06]">
                {state.users.map((user) => {
                  const active = user.isActive !== false;
                  const isCurrent = Number(user.id) === Number(currentUser?.id);
                  return <tr key={user.id} className="transition hover:bg-white/[0.02]">
                    <td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded bg-violet-400/[0.10] text-sm font-semibold text-violet-300">{user.username.slice(0, 1).toUpperCase()}</span><div><p className="text-sm font-medium text-zinc-200">{user.username}{isCurrent && <span className="ml-2 status-chip">You</span>}</p><p className="mt-1 text-xs text-zinc-600">{user.email}</p></div></div></td>
                    <td className="px-5 py-4"><RoleBadge role={user.role} /></td>
                    <td className="px-5 py-4"><StatusBadge active={active} /></td>
                    <td className="px-5 py-4 font-mono text-[10px] uppercase text-zinc-600">{formatDate(user.createdAt)}</td>
                    <td className="px-5 py-4"><div className="flex justify-end gap-2"><button className="secondary-button h-9 px-3 text-xs" onClick={() => openDetails(user)}><Eye size={14} /> Details</button><button className={active ? 'danger-button h-9 px-3 text-xs' : 'success-button h-9 px-3 text-xs'} disabled={pendingId === user.id || (active && isCurrent)} onClick={() => setAccountStatus(user)} title={active && isCurrent ? 'You cannot deactivate your own account' : undefined}>{pendingId === user.id ? <LoaderCircle size={14} className="animate-spin" /> : active ? <UserX size={14} /> : <UserCheck size={14} />}{active ? 'Deactivate' : 'Activate'}</button></div></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          {!state.users.length && <div className="px-6 py-12 text-center"><UsersRound className="mx-auto text-zinc-700" size={27} /><p className="mt-3 text-sm text-zinc-500">No system users match these filters.</p></div>}
          <div className="border-t border-white/[0.08] px-5 py-3 font-mono text-[9px] uppercase tracking-wide text-zinc-600">{state.users.length} registered users</div>
        </section>
      </>}
      {(details.loading || details.user || details.error) && <UserDetailsModal state={details} pending={pendingId === details.user?.id} currentUserId={currentUser?.id} onClose={() => setDetails({ user: null, loading: false, error: '' })} onStatusChange={setAccountStatus} />}
    </>
  );
}

function UserDetailsModal({ state, pending, currentUserId, onClose, onStatusChange }) {
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const user = state.user;
  const active = user?.isActive !== false;
  const memberships = user?.teamMemberships || [];
  return <div className="fixed inset-0 z-50 grid place-items-center p-4"><button className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-label="Close user details" /><section className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/[0.10] bg-aether-surface p-5 shadow-floating sm:p-6" role="dialog" aria-modal="true" aria-labelledby="user-details-title"><div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-wider text-aether-primary">System user details</p><h2 id="user-details-title" className="mt-2 font-display text-xl font-semibold text-zinc-100">{user?.username || 'Loading account…'}</h2></div><button className="icon-action" onClick={onClose} aria-label="Close"><X size={15} /></button></div>
    {state.loading ? <div className="grid min-h-56 place-items-center"><LoaderCircle className="animate-spin text-aether-primary" /></div> : state.error ? <div className="mt-6 rounded border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200" role="alert">{state.error}</div> : <>
      <dl className="mt-6 grid gap-3 sm:grid-cols-2"><Detail label="Email address" value={user.email} /><Detail label="Account role" value={accountRoleLabel(user.role)} /><Detail label="Account status" value={active ? 'Active' : 'Inactive'} /><Detail label="Registered" value={formatDateTime(user.createdAt)} /><Detail label="Last account update" value={formatDateTime(user.updatedAt)} /><Detail label="System user ID" value={`USR-${String(user.id).padStart(4, '0')}`} mono /></dl>
      <section className="mt-6 border-t border-white/[0.08] pt-5"><h3 className="flex items-center gap-2 font-display text-sm font-semibold text-zinc-100"><Building2 size={15} className="text-aether-secondary" /> Workspace role assignments</h3><p className="mt-1 text-xs text-zinc-600">Read-only. Workspace Owners control these assignments.</p>{memberships.length ? <div className="mt-4 space-y-2">{memberships.map((membership) => <div key={membership.id} className="flex items-center justify-between gap-4 rounded border border-white/[0.07] bg-black/20 px-4 py-3"><div><p className="text-sm text-zinc-300">{membership.team?.name || 'Unknown workspace'}</p><p className="mt-1 font-mono text-[9px] uppercase text-zinc-600">Joined {formatDate(membership.createdAt)}</p></div><span className="tag-chip">{accountRoleLabel(membership.role)}</span></div>)}</div> : <p className="mt-4 rounded border border-white/[0.06] bg-black/20 px-4 py-4 text-sm text-zinc-600">No workspace role assignments.</p>}</section>
      <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/[0.08] pt-5"><StatusBadge active={active} /><button className={active ? 'danger-button' : 'success-button'} disabled={pending || (active && Number(user.id) === Number(currentUserId))} onClick={() => onStatusChange(user)}>{pending ? <LoaderCircle size={15} className="animate-spin" /> : active ? <UserX size={15} /> : <UserCheck size={15} />}{active ? 'Deactivate account' : 'Activate account'}</button></div>
    </>}</section></div>;
}

function Detail({ label, value, mono = false }) {
  return <div className="rounded border border-white/[0.07] bg-black/20 p-4"><dt className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">{label}</dt><dd className={`mt-2 break-words text-sm text-zinc-300 ${mono ? 'font-mono text-xs' : ''}`}>{value || 'Not available'}</dd></div>;
}

function StatusBadge({ active }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-wide ${active ? 'border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300' : 'border-red-400/20 bg-red-400/[0.08] text-red-300'}`}>{active ? 'Active' : 'Inactive'}</span>;
}

function RoleBadge({ role }) {
  const system = ['admin', 'systemAdministrator'].includes(role);
  return <span className={`inline-flex rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-wide ${system ? 'border-violet-400/20 bg-violet-400/[0.08] text-violet-300' : 'border-white/[0.08] bg-white/[0.04] text-zinc-400'}`}>{accountRoleLabel(role)}</span>;
}

function ServiceUnavailable({ onRetry }) {
  return <section className="panel flex min-h-[430px] flex-col items-center justify-center px-6 py-12 text-center"><span className="grid h-14 w-14 place-items-center rounded-lg border border-amber-400/20 bg-amber-400/[0.08] text-amber-300"><AlertTriangle size={24} /></span><h2 className="mt-5 font-display text-xl font-semibold text-zinc-100">System user service is unavailable</h2><p className="mt-2 max-w-lg text-sm leading-6 text-zinc-500">The protected platform-level user API could not be reached.</p><button className="secondary-button mt-6" onClick={onRetry}><RefreshCw size={15} /> Check again</button></section>;
}
