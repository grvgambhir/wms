import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { setAccessTokenProvider } from './accessToken';
import { createAmplifyCognitoClient } from './amplifyClient';
import { backendRequest } from './backendRequest';
import { getCognitoAuthClient, setCognitoAuthClient, type CognitoAuthClient } from './cognitoClient';
import { cognitoConfig } from './env';
import { fetchMe, hasOcAdminRole, hasOcRole, type MeProfile } from './me';

export type AdminSession = {
  username: string;
  me: MeProfile | null;
};

type AuthContextValue = {
  session: AdminSession | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<'done' | 'new_password_required' | 'totp_required'>;
  confirmNewPassword: (newPassword: string) => Promise<'done' | 'totp_required'>;
  confirmTotpCode: (code: string) => Promise<void>;
  startTotpSetup: (email: string) => Promise<{ secret: string; uri: string }>;
  verifyAndEnableTotp: (code: string) => Promise<void>;
  completeMfaEnrolment: () => Promise<void>;
  signOut: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  confirmReset: (email: string, code: string, newPassword: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function boot(): void {
  if (import.meta.env.MODE === 'test') return;
  if (!cognitoConfig()) return;
  if (getCognitoAuthClient()) return;
  const client = createAmplifyCognitoClient();
  client.configure();
  setCognitoAuthClient(client);
  setAccessTokenProvider({
    getAccessToken: () => client.fetchAccessToken(false),
    refreshAccessToken: () => client.fetchAccessToken(true),
  });
}

boot();

/** Rebuild the in-app session from persisted Cognito tokens (e.g. after refresh). */
export async function restoreAdminSession(
  client: CognitoAuthClient,
): Promise<AdminSession | null> {
  const username = await client.currentUsername();
  if (!username) return null;
  const token = await client.fetchAccessToken(false);
  if (!token) return null;
  const me = await fetchMe();
  return { username, me };
}

export function AuthProvider({
  children,
  initialSession = null,
}: {
  children: ReactNode;
  /** Test seam — when set, skips Cognito restore and starts ready immediately. */
  initialSession?: AdminSession | null;
}) {
  const seeded = initialSession != null;
  // Vitest injects Cognito mocks that often look "already signed in"; skip restore there.
  const skipRestore = seeded || import.meta.env.MODE === 'test';
  const [session, setSession] = useState<AdminSession | null>(initialSession);
  const [ready, setReady] = useState(skipRestore);

  useEffect(() => {
    if (skipRestore) return;
    let cancelled = false;
    void (async () => {
      try {
        const client = getCognitoAuthClient();
        if (client) {
          const restored = await restoreAdminSession(client);
          if (!cancelled && restored) setSession(restored);
        }
      } catch {
        // Stay signed out if tokens are missing or /me fails.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [skipRestore]);

  const signIn = useCallback(async (email: string, password: string) => {
    const client = getCognitoAuthClient();
    if (!client) throw new Error('auth.cognito.unconfigured');
    const next = await client.signIn(email, password);
    if (next === 'new_password_required' || next === 'totp_required') return next;
    const username = (await client.currentUsername()) ?? email;
    const me = await fetchMe();
    setSession({ username, me });
    return 'done' as const;
  }, []);

  const confirmNewPassword = useCallback(async (newPassword: string) => {
    const client = getCognitoAuthClient();
    if (!client) throw new Error('auth.cognito.unconfigured');
    const next = await client.confirmNewPassword(newPassword);
    if (next === 'totp_required') return 'totp_required' as const;
    const username = (await client.currentUsername()) ?? '';
    const me = await fetchMe();
    setSession({ username, me });
    return 'done' as const;
  }, []);

  const confirmTotpCode = useCallback(async (code: string) => {
    const client = getCognitoAuthClient();
    if (!client?.confirmTotpCode) throw new Error('auth.cognito.unconfigured');
    await client.confirmTotpCode(code);
    const username = (await client.currentUsername()) ?? '';
    const me = await fetchMe();
    setSession({ username, me });
  }, []);

  const startTotpSetup = useCallback(async (email: string) => {
    const client = getCognitoAuthClient();
    if (!client?.startTotpSetup) throw new Error('auth.cognito.unconfigured');
    return client.startTotpSetup(email);
  }, []);

  const verifyAndEnableTotp = useCallback(async (code: string) => {
    const client = getCognitoAuthClient();
    if (!client?.verifyAndEnableTotp) throw new Error('auth.cognito.unconfigured');
    await client.verifyAndEnableTotp(code);
  }, []);

  const completeMfaEnrolment = useCallback(async () => {
    await backendRequest('/v1/me/mfa/complete', { method: 'POST' });
    const client = getCognitoAuthClient();
    try {
      if (client) await client.signOut();
    } finally {
      setSession(null);
    }
  }, []);

  const signOut = useCallback(async () => {
    const client = getCognitoAuthClient();
    try {
      if (client) await client.signOut();
    } finally {
      setSession(null);
    }
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    const client = getCognitoAuthClient();
    if (!client) throw new Error('auth.cognito.unconfigured');
    await client.resetPassword(email);
  }, []);

  const confirmReset = useCallback(async (email: string, code: string, newPassword: string) => {
    const client = getCognitoAuthClient();
    if (!client) throw new Error('auth.cognito.unconfigured');
    await client.confirmResetPassword(email, code, newPassword);
  }, []);

  const value = useMemo(
    () => ({
      session,
      ready,
      signIn,
      confirmNewPassword,
      confirmTotpCode,
      startTotpSetup,
      verifyAndEnableTotp,
      completeMfaEnrolment,
      signOut,
      forgotPassword,
      confirmReset,
    }),
    [
      session,
      ready,
      signIn,
      confirmNewPassword,
      confirmTotpCode,
      startTotpSetup,
      verifyAndEnableTotp,
      completeMfaEnrolment,
      signOut,
      forgotPassword,
      confirmReset,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

/** Null outside AuthProvider — the shell uses this so existing page tests need no wrapper. */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}

export function sessionMayUseAdmin(session: AdminSession | null): boolean {
  return hasOcRole(session?.me?.roles);
}

export function sessionIsOcAdmin(session: AdminSession | null): boolean {
  return hasOcAdminRole(session?.me?.roles);
}
