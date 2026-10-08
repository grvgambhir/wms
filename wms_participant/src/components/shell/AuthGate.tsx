import { Redirect, Slot } from 'expo-router';
import type { ReactNode } from 'react';

import { isUnauthorized } from '@/auth/me';
import { authGateState, isDemoSession } from '@/auth/session';
import { AppScreen } from '@/components/shell/AppScreen';
import { LoadingState } from '@/components/shell/LoadingState';
import { useAuthSession, useMeProfile } from '@/features/auth/hooks/useAuth';
import { useCopy } from '@/i18n';

type AuthGateProps = {
  children?: ReactNode;
};

/** Redirects unauthenticated users to login — used in protected route group layouts.
 *  Cognito users with a placeholder profile are sent back to complete-profile so they
 *  cannot enter a journey the database will refuse. Demo login bypasses that gate. */
export function AuthGate({ children }: AuthGateProps) {
  const copy = useCopy();
  const { data: session, isLoading } = useAuthSession();
  const demo = !!session && isDemoSession(session);
  const me = useMeProfile(!!session && !demo);
  const state = authGateState(session, isLoading);

  if (state === 'loading' || (state === 'pass' && !demo && me.isLoading)) {
    return (
      <AppScreen plain>
        <LoadingState message={copy.authCheckingSession} />
      </AppScreen>
    );
  }

  if (state === 'login' || isUnauthorized(me.error)) {
    return <Redirect href="/(auth)/login" />;
  }

  if (state === 'pass' && !demo && me.data?.profileStatus !== 'complete') {
    return <Redirect href="/(auth)/complete-profile" />;
  }

  return children ? <>{children}</> : <Slot />;
}
