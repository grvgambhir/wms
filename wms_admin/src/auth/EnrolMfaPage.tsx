import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { useAuth } from './AuthProvider';
import { authFieldClassName, authPrimaryButtonClassName } from './PasswordField';

export function EnrolMfaPage() {
  const { session, startTotpSetup, verifyAndEnableTotp, completeMfaEnrolment, signOut } = useAuth();
  const navigate = useNavigate();
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const email = session?.me?.email ?? session?.username ?? '';
  const enforcement = session?.me?.mfa?.enforcementActive === true;

  useEffect(() => {
    if (!session || secret) return;
    void startTotpSetup(email)
      .then((setup) => {
        setSecret(setup.secret);
        setUri(setup.uri);
      })
      .catch(() => setError('Could not start authenticator setup. Try signing in again.'));
  }, [email, secret, session, startTotpSetup]);

  if (!session) {
    return <Navigate to="/sign-in" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!code.trim()) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      await verifyAndEnableTotp(code.trim());
      await completeMfaEnrolment();
      navigate('/sign-in', { replace: true, state: { mfaEnrolled: true } });
    } catch {
      setError('That code was not accepted. Wait for a new one and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-panel"
      >
        <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">OC Command Centre</p>
        <h1 className="mt-2 text-2xl font-bold text-text">Set up authenticator MFA</h1>
        <p className="mt-1 text-sm text-text-muted">
          Scan the QR code or type the secret into an authenticator app, then enter a code to
          confirm. After that you will sign in again with the code.
        </p>
        {uri ? (
          <img
            alt="Authenticator QR code"
            className="mx-auto mt-6 h-44 w-44 rounded-lg border border-border bg-white p-2"
            src={`https://api.qrserver.com/v1/create-qr-code/?size=176x176&data=${encodeURIComponent(uri)}`}
          />
        ) : null}
        {secret ? (
          <p className="mt-4 break-all rounded-lg bg-surface-muted px-3 py-2 font-mono text-sm text-text">
            {secret}
          </p>
        ) : (
          <p className="mt-4 text-sm text-text-muted">Preparing setup…</p>
        )}
        <label className="mt-6 block text-sm font-medium text-text">
          Authenticator code
          <input
            className={`mt-1 ${authFieldClassName}`}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
          />
        </label>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={pending || !secret} className={authPrimaryButtonClassName}>
          {pending ? 'Verifying…' : 'Verify and continue'}
        </button>
        {!enforcement ? (
          <button
            type="button"
            className="mt-3 w-full text-center text-sm font-semibold text-primary"
            onClick={() => navigate('/operations')}
          >
            Continue without MFA for now
          </button>
        ) : null}
        <button
          type="button"
          className="mt-2 w-full text-center text-sm text-text-muted"
          onClick={() => void signOut().then(() => navigate('/sign-in'))}
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
