import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import PublicAuthShell from '../components/auth/PublicAuthShell';
import { useAuth } from '../context/AuthContext';
import { getApiError } from '../services/api';

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const session = await login(form);
      const fallback = session.user?.role === 'user' && !session.user?.team ? '/workspace' : '/dashboard';
      navigate(location.state?.from?.pathname || fallback, { replace: true });
    } catch (requestError) {
      setError(getApiError(requestError, 'Unable to sign in. Check your details and try again.'));
    } finally { setLoading(false); }
  };

  return (
    <PublicAuthShell>
      <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-aether-primary">Secure workspace access</p>
      <h1 className="font-display text-4xl font-bold tracking-[-0.025em] text-zinc-50">Welcome back.</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-400">Sign in to organize, retrieve, and collaborate on your team's digital assets.</p>
      {searchParams.get('reason') === 'session-expired' && <div className="mt-5 rounded border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2.5 text-sm text-amber-200/80" role="status">Your secure session expired. Sign in again to continue.</div>}
      <form className="mt-9 space-y-5" onSubmit={submit}>
        <label className="block"><span className="label">Email address</span><input type="email" className="input mt-2 w-full" autoComplete="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="developer@studio.com" /></label>
        <label className="block"><span className="flex items-center justify-between"><span className="label">Password</span><Link to="/forgot-password" className="text-xs text-zinc-500 transition hover:text-violet-300">Forgot password?</Link></span><span className="relative mt-2 block"><input type={showPassword ? 'text' : 'password'} className="input w-full pr-12" autoComplete="current-password" required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Enter your password" /><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
        {error && <div className="rounded border border-red-400/20 bg-red-400/10 px-3 py-2.5 text-sm text-red-200" role="alert">{error}</div>}
        <button className="primary-button w-full" disabled={loading}>{loading ? 'Signing in…' : 'Sign in to Aether'}{!loading && <ArrowRight size={17} />}</button>
      </form>
      <p className="mt-5 text-center text-xs text-zinc-500">New to Aether? <Link to="/register" className="font-medium text-violet-300 hover:text-violet-200">Create an account</Link></p>
      <div className="mt-6 flex items-center gap-2 text-xs text-zinc-600"><LockKeyhole size={13} /> JWT-secured session · Role-based access</div>
    </PublicAuthShell>
  );
}
