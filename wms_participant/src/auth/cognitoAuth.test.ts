import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { resetAccessTokenProvider, setAccessTokenProvider } from '@/auth/accessToken';
import type { CognitoAuthClient } from '@/auth/cognitoClient';
import { getCognitoAuthClient, setCognitoAuthClient } from '@/auth/cognitoClient';
import { assertAccessToken, encodeUnsignedJwt, isExpiredJwt } from '@/auth/jwt';
import { MemoryKeyValueStorage } from '@/auth/memoryStorage';
import { authGateState, cognitoGetSession, cognitoSignOut, landingHref, readSession, signedInDisplayName } from '@/auth/session';
import { backendRequest } from '@/data/api/wmsBackend';
import { it as itCopy } from '@/i18n/it';
import { copy } from '@/constants/copy';
import { completeMfa, disableMfa } from '@/auth/me';

afterEach(() => {
  resetAccessTokenProvider();
  setCognitoAuthClient(null);
  jest.restoreAllMocks();
});

function accessJwt(sub = 'user-1'): string {
  return encodeUnsignedJwt({
    token_use: 'access',
    sub,
    exp: Math.floor(Date.now() / 1000) + 900,
    username: 'ada@example.com',
  });
}

function idJwt(): string {
  return encodeUnsignedJwt({
    token_use: 'id',
    email: 'ada@example.com',
    exp: Math.floor(Date.now() / 1000) + 900,
  });
}

function fakeClient(accessToken: string): CognitoAuthClient {
  let current: string | null = null;
  return {
    configure() {},
    async signUp() {},
    async confirmSignUp() {},
    async resendSignUpCode() {},
    async signIn() {
      current = accessToken;
      return 'done';
    },
    async signOut() {
      current = null;
    },
    async fetchAccessToken() {
      return current;
    },
    async currentUsername() {
      return current ? 'ada@example.com' : null;
    },
    async resetPassword() {},
    async confirmResetPassword() {},
  };
}

describe('Cognito tokens', () => {
  it('sign-up → confirm → sign-in yields an access token with token_use=access', async () => {
    const token = accessJwt();
    const client = fakeClient(token);
    setCognitoAuthClient(client);
    await client.signUp({
      email: 'ada@example.com',
      password: 'Password1',
      givenName: 'Ada',
      familyName: 'Lovelace',
    });
    await client.confirmSignUp('ada@example.com', '123456');
    await client.signIn('ada@example.com', 'Password1');
    const issued = await client.fetchAccessToken();
    expect(issued).toBe(token);
    expect(assertAccessToken(issued ?? '')).toBe(token);
    await expect(async () => assertAccessToken(idJwt())).rejects.toThrow('auth.token.not_access');
  });

  it('refuses an expired JWT', () => {
    const expired = encodeUnsignedJwt({ token_use: 'access', exp: 1 });
    expect(isExpiredJwt(expired, 10)).toBe(true);
  });
});

describe('silent refresh', () => {
  it('retries a 401 exactly once after a single refresh', async () => {
    const first = accessJwt('a');
    const second = accessJwt('b');
    let refreshCalls = 0;
    let issued = first;
    setAccessTokenProvider({
      getAccessToken: async () => issued,
      refreshAccessToken: async () => {
        refreshCalls += 1;
        issued = second;
        return second;
      },
    });

    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const header = new Headers(init?.headers).get('authorization');
      if (header === `Bearer ${first}`) {
        return new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401 });
      }
      if (header === `Bearer ${second}`) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('unexpected', { status: 500 });
    });

    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(backendRequest<{ ok: boolean }>('/v1/probe')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshCalls).toBe(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain(first);
    expect(JSON.stringify(log.mock.calls)).not.toContain(second);
    expect(JSON.stringify(error.mock.calls)).not.toContain(first);

    log.mockRestore();
    error.mockRestore();
  });
});

describe('auth routing', () => {
  it('sends a signed-out user to sign-in', () => {
    expect(authGateState(null, false)).toBe('login');
    expect(landingHref(null)).toBe('/(auth)/login');
  });

  it('sends a Cognito session to complete-profile until the profile is complete', async () => {
    const token = accessJwt();
    const client = fakeClient(token);
    setCognitoAuthClient(client);
    await client.signIn('ada@example.com', 'x');
    const session = await cognitoGetSession();
    expect(landingHref(session)).toBe('/(auth)/complete-profile');
    expect(landingHref(session, { profileStatus: 'placeholder' })).toBe('/(auth)/complete-profile');
    expect(landingHref(session, { profileStatus: 'complete' })).toBe('/registration-status');
    expect(getCognitoAuthClient()).not.toBeNull();
  });

  it('does not throw when Cognito sign-out fails so the app can still leave the session', async () => {
    setCognitoAuthClient({
      ...fakeClient(accessJwt()),
      async signOut() {
        throw new Error('UserUnAuthenticatedException');
      },
    });
    await expect(cognitoSignOut()).resolves.toBeUndefined();
  });

  it('keeps the demo session on the existing dashboard', () => {
    expect(
      landingHref({
        athleteId: 'athlete_daniel_harper',
        identifier: 'daniel.harper@email.com',
        verifiedAt: new Date().toISOString(),
      }),
    ).toBe('/registration-status');
  });
});

