import { CheckCircle2, Clock3, KeyRound, Mail, ShieldCheck, UserRound } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils/formatters';

const roleDetails = {
  admin: { title: 'Administrator', permissions: ['Manage users and roles', 'Manage all assets', 'Monitor workspace activity', 'Participate in discussions'] },
  developer: { title: 'Developer', permissions: ['Upload and manage assets', 'Preserve asset versions', 'Download repository files', 'Participate in discussions'] },
  designer: { title: 'Designer', permissions: ['Upload visual assets', 'Review AI metadata', 'Manage asset metadata', 'Participate in discussions'] },
  collaborator: { title: 'Collaborator', permissions: ['View repository assets', 'Download permitted files', 'Provide feedback', 'Reply to discussions'] },
};

function getTokenExpiry(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp ? new Date(payload.exp * 1000) : null;
  } catch { return null; }
}

export default function ProfilePage() {
  const { user, token } = useAuth();
  const role = roleDetails[user?.role] || roleDetails.collaborator;
  const expiry = getTokenExpiry(token);
  const initial = (user?.username || 'U').slice(0, 1).toUpperCase();

  return (
    <>
      <PageHeader eyebrow="Account" title="User Profile" description="Your identity, workspace role, and access summary." />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <section className="panel overflow-hidden">
            <div className="profile-banner h-28 border-b border-white/[0.08]" />
            <div className="px-5 pb-6 sm:px-7">
              <div className="-mt-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-end gap-4"><span className="grid h-20 w-20 place-items-center rounded-xl border-4 border-aether-surface bg-violet-500 text-2xl font-semibold text-white shadow-floating">{initial}</span><div className="pb-1"><h2 className="font-display text-xl font-semibold text-zinc-50">{user?.username}</h2><p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-aether-primary">{role.title}</p></div></div>
                <button className="secondary-button" disabled title="Profile updates are not available yet">Edit profile</button>
              </div>
              <dl className="mt-7 grid gap-4 sm:grid-cols-2">
                <div className="rounded border border-white/[0.08] bg-black/20 p-4"><dt className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-zinc-600"><UserRound size={13} /> Username</dt><dd className="mt-2 text-sm text-zinc-200">{user?.username}</dd></div>
                <div className="rounded border border-white/[0.08] bg-black/20 p-4"><dt className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-zinc-600"><Mail size={13} /> Email address</dt><dd className="mt-2 break-all text-sm text-zinc-200">{user?.email}</dd></div>
                <div className="rounded border border-white/[0.08] bg-black/20 p-4"><dt className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-zinc-600"><ShieldCheck size={13} /> Role</dt><dd className="mt-2 text-sm text-zinc-200">{role.title}</dd></div>
                <div className="rounded border border-white/[0.08] bg-black/20 p-4"><dt className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-zinc-600"><KeyRound size={13} /> User ID</dt><dd className="mt-2 font-mono text-xs text-zinc-300">USR-{String(user?.id || 0).padStart(4, '0')}</dd></div>
              </dl>
              <p className="mt-5 rounded border border-blue-400/15 bg-blue-400/[0.06] px-4 py-3 text-xs leading-5 text-blue-200/75">Profile editing will become available when a self-service profile endpoint is exposed by the platform.</p>
            </div>
          </section>

          <section className="panel p-5 sm:p-6"><h2 className="section-title"><ShieldCheck size={16} className="text-aether-primary" /> Role capabilities</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{role.permissions.map((permission) => <div key={permission} className="flex items-center gap-3 rounded border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-sm text-zinc-400"><CheckCircle2 size={15} className="shrink-0 text-aether-success" />{permission}</div>)}</div></section>
        </div>

        <aside className="space-y-5">
          <section className="panel p-5"><h2 className="section-title"><KeyRound size={16} /> Session security</h2><div className="mt-5 flex items-center gap-3 rounded border border-emerald-400/15 bg-emerald-400/[0.06] p-3"><span className="h-2 w-2 rounded-full bg-aether-success shadow-[0_0_8px_rgba(16,185,129,.5)]" /><div><p className="text-sm font-medium text-emerald-200">Authenticated</p><p className="mt-0.5 text-xs text-emerald-300/50">JWT session is active</p></div></div>{expiry && <div className="mt-4 flex gap-3 border-t border-white/[0.06] pt-4"><Clock3 size={15} className="mt-0.5 shrink-0 text-zinc-600" /><div><p className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">Session expires</p><p className="mt-1 text-xs text-zinc-400">{formatDateTime(expiry)}</p></div></div>}</section>
          <section className="panel p-5"><h2 className="font-display text-sm font-semibold text-zinc-100">Account protection</h2><p className="mt-2 text-xs leading-5 text-zinc-500">Passwords are validated by the secure backend and never stored in this browser.</p><button className="secondary-button mt-5 w-full" disabled>Change password</button></section>
        </aside>
      </div>
    </>
  );
}
