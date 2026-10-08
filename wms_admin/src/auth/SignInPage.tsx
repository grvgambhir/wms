import { FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from './AuthProvider';
import { authFieldClassName, authPrimaryButtonClassName, PasswordField } from './PasswordField';

function field(form: HTMLFormElement, name: string): string {
  return String(new FormData(form).get(name) ?? '').trim();
}

function signInFailedMessage(err: unknown): string {
  const name = err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
  if (name === 'UserAlreadyAuthenticatedException') {
    return 'A previous session is still open. Click Sign in again.';
  }
  if (name === 'auth.cognito.unconfigured') {
    return 'Cognito is not configured in this build.';
  }
  return 'Could not sign in. Check your email and password.';
}

export function SignInPage() {
  const { session, signIn, confirmNewPassword, confirmTotpCode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string; mfaEnrolled?: boolean } | null)?.from ?? '/operations';
  const justEnrolled = (location.state as { mfaEnrolled?: boolean } | null)?.mfaEnrolled === true;
  const [newPassword, setNewPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [step, setStep] = useState<'sign-in' | 'new-password' | 'totp'>('sign-in');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (session) {
    const mfa = session.me?.mfa;
    if (mfa && !mfa.enrolled && mfa.enforcementActive) {
      return <Navigate to="/enrol-mfa" replace />;
    }
    return <Navigate to={from} replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = field(form, 'email');
    const password = String(new FormData(form).get('password') ?? '');
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      const next = await signIn(email, password);
      if (next === 'new_password_required') {
        setStep('new-password');
        return;
      }
      if (next === 'totp_required') {
        setStep('totp');
        return;
      }
      navigate(from, { replace: true });
    } catch (err) {
      console.warn('admin.signIn.failed', err instanceof Error ? err.name : err);
      setError(signInFailedMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function onNewPassword(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const next = await confirmNewPassword(newPassword);
      if (next === 'totp_required') {
        setStep('totp');
        return;
      }
      navigate('/enrol-mfa', { replace: true });
    } catch {
      setError('Could not set the new password. Try a stronger one.');
    } finally {
      setPending(false);
    }
  }

  async function onTotp(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await confirmTotpCode(totpCode.trim());
      navigate(from, { replace: true });
    } catch {
      setError('That code was not accepted. Wait for a new one and try again.');
    } finally {
      setPending(false);
    }
  }

  if (step === 'totp') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <form
          onSubmit={onTotp}
          className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-panel">
          <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">OC Command Centre</p>
          <h1 className="mt-2 text-2xl font-bold text-text">Authenticator code</h1>
          <p className="mt-1 text-sm text-text-muted">
            Enter the 6-digit code from your authenticator app to finish signing in.
          </p>
          <label className="mt-6 block text-sm font-medium text-text">
            Code
            <input
              className={`mt-1 ${authFieldClassName}`}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={totpCode}
              onChange={(event) => setTotpCode(event.target.value)}
              required
            />
          </label>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={pending} className={authPrimaryButtonClassName}>
            {pending ? 'Verifying…' : 'Verify and continue'}
          </button>
        </form>
      </main>
    );
  }

  if (step === 'new-password') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <form
          onSubmit={onNewPassword}
          className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-panel">
          <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">OC Command Centre</p>
          <h1 className="mt-2 text-2xl font-bold text-text">Set your new password</h1>
          <p className="mt-1 text-sm text-text-muted">
            Your invitation used a temporary password. Choose one you will use from now on.
          </p>
          <PasswordField
            className="mt-6"
            label="New password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            minLength={8}
          />
          {error ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={pending} className={authPrimaryButtonClassName}>
            {pending ? 'Saving…' : 'Save password and continue'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <form
        noValidate
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">OC Command Centre</p>
        <h1 className="mt-2 text-2xl font-bold text-text">Sign in</h1>
        <p className="mt-1 text-sm text-text-muted">Administrators are created in Cognito. There is no self sign-up.</p>
        {justEnrolled ? (
          <p role="status" className="mt-3 rounded-lg bg-success/10 px-3 py-2 text-sm text-text">
            Authenticator MFA is on. Sign in with your password and a new code.
          </p>
        ) : null}
        <label className="mt-6 block text-sm font-medium text-text">
          Email
          <input
            className={`mt-1 ${authFieldClassName}`}
            name="email"
            type="text"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            defaultValue=""
          />
        </label>
        <PasswordField
          className="mt-4"
          label="Password"
          name="password"
          autoComplete="current-password"
          defaultValue=""
        />
        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={pending} className={authPrimaryButtonClassName}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="mt-4 text-center text-sm">
          <Link className="font-semibold text-primary" to="/forgot-password">
            Forgot password?
          </Link>
        </p>
      </form>
    </main>
  );
}
