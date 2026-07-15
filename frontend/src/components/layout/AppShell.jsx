import { useEffect, useState } from 'react';
import { Building2, FolderOpen, LayoutDashboard, LogOut, Menu, Search, Upload, UserRound, UsersRound, X } from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import BrandMark from '../common/BrandMark';
import SystemStatus from '../common/SystemStatus';
import WorkspaceSwitcher from './WorkspaceSwitcher';

const navigation = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, permission: 'viewAsset' },
  { label: 'Assets', to: '/assets', icon: FolderOpen, permission: 'viewAsset' },
  { label: 'Search', to: '/search', icon: Search, permission: 'viewAsset' },
  { label: 'Upload', to: '/upload', icon: Upload, permission: 'uploadAsset' },
  { label: 'Team', to: '/team', icon: UsersRound, teamOnly: true },
  { label: 'Workspace setup', to: '/workspace', icon: Building2 },
  { label: 'System users', to: '/admin/users', icon: UsersRound, permission: 'manageUsers' },
];

function Sidebar({ onNavigate }) {
  const { can } = usePermissions();
  const { user } = useAuth();
  return (
    <>
      <div className="border-b border-white/[0.08] px-5 py-[18px]">
        <BrandMark />
      </div>
      <WorkspaceSwitcher onNavigate={onNavigate} />
      <nav className="flex-1 space-y-1 px-3 py-5" aria-label="Main navigation">
        <p className="mb-3 px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">Workspace</p>
        {navigation.filter((item) => (!item.permission || can(item.permission)) && (!item.teamOnly || user?.team)).map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/[0.08] p-4">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-600">System status</p>
        <SystemStatus />
      </div>
    </>
  );
}

export default function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { user, logout, refreshTeam } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.team?.id) refreshTeam();
  }, [user?.team?.id, refreshTeam]);

  const submitSearch = (event) => {
    event.preventDefault();
    const value = query.trim();
    navigate(value ? `/search?filename=${encodeURIComponent(value)}` : '/search');
  };

  return (
    <div className="min-h-screen bg-aether-base text-zinc-200">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-white/[0.08] bg-aether-surface md:flex">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button className="absolute inset-0 bg-black/70" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />
          <aside className="relative flex h-full w-72 flex-col border-r border-white/10 bg-aether-surface shadow-floating">
            <button className="absolute right-3 top-4 p-2 text-zinc-400" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
              <X size={20} />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="md:pl-60">
        <header className="sticky top-0 z-20 flex h-[72px] items-center gap-3 border-b border-white/[0.08] bg-aether-base/85 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <button className="secondary-button h-9 w-9 p-0 md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu size={18} />
          </button>
          <form className="relative max-w-xl flex-1" onSubmit={submitSearch}>
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={17} />
            <input
              className="input h-10 w-full pl-10 pr-16"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search assets by filename…"
              aria-label="Search assets by filename"
            />
            <span className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 sm:block">ENTER</span>
          </form>
          <div className="ml-auto flex items-center gap-3 border-l border-white/[0.08] pl-3 sm:pl-5">
            <Link to="/profile" className="grid h-9 w-9 place-items-center rounded bg-violet-500/15 text-aether-primary transition hover:bg-violet-500/25" aria-label="Open profile">
              <UserRound size={18} />
            </Link>
            <Link to="/profile" className="hidden min-w-0 sm:block">
              <p className="max-w-32 truncate text-sm font-medium text-zinc-200">{user?.username || 'User'}</p>
              <p className="font-mono text-[10px] uppercase text-zinc-500">{user?.teamRole || user?.role || 'user'}</p>
            </Link>
            <button className="p-2 text-zinc-500 transition hover:text-zinc-200" onClick={logout} aria-label="Log out" title="Log out">
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <main id="main-content" tabIndex="-1" className="mx-auto max-w-[1440px] px-6 py-6 outline-none sm:px-8 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
