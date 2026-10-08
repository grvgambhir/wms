import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from './AuthProvider';
import { authFieldClassName, authPrimaryButtonClassName, PasswordField } from './PasswordField';

export function ForgotPasswordPage() {
  const { forgotPassword, confirmReset } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSend(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await forgotPassword(email.trim());
      setStep('code');
    } catch {
      setError('Could not send a reset code.');
    } finally {
      setPending(false);
    }
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await confirmReset(email.trim(), code, password);
      navigate('/sign-in', { replace: true });
    } catch {
      setError('Could not reset the password. Check the code and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <form
        onSubmit={step === 'email' ? onSend : onSave}
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">OC Command Centre</p>
        <h1 className="mt-2 text-2xl font-bold text-text">Reset password</h1>
        <p className="mt-1 text-sm text-text-muted">
          {step === 'email'
            ? 'Enter the email on your administrator account.'
            : 'Enter the 6-digit code we emailed, then choose a new password.'}
        </p>
        {step === 'email' ? (
          <>
            <label className="mt-6 block text-sm font-medium text-text">
              Email
              <input
                className={`mt-1 ${authFieldClassName}`}
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={pending} className={authPrimaryButtonClassName}>
              {pending ? 'Sending…' : 'Send reset code'}
            </button>
          </>
        ) : (
          <>
            <label className="mt-6 block text-sm font-medium text-text">
              6-digit code
              <input
                className={`mt-1 ${authFieldClassName}`}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
            </label>
            <PasswordField
              className="mt-4"
              label="New password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button type="submit" disabled={pending} className={authPrimaryButtonClassName}>
              {pending ? 'Saving…' : 'Save new password'}
            </button>
          </>
        )}
        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <p className="mt-4 text-center text-sm">
          <Link className="font-semibold text-primary" to="/sign-in">
            Back to sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
