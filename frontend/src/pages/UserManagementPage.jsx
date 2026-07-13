import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Edit3, LoaderCircle, Plus, RefreshCw, Search, ShieldCheck, Trash2, UsersRound, X } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import { useAuth } from '../context/AuthContext';
import { getApiError } from '../services/api';
import { userService } from '../services/userService';
import { formatDate } from '../utils/formatters';

const roles = ['admin', 'developer', 'designer', 'collaborator'];
const emptyForm = { username: '', email: '', password: '', role: 'collaborator' };

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const [state, setState] = useState({ loading: true, users: [], error: '', unavailable: false });
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '', unavailable: false }));
    try {
      const users = await userService.list();
      setState({ loading: false, users: Array.isArray(users) ? users : [], error: '', unavailable: false });
    } catch (error) {
      if (error.response?.status === 404) setState({ loading: false, users: [], error: '', unavailable: true });
      else setState((current) => ({ ...current, loading: false, error: getApiError(error, 'Team members could not be loaded.') }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredUsers = useMemo(() => state.users.filter((user) => {
    const matchesQuery = !query || `${user.username} ${user.email}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (!roleFilter || user.role === roleFilter);
  }), [state.users, query, roleFilter]);

  const openCreate = () => { setEditor({ mode: 'create' }); setForm(emptyForm); setFormError(''); };
  const openEdit = (user) => { setEditor({ mode: 'edit', user }); setForm({ username: user.username, email: user.email, password: '', role: user.role }); setFormError(''); };
  const closeEditor = () => { setEditor(null); setFormError(''); };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setFormError(''); setNotice('');
    try {
      if (editor.mode === 'create') {
        const created = await userService.create(form);
        setState((current) => ({ ...current, users: [...current.users, created] }));
        setNotice(`${created.username} was added to the workspace.`);
      } else {
        const changes = { username: form.username, email: form.email, role: form.role, ...(form.password ? { password: form.password } : {}) };
        const updated = await userService.update(editor.user.id, changes);
        setState((current) => ({ ...current, users: current.users.map((user) => user.id === updated.id ? updated : user) }));
        setNotice(`${updated.username}'s account was updated.`);
      }
      closeEditor();
    } catch (error) { setFormError(getApiError(error, 'The user account could not be saved.')); }
    finally { setSaving(false); }
  };

  const remove = async (user) => {
    if (user.id === currentUser?.id || !window.confirm(`Delete ${user.username}? This action cannot be undone.`)) return;
    setNotice('');
    try {
      await userService.remove(user.id);
      setState((current) => ({ ...current, users: current.users.filter((item) => item.id !== user.id) }));
      setNotice(`${user.username} was removed from the workspace.`);
    } catch (error) { setState((current) => ({ ...current, error: getApiError(error, 'The user could not be deleted.') })); }
  };

  if (state.loading) return <div className="grid min-h-[50vh] place-items-center"><LoaderCircle className="animate-spin text-aether-primary" /></div>;

  return (
    <>
      <PageHeader eyebrow="Administration" title="Team Management" description="Create accounts, assign roles, and manage workspace access." actions={!state.unavailable && <button className="primary-button" onClick={openCreate}><Plus size={16} /> Add user</button>} />
      {state.unavailable ? <ServiceUnavailable onRetry={load} /> : <>
        {state.error && <div className="mb-5 flex items-center justify-between rounded border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200" role="alert"><span>{state.error}</span><button onClick={load} className="flex items-center gap-2"><RefreshCw size={14} /> Retry</button></div>}
        {notice && <div className="mb-5 rounded border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{notice}</div>}
        <section className="panel overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-white/[0.08] p-4 sm:flex-row">
            <label className="relative flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" /><input className="input h-9 w-full pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or email" aria-label="Search users" /></label>
            <select className="input h-9 sm:w-44" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Filter by role"><option value="">All roles</option>{roles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead><tr className="border-b border-white/[0.08] font-mono text-[9px] uppercase tracking-wider text-zinc-600"><th className="px-5 py-3 font-medium">User</th><th className="px-5 py-3 font-medium">Role</th><th className="px-5 py-3 font-medium">Created</th><th className="px-5 py-3 text-right font-medium">Actions</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{filteredUsers.map((user) => <tr key={user.id} className="transition hover:bg-white/[0.02]"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded bg-violet-400/[0.10] text-sm font-semibold text-violet-300">{user.username.slice(0, 1).toUpperCase()}</span><div><p className="text-sm font-medium text-zinc-200">{user.username}{user.id === currentUser?.id && <span className="ml-2 status-chip">You</span>}</p><p className="mt-1 text-xs text-zinc-600">{user.email}</p></div></div></td><td className="px-5 py-4"><RoleBadge role={user.role} /></td><td className="px-5 py-4 font-mono text-[10px] uppercase text-zinc-600">{formatDate(user.createdAt)}</td><td className="px-5 py-4"><div className="flex justify-end gap-1"><button className="icon-action" onClick={() => openEdit(user)} aria-label={`Edit ${user.username}`}><Edit3 size={14} /></button><button className="icon-action hover:text-red-300" disabled={user.id === currentUser?.id} onClick={() => remove(user)} aria-label={`Delete ${user.username}`}><Trash2 size={14} /></button></div></td></tr>)}</tbody></table></div>
          {!filteredUsers.length && <div className="px-6 py-12 text-center"><UsersRound className="mx-auto text-zinc-700" size={27} /><p className="mt-3 text-sm text-zinc-500">No team members match these filters.</p></div>}
          <div className="border-t border-white/[0.08] px-5 py-3 font-mono text-[9px] uppercase tracking-wide text-zinc-600">{filteredUsers.length} of {state.users.length} users</div>
        </section>
      </>}
      {editor && <UserEditor mode={editor.mode} form={form} setForm={setForm} error={formError} saving={saving} onSubmit={submit} onClose={closeEditor} />}
    </>
  );
}

function UserEditor({ mode, form, setForm, error, saving, onSubmit, onClose }) {
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  return <div className="fixed inset-0 z-50 grid place-items-center p-4"><button className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-label="Close user editor" /><section className="relative w-full max-w-lg rounded-lg border border-white/[0.10] bg-aether-surface p-5 shadow-floating sm:p-6" role="dialog" aria-modal="true" aria-labelledby="user-editor-title"><div className="flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-wider text-aether-primary">Administrator action</p><h2 id="user-editor-title" className="mt-2 font-display text-xl font-semibold text-zinc-100">{mode === 'create' ? 'Add team member' : 'Edit team member'}</h2></div><button className="icon-action" onClick={onClose} aria-label="Close"><X size={15} /></button></div><form className="mt-6 space-y-4" onSubmit={onSubmit}><label className="block"><span className="label">Username</span><input className="input mt-2 w-full" required value={form.username} onChange={update('username')} /></label><label className="block"><span className="label">Email address</span><input type="email" className="input mt-2 w-full" required value={form.email} onChange={update('email')} /></label><label className="block"><span className="label">Role</span><select className="input mt-2 w-full" value={form.role} onChange={update('role')}>{roles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label><label className="block"><span className="label">{mode === 'create' ? 'Temporary password' : 'New password (optional)'}</span><input type="password" className="input mt-2 w-full" required={mode === 'create'} minLength={6} value={form.password} onChange={update('password')} autoComplete="new-password" /></label>{error && <div className="rounded border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200" role="alert">{error}</div>}<div className="flex justify-end gap-2 border-t border-white/[0.08] pt-5"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? <LoaderCircle size={15} className="animate-spin" /> : <ShieldCheck size={15} />}{saving ? 'Saving…' : 'Save user'}</button></div></form></section></div>;
}

function ServiceUnavailable({ onRetry }) {
  return <section className="panel flex min-h-[430px] flex-col items-center justify-center px-6 py-12 text-center"><span className="grid h-14 w-14 place-items-center rounded-lg border border-amber-400/20 bg-amber-400/[0.08] text-amber-300"><AlertTriangle size={24} /></span><h2 className="mt-5 font-display text-xl font-semibold text-zinc-100">User service is not enabled</h2><p className="mt-2 max-w-lg text-sm leading-6 text-zinc-500">The administration interface is ready, but the backend has not mounted its protected user routes. No user data or changes are available until that service is enabled.</p><button className="secondary-button mt-6" onClick={onRetry}><RefreshCw size={15} /> Check again</button></section>;
}

function RoleBadge({ role }) {
  const styles = { admin: 'border-violet-400/20 bg-violet-400/[0.08] text-violet-300', developer: 'border-blue-400/20 bg-blue-400/[0.08] text-blue-300', designer: 'border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300', collaborator: 'border-white/[0.08] bg-white/[0.04] text-zinc-400' };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-wide ${styles[role] || styles.collaborator}`}>{roleLabel(role)}</span>;
}

function roleLabel(role) { return role ? role[0].toUpperCase() + role.slice(1) : 'Collaborator'; }
