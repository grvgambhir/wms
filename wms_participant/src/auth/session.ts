import type { AuthSession } from '@/domain/models/auth';

import { getCognitoAuthClient } from './cognitoClient';
import { isDemoAuthEnabled } from './env';
import { decodeJwtPayload } from './jwt';
import { type MeProfile } from './me';

export { ensureBackendPerson } from './me';
export type { MeProfile } from './me';
export const AUTH_SESSION_QUERY_KEY = ['auth', 'session'] as const;

/** Demo session is checked first only while the POC flag is on. */
export async function readSession(
  demoEnabled = isDemoAuthEnabled(),
  getDemoSession: () => Promise<AuthSession | null> = loadDemoSession,
): Promise<AuthSession | null> {
  if (demoEnabled) {
    const demo = await getDemoSession();
    if (demo) return demo;
  }
  return cognitoGetSession();
}

async function loadDemoSession(): Promise<AuthSession | null> {
  const { repositories } = await import('@/data/providers/repositories');
  return repositories.auth.getSession();
}

export async function cognitoGetSession(): Promise<AuthSession | null> {
  const client = getCognitoAuthClient();
  if (!client) return null;
  const token = await client.fetchAccessToken(false);
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  const sub = typeof payload?.sub === 'string' ? payload.sub : 'cognito';
  // This pool's username is an opaque sub, not the email — prefer the real email attribute
  // for anything shown to the person, and only fall back to the sub-as-username when it's
  // unavailable (offline, or a client that doesn't implement currentEmail).
  const email = (await client.currentEmail?.().catch(() => null)) ?? null;
  const username = email ?? (await client.currentUsername());
  return {
    athleteId: sub,
    identifier: username ?? sub,
    verifiedAt: new Date().toISOString(),
  };
}

export function signedInDisplayName(
  me: Pick<MeProfile, 'givenName' | 'familyName' | 'email'> | null | undefined,
  session: AuthSession | null | undefined,
  fallback: string,
): string {
  const name = [me?.givenName?.trim(), me?.familyName?.trim()].filter(Boolean).join(' ');
  if (name) return name;
  if (me?.email?.trim()) return me.email.trim();
  if (session?.identifier?.trim()) return session.identifier.trim();
  return fallback;
}

export async function cognitoSignOut(): Promise<void> {
  const client = getCognitoAuthClient();
  if (!client) return;
  try {
    await client.signOut();
  } catch {
    // Local cache is cleared by the caller even when Cognito revoke fails.
  }
}

export function isDemoSession(session: AuthSession): boolean {
  return session.athleteId.startsWith('athlete_');
}

export function landingHref(
  session: AuthSession | null,
  me?: Pick<MeProfile, 'profileStatus'> | null,
): '/(auth)/login' | '/registration-status' | '/(auth)/complete-profile' {
  if (!session) return '/(auth)/login';
  if (isDemoSession(session)) return '/registration-status';
  if (me?.profileStatus === 'complete') return '/registration-status';
  return '/(auth)/complete-profile';
}

export function authGateState(
  session: AuthSession | null | undefined,
  isLoading: boolean,
): 'loading' | 'login' | 'pass' {
  if (isLoading) return 'loading';
  if (!session) return 'login';
  return 'pass';
}
