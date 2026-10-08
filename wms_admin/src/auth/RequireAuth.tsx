import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { AdminPortalShell } from '../components/layout/AdminPortalShell';
import { sessionMayUseAdmin, useAuth } from './AuthProvider';

export function RequireAuth({
  children,
  roles,
}: {
  children: ReactNode;
  /** When set, the signed-in OC user must hold at least one of these role codes. */
  roles?: readonly string[];
}) {
  const { session, ready } = useAuth();
  const location = useLocation();

  if (!ready) return null;
  if (!session) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }
  if (!sessionMayUseAdmin(session)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
          <h1 className="text-xl font-bold text-text">No OC role</h1>
          <p className="mt-2 text-sm text-text-muted">
            This account is signed in, but the API has not granted an OC role. An existing
            administrator must grant one.
          </p>
        </div>
      </main>
    );
  }
  const mfa = session.me?.mfa;
  if (mfa?.enforcementActive && !mfa.enrolled && location.pathname !== '/enrol-mfa') {
    return <Navigate to="/enrol-mfa" replace />;
  }
  if (roles && !roles.some((role) => session.me?.roles.includes(role))) {
    return (
      <AdminPortalShell
        userName={session.me?.givenName ?? session.username}
        role={session.me?.roles.join(', ') || 'OC'}
      >
        <div
          role="alert"
          className="mx-auto mt-16 max-w-lg rounded-xl border border-border bg-surface p-8 text-center shadow-panel"
        >
          <h1 className="text-xl font-extrabold text-text">This page is for administrators</h1>
          <p className="mt-2 text-sm text-text-muted">
            Your account can use the rest of the Command Centre, but it cannot grant or revoke
            administrator rights. Ask an existing oc_admin if you need access.
          </p>
        </div>
      </AdminPortalShell>
    );
  }
  return children;
}

/** Named alias so the people route is obvious: same gate, required role is oc_admin. */
export function RequireOcAdmin({ children }: { children: ReactNode }) {
  return <RequireAuth roles={['oc_admin']}>{children}</RequireAuth>;
}
