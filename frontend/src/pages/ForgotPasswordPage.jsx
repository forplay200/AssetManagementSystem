import { Link } from 'react-router-dom';
import PublicAuthShell from '../components/auth/PublicAuthShell';
export default function ForgotPasswordPage() {
  return <PublicAuthShell><h1 className="font-display text-4xl font-bold text-zinc-50">Password recovery</h1><p className="mt-5 text-sm text-zinc-400">Email password recovery is not available during this trial. No password reset link will be shown here. If you cannot sign in, you may create a new trial account; it will not have access to your previous workspace.</p><Link className="secondary-button mt-6" to="/login">Return to sign in</Link></PublicAuthShell>;
}
