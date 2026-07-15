import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

function pageName(pathname) {
  if (pathname === '/dashboard') return 'Dashboard';
  if (pathname === '/assets') return 'Asset Library';
  if (/^\/assets\/[^/]+$/.test(pathname)) return 'Asset Details';
  if (pathname === '/upload') return 'Upload Asset';
  if (pathname === '/search') return 'Search Assets';
  if (pathname === '/workspace') return 'Workspace Setup';
  if (pathname === '/team') return 'Team Workspace';
  if (pathname === '/profile') return 'User Profile';
  if (pathname === '/admin/users') return 'System User Administration';
  if (pathname === '/login') return 'Sign In';
  if (pathname === '/register') return 'Create Account';
  if (pathname === '/forgot-password') return 'Password Recovery';
  if (pathname === '/reset-password') return 'Reset Password';
  return 'Page Not Found';
}

export default function RouteAccessibility() {
  const { pathname } = useLocation();
  const name = useMemo(() => pageName(pathname), [pathname]);

  useEffect(() => {
    document.title = `${name} · Aether`;
    const timer = window.setTimeout(() => document.getElementById('main-content')?.focus({ preventScroll: true }), 0);
    return () => window.clearTimeout(timer);
  }, [name]);

  return <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{name}</span>;
}

export { pageName };
