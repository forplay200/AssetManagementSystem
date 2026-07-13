import { useState } from 'react';
import { CheckCircle2, KeyRound, LoaderCircle } from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import PublicAuthShell from '../components/auth/PublicAuthShell';
import { useAuth } from '../context/AuthContext';
import { getApiError } from '../services/api';
import { authService } from '../services/authService';

export default function ResetPasswordPage() {
  const { isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [status, setStatus] = useState({ loading: false, error: '', complete: false });
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const submit = async (event) => {
    event.preventDefault();
    if (form.password !== form.confirm) { setStatus({ loading: false, error: 'Passwords do not match.', complete: false }); return; }
    setStatus({ loading: true, error: '', complete: false });
    try {
      await authService.resetPassword(token, form.password);
      setStatus({ loading: false, error: '', complete: true });
    } catch (error) { setStatus({ loading: false, error: getApiError(error, 'The password could not be reset.'), complete: false }); }
  };

  return <PublicAuthShell><p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-aether-primary">Secure password change</p><h1 className="font-display text-4xl font-bold tracking-[-0.025em] text-zinc-50">Choose a new password.</h1>{status.complete ? <div className="mt-8 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] p-5"><CheckCircle2 className="text-emerald-300" size={22} /><h2 className="mt-3 font-display text-base font-semibold text-emerald-100">Password updated</h2><p className="mt-2 text-sm text-emerald-200/60">You can now sign in with your new password.</p><Link to="/login" className="primary-button mt-5 w-full">Continue to sign in</Link></div> : token ? <form className="mt-8 space-y-5" onSubmit={submit}><label className="block"><span className="label">New password</span><input type="password" className="input mt-2 w-full" required minLength={6} autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label><label className="block"><span className="label">Confirm new password</span><input type="password" className="input mt-2 w-full" required minLength={6} autoComplete="new-password" value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} /></label>{status.error && <div className="rounded border border-red-400/20 bg-red-400/10 px-3 py-2.5 text-sm text-red-200" role="alert">{status.error}</div>}<button className="primary-button w-full" disabled={status.loading || form.password.length < 6}>{status.loading ? <LoaderCircle size={16} className="animate-spin" /> : <KeyRound size={16} />}{status.loading ? 'Updating…' : 'Update password'}</button></form> : <div className="mt-8 rounded border border-red-400/20 bg-red-400/[0.07] p-5 text-sm text-red-200">This recovery link is missing its secure token. Start a new password-recovery request.</div>} {!status.complete && <Link to="/forgot-password" className="secondary-button mt-7 w-full">Request a new link</Link>}</PublicAuthShell>;
}
