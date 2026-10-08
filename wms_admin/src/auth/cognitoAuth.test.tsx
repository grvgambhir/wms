import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { defaultStorage } from 'aws-amplify/utils';

import { resetAccessTokenProvider, setAccessTokenProvider } from './accessToken';
import { backendRequest } from './backendRequest';
import { encodeUnsignedJwt, assertAccessToken } from './jwt';
import { hasOcRole } from './me';
import { AuthProvider, restoreAdminSession, sessionMayUseAdmin, type AdminSession } from './AuthProvider';
import { RequireAuth } from './RequireAuth';
import { setCognitoAuthClient, type CognitoAuthClient } from './cognitoClient';
import { SignInPage } from './SignInPage';
import { AdminPortalShell } from '../components/layout/AdminPortalShell';

afterEach(() => {
  cleanup();
  resetAccessTokenProvider();
  setCognitoAuthClient(null);
  vi.restoreAllMocks();
  localStorage.clear();
});

function accessJwt(): string {
  return encodeUnsignedJwt({
    token_use: 'access',
    sub: 'admin-1',
    exp: Math.floor(Date.now() / 1000) + 900,
  });
}

describe('admin Cognito tokens', () => {
  it('sign-in produces an access token with token_use=access', async () => {
    const token = accessJwt();
    let current: string | null = null;
    const client: CognitoAuthClient = {
      configure() {},
      async signIn() {
        current = token;
        return 'done';
      },
      async confirmNewPassword() {
        return 'done';
      },
      async signOut() {
        current = null;
      },
      async fetchAccessToken() {
        return current;
      },
      async currentUsername() {
        return current ? 'olga@example.com' : null;
      },
      async resetPassword() {},
      async confirmResetPassword() {},
    };
    setCognitoAuthClient(client);
    await client.signIn('olga@example.com', 'Password1');
    const issued = await client.fetchAccessToken();
    expect(issued).toBe(token);
    expect(assertAccessToken(issued ?? '')).toBe(token);
  });

  it('retries a 401 exactly once after one refresh', async () => {
    const first = accessJwt();
    const second = encodeUnsignedJwt({ token_use: 'access', sub: 'admin-2', exp: 9_999_999_999 });
    let issued = first;
    let refreshCalls = 0;
    setAccessTokenProvider({
      getAccessToken: async () => issued,
      refreshAccessToken: async () => {
        refreshCalls += 1;
        issued = second;
        return second;
      },
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const header = new Headers(init?.headers).get('authorization');
      if (header === `Bearer ${first}`) {
        return new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401 });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await expect(backendRequest<{ ok: boolean }>('/v1/probe')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshCalls).toBe(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain(first);
    expect(JSON.stringify(log.mock.calls)).not.toContain(second);
  });

  it('persists Cognito tokens in localStorage via Amplify defaultStorage', async () => {
    const key = 'CognitoIdentityServiceProvider.test.accessToken';
    const token = accessJwt();
    await defaultStorage.setItem(key, token);
    expect(localStorage.getItem(key)).toBe(token);
    await defaultStorage.removeItem(key);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('restores an admin session from Cognito tokens after refresh', async () => {
    const token = accessJwt();
    setAccessTokenProvider({
      getAccessToken: async () => token,
      refreshAccessToken: async () => token,
    });
    const client: CognitoAuthClient = {
      configure() {},
      async signIn() {
        return 'done';
      },
      async confirmNewPassword() {
        return 'done';
      },
      async signOut() {},
      async fetchAccessToken() {
        return token;
      },
      async currentUsername() {
        return 'olga@example.com';
      },
      async resetPassword() {},
      async confirmResetPassword() {},
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: '1',
          givenName: 'Olga',
          roles: ['oc_admin'],
          mfa: { enrolled: true, enforcementActive: false, enrolledOcAdminCount: 2 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(restoreAdminSession(client)).resolves.toEqual({
      username: 'olga@example.com',
      me: {
        id: '1',
        givenName: 'Olga',
        roles: ['oc_admin'],
        mfa: { enrolled: true, enforcementActive: false, enrolledOcAdminCount: 2 },
      },
    });
  });

  it('does not restore a session when Cognito has no current user', async () => {
    const client: CognitoAuthClient = {
      configure() {},
      async signIn() {
        return 'done';
      },
      async confirmNewPassword() {
        return 'done';
      },
      async signOut() {},
      async fetchAccessToken() {
        return accessJwt();
      },
      async currentUsername() {
        return null;
      },
      async resetPassword() {},
      async confirmResetPassword() {},
    };
    await expect(restoreAdminSession(client)).resolves.toBeNull();
  });
});

describe('admin route gate', () => {
  it('sends a signed-out user to sign-in', () => {
    render(
      <MemoryRouter initialEntries={['/operations']}>
        <AuthProvider>
          <Routes>
            <Route path="/sign-in" element={<p>sign-in-page</p>} />
            <Route
              path="/operations"
              element={
                <RequireAuth>
                  <p>secret</p>
                </RequireAuth>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('sign-in-page')).toBeInTheDocument();
    expect(screen.queryByText('secret')).toBeNull();
  });

  it('does not trust an empty roles list as OC access', () => {
    const session: AdminSession = { username: 'x', me: { id: '1', roles: ['participant'] } };
    expect(sessionMayUseAdmin(session)).toBe(false);
    expect(hasOcRole(['oc_admin'])).toBe(true);
  });
});

describe('invited user new-password challenge', () => {
  it('renders the new-password screen when sign-in returns that challenge', async () => {
    const user = userEvent.setup();
    const client: CognitoAuthClient = {
      configure() {},
      async signIn() {
        return 'new_password_required';
      },
      async confirmNewPassword() {
        return 'done';
      },
      async signOut() {},
      async fetchAccessToken() {
        return null;
      },
      async currentUsername() {
        return 'ivy@example.com';
      },
      async resetPassword() {},
      async confirmResetPassword() {},
    };
    setCognitoAuthClient(client);

    render(
      <MemoryRouter initialEntries={['/sign-in']}>
        <AuthProvider>
          <Routes>
            <Route path="/sign-in" element={<SignInPage />} />
            <Route path="/operations" element={<p>command-centre</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('Email'), 'ivy@example.com');
    await user.type(screen.getByLabelText('Password'), 'TempPass1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Set your new password' })).toBeVisible();
    expect(screen.queryByText('command-centre')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show password' })).toBeVisible();
  });

  it('renders the TOTP challenge when sign-in returns that next step', async () => {
    const user = userEvent.setup();
    const client: CognitoAuthClient = {
      configure() {},
      async signIn() {
        return 'totp_required';
      },
      async confirmNewPassword() {
        return 'done';
      },
      async confirmTotpCode() {
        return 'done';
      },
      async signOut() {},
      async fetchAccessToken() {
        return accessJwt();
      },
      async currentUsername() {
        return 'olga@example.com';
      },
      async resetPassword() {},
      async confirmResetPassword() {},
    };
    setCognitoAuthClient(client);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: '1', roles: ['oc_admin'], mfa: { enrolled: true, enforcementActive: false, enrolledOcAdminCount: 1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(
      <MemoryRouter initialEntries={['/sign-in']}>
        <AuthProvider>
          <Routes>
            <Route path="/sign-in" element={<SignInPage />} />
            <Route path="/operations" element={<p>command-centre</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('Email'), 'olga@example.com');
    await user.type(screen.getByLabelText('Password'), 'Password1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Authenticator code' })).toBeVisible();
    expect(screen.queryByText('command-centre')).not.toBeInTheDocument();
  });

  it('sends an OC session to enrolment when MFA is required and not enrolled', () => {
    render(
      <MemoryRouter initialEntries={['/operations']}>
        <AuthProvider
          initialSession={{
            username: 'olga',
            me: {
              id: '1',
              givenName: 'Olga',
              roles: ['oc_admin'],
              mfa: { enrolled: false, enforcementActive: true, enrolledOcAdminCount: 2 },
            },
          }}
        >
          <Routes>
            <Route path="/enrol-mfa" element={<h1>Set up authenticator MFA</h1>} />
            <Route
              path="/operations"
              element={
                <RequireAuth>
                  <p>command-centre</p>
                </RequireAuth>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Set up authenticator MFA' })).toBeVisible();
    expect(screen.queryByText('command-centre')).not.toBeInTheDocument();
  });

  it('lets the operator reveal the sign-in password', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/sign-in']}>
        <AuthProvider>
          <Routes>
            <Route path="/sign-in" element={<SignInPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    const password = screen.getByLabelText('Password') as HTMLInputElement;
    await user.type(password, 'TempPass1');
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(password).toHaveValue('TempPass1');
  });

  it('reads email and password from the DOM when Chrome autofill skipped React state', async () => {
    const user = userEvent.setup();
    const signedIn = vi.fn(async (email: string, password: string) => {
      expect(email).toBe('ada@example.com');
      expect(password).toBe('Password1');
      return 'new_password_required' as const;
    });
    setCognitoAuthClient({
      configure() {},
      signIn: signedIn,
      async confirmNewPassword() {
        return 'done';
      },
      async signOut() {},
      async fetchAccessToken() {
        return null;
      },
      async currentUsername() {
        return null;
      },
      async resetPassword() {},
      async confirmResetPassword() {},
    });

    render(
      <MemoryRouter initialEntries={['/sign-in']}>
        <AuthProvider>
          <Routes>
            <Route path="/sign-in" element={<SignInPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    const email = screen.getByLabelText('Email') as HTMLInputElement;
    const password = screen.getByLabelText('Password') as HTMLInputElement;
    email.value = 'ada@example.com';
    password.value = 'Password1';
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(signedIn).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('heading', { name: 'Set your new password' })).toBeVisible();
  });
});

describe('admin shell logout', () => {
  it('clears the session when Log out is pressed', async () => {
    const user = userEvent.setup();
    const signOut = vi.fn();
    setCognitoAuthClient({
      configure() {},
      async signIn() {
        return 'done';
      },
      async confirmNewPassword() {
        return 'done';
      },
      signOut,
      async fetchAccessToken() {
        return null;
      },
      async currentUsername() {
        return null;
      },
      async resetPassword() {},
      async confirmResetPassword() {},
    });

    render(
      <MemoryRouter>
        <AuthProvider initialSession={{ username: 'olga', me: { id: '1', givenName: 'Olga', roles: ['oc_admin'] } }}>
          <AdminPortalShell userName="Olga" role="OC administrator">
            <p>inside</p>
          </AdminPortalShell>
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /Account menu for Olga/ }));
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toBeVisible();
    await user.click(screen.getByRole('menuitem', { name: 'Log out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menuitem', { name: 'Log out' })).not.toBeInTheDocument();
  });

  it('shows the MFA-not-enforced banner until two administrators enrol', () => {
    render(
      <MemoryRouter>
        <AuthProvider
          initialSession={{
            username: 'olga',
            me: {
              id: '1',
              givenName: 'Olga',
              roles: ['oc_admin'],
              mfa: { enrolled: false, enforcementActive: false, enrolledOcAdminCount: 1 },
            },
          }}
        >
          <AdminPortalShell userName="Olga" role="OC administrator">
            <p>inside</p>
          </AdminPortalShell>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('MFA is not yet enforced');
    expect(screen.getByRole('link', { name: 'Enrol MFA' })).toBeVisible();
  });
});