describe('readSession vs demo flag', () => {
  const demoSession = {
    athleteId: 'athlete_daniel_harper',
    identifier: 'daniel.harper@email.com',
    verifiedAt: '2020-01-01T00:00:00.000Z',
  };

  it('ignores a stored demo session when the demo flag is off and returns Cognito', async () => {
    const getDemo = jest.fn(async () => demoSession);
    const token = accessJwt('cognito-sub');
    const client = fakeClient(token);
    setCognitoAuthClient(client);
    await client.signIn('ada@example.com', 'x');

    const session = await readSession(false, getDemo);

    expect(getDemo).not.toHaveBeenCalled();
    expect(session?.athleteId).toBe('cognito-sub');
    expect(session?.identifier).toBe('ada@example.com');
  });

  it('still prefers a stored demo session when the demo flag is on', async () => {
    const getDemo = jest.fn(async () => demoSession);
    const token = accessJwt('cognito-sub');
    const client = fakeClient(token);
    setCognitoAuthClient(client);
    await client.signIn('ada@example.com', 'x');

    const session = await readSession(true, getDemo);

    expect(getDemo).toHaveBeenCalled();
    expect(session).toEqual(demoSession);
  });
});

describe('signed-in display name', () => {
  it('uses /v1/me given and family name, never a hardcoded Harper fallback', () => {
    expect(
      signedInDisplayName(
        { givenName: 'Ada', familyName: 'Lovelace', email: 'ada@example.com' },
        { athleteId: 'cognito-sub', identifier: 'ada@example.com', verifiedAt: '2020-01-01T00:00:00.000Z' },
        'Athlete',
      ),
    ).toBe('Ada Lovelace');
    expect(signedInDisplayName(null, null, 'Athlete')).toBe('Athlete');
  });
});

describe('token storage', () => {
  it('does not expose tokens through keys() and can hide values from tests that only read keys', async () => {
    const store = new MemoryKeyValueStorage();
    const token = accessJwt();
    await store.setItem('accessToken', token);
    expect(store.keys()).toEqual(['accessToken']);
    expect(store.keys().join(' ')).not.toContain(token);
  });
});

describe('participant MFA endpoints', () => {
  it('enrols and un-enrols through /v1/me/mfa without taking an athlete id', async () => {
    const token = accessJwt();
    setAccessTokenProvider({
      getAccessToken: async () => token,
      refreshAccessToken: async () => token,
    });
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const path = String(url);
      if (path.endsWith('/v1/me/mfa/complete')) {
        return new Response(
          JSON.stringify({ id: '1', mfa: { enrolled: true, enforcementActive: false, enrolledOcAdminCount: 1 } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (path.endsWith('/v1/me/mfa/disable')) {
        return new Response(
          JSON.stringify({ id: '1', mfa: { enrolled: false, enforcementActive: false, enrolledOcAdminCount: 1 } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('unexpected', { status: 500 });
    });

    await expect(completeMfa()).resolves.toMatchObject({ mfa: { enrolled: true } });
    await expect(disableMfa()).resolves.toMatchObject({ mfa: { enrolled: false } });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://localhost:3050/v1/me/mfa/complete');
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe('http://localhost:3050/v1/me/mfa/disable');
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toMatch(/athlete/i);
  });
});

describe('copy EN/IT', () => {
  const keys = [
    'cognitoConfirmTitle',
    'cognitoForgotTitle',
    'cognitoCompleteTitle',
    'cognitoTotpTitle',
    'p06MfaSection',
    'p06MfaEnrol',
    'p06MfaUnenrol',
    'completeProfileDobFuture',
    'completeProfileDobUnder18',
    'completeProfileDobNeedsReview',
    'loginWelcome',
    'loginDemoEntry',
    'authCheckingSession',
    'accountMenuA11y',
  ] as const;

  it('has English and Italian strings for every new auth screen', () => {
    for (const key of keys) {
      expect(copy[key].length).toBeGreaterThan(0);
      expect(itCopy[key]?.length).toBeGreaterThan(0);
      expect(itCopy[key]).not.toBe(copy[key]);
    }
  });
});
