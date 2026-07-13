import { useState } from 'react';
import { ArrowLeft, ArrowRight, KeyRound, LoaderCircle } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import PublicAuthShell from '../components/auth/PublicAuthShell';
import { useAuth } from '../context/AuthContext';
import { getApiError } from '../services/api';
import { authService } from '../services/authService';

export default function ForgotPasswordPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true); setError('');
    try {
      const response = await authService.forgotPassword(email.trim());
      if (response.resetToken) navigate(`/reset-password?token=${encodeURIComponent(response.resetToken)}`);
      else setSent(true);
    } catch (requestError) { setError(getApiError(requestError, 'A recovery request could not be created.')); }
    finally { setLoading(false); }
  };

  return <PublicAuthShell><p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-aether-primary">Account recovery</p><h1 className="font-display text-4xl font-bold tracking-[-0.025em] text-zinc-50">Reset your password.</h1><p className="mt-3 text-sm leading-6 text-zinc-400">Enter the email address associated with your workspace account.</p>{sent ? <div className="mt-8 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] p-5"><KeyRound className="text-emerald-300" size={20} /><h2 className="mt-3 font-display text-base font-semibold text-emerald-100">Request received</h2><p className="mt-2 text-sm leading-6 text-emerald-200/60">If an account exists for that address, recovery instructions are available through the configured delivery service.</p></div> : <form className="mt-8 space-y-5" onSubmit={submit}><label className="block"><span className="label">Email address</span><input type="email" className="input mt-2 w-full" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="developer@studio.com" /></label>{error && <div className="rounded border border-red-400/20 bg-red-400/10 px-3 py-2.5 text-sm text-red-200" role="alert">{error}</div>}<button className="primary-button w-full" disabled={loading}>{loading ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowRight size={16} />}{loading ? 'Creating request…' : 'Continue'}</button></form>}<Link to="/login" className="secondary-button mt-7 w-full"><ArrowLeft size={16} /> Return to sign in</Link></PublicAuthShell>;
}
