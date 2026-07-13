import { ShieldX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions';

export default function PermissionRoute({ permission, children }) {
  const { can } = usePermissions();
  if (can(permission)) return children;
  return (
    <section className="panel flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-lg border border-red-400/20 bg-red-400/[0.08] text-red-300"><ShieldX size={25} /></span>
      <h1 className="mt-5 font-display text-xl font-semibold text-zinc-100">Permission required</h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">Your workspace role can view and discuss assets, but it cannot perform this management action.</p>
      <Link to="/assets" className="secondary-button mt-6">Return to asset library</Link>
    </section>
  );
}
