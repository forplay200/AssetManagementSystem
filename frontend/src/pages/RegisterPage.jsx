import { useMemo, useState } from 'react';
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import PublicAuthShell from '../components/auth/PublicAuthShell';
import { useAuth } from '../context/AuthContext';
import { getApiError } from '../services/api';

export default function RegisterPage() {
  const [form, setForm] = useState({ username: '', email: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { isAuthenticated, register } = useAuth();
  const navigate = useNavigate();
  const passwordChecks = useMemo(() => [
    { label: 'At least 6 characters', valid: form.password.length >= 6 },
    { label: 'Passwords match', valid: Boolean(form.confirmPassword) && form.password === form.confirmPassword },
  ], [form.password, form.confirmPassword]);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await register({ username: form.username.trim(), email: form.email.trim(), password: form.password });
      navigate('/workspace', { replace: true });
    } catch (requestError) {
      setError(getApiError(requestError, 'Your account could not be created.'));
    } finally { setLoading(false); }
  };

  return (
    <PublicAuthShell>
      <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-aether-primary">Create your account</p>
      <h1 className="font-display text-4xl font-bold tracking-[-0.025em] text-zinc-50">Build with your team.</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-400">Create your identity first, then create a team workspace or join one with an invite code.</p>
      <form className="mt-8 space-y-4" onSubmit={submit}>
        <label className="block"><span className="label">Username</span><input className="input mt-2 w-full" required minLength={2} maxLength={60} autoComplete="username" value={form.username} onChange={update('username')} placeholder="alex.chen" /></label>
        <label className="block"><span className="label">Email address</span><input type="email" className="input mt-2 w-full" required autoComplete="email" value={form.email} onChange={update('email')} placeholder="alex@studio.com" /></label>
        <label className="block"><span className="label">Password</span><span className="relative mt-2 block"><input type={showPassword ? 'text' : 'password'} className="input w-full pr-12" required minLength={6} autoComplete="new-password" value={form.password} onChange={update('password')} placeholder="Create a password" /><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
        <label className="block"><span className="label">Confirm password</span><input type={showPassword ? 'text' : 'password'} className="input mt-2 w-full" required minLength={6} autoComplete="new-password" value={form.confirmPassword} onChange={update('confirmPassword')} placeholder="Repeat your password" /></label>
        <div className="grid grid-cols-2 gap-2">{passwordChecks.map((check) => <p key={check.label} className={`flex items-center gap-1.5 text-[10px] ${check.valid ? 'text-emerald-300' : 'text-zinc-600'}`}><Check size={12} />{check.label}</p>)}</div>
        {error && <div className="rounded border border-red-400/20 bg-red-400/10 px-3 py-2.5 text-sm text-red-200" role="alert">{error}</div>}
        <button className="primary-button w-full" disabled={loading || !passwordChecks.every((check) => check.valid)}>{loading ? 'Creating account…' : 'Create account'}{!loading && <ArrowRight size={17} />}</button>
      </form>
      <p className="mt-5 text-center text-xs text-zinc-500">Already have an account? <Link to="/login" className="font-medium text-violet-300 hover:text-violet-200">Sign in</Link></p>
      <div className="mt-5 flex items-center gap-2 text-xs text-zinc-600"><LockKeyhole size={13} /> New accounts have no team access until onboarding is complete</div>
    </PublicAuthShell>
  );
}
