import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { getCognitoAuthClient } from '@/auth/cognitoClient';
import { isDemoAuthEnabled } from '@/auth/env';
import { fetchMe } from '@/auth/me';
import {
  AUTH_SESSION_QUERY_KEY,
  cognitoGetSession,
  cognitoSignOut,
  ensureBackendPerson,
  isDemoSession,
  readSession,
  signedInDisplayName,
} from '@/auth/session';
import { repositories } from '@/data/providers/repositories';

export { readSession } from '@/auth/session';

export function applySignedOutCache(queryClient: QueryClient): void {
  void queryClient.cancelQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
  queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, null);
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== 'auth' || query.queryKey[1] !== 'session',
  });
}

export function useAuthSession() {
  return useQuery({
    queryKey: AUTH_SESSION_QUERY_KEY,
    queryFn: () => readSession(),
    staleTime: Infinity,
  });
}

export function useMeProfile(enabled: boolean) {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchMe,
    enabled,
    staleTime: 30_000,
    retry: 1,
  });
}

export function usePortalUserName(override: string | undefined, fallback: string): string {
  const { data: session } = useAuthSession();
  const demo = !!session && isDemoSession(session);
  const me = useMeProfile(!!session && !demo);
  return override ?? signedInDisplayName(me.data, session, fallback);
}

/** The login identifier shown under the name in the account menu — the Cognito username
 * (what was actually signed in with), falling back to the backend profile's email. A seeded
 * demo person can carry a placeholder `core.person.email` that has nothing to do with which
 * real account is signed in, so the session identifier wins whenever it's set. */
export function usePortalUserEmail(): string | undefined {
  const { data: session } = useAuthSession();
  const demo = !!session && isDemoSession(session);
  const me = useMeProfile(!!session && !demo);
  return session?.identifier ?? me.data?.email ?? undefined;
}

export function useSignInWithPassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ identifier, password }: { identifier: string; password: string }) =>
      repositories.auth.signInWithPassword(identifier, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['athlete'] });
    },
  });
}

export function useSignUp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { firstName: string; lastName: string; email: string; password: string }) =>
      repositories.auth.signUp(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['athlete'] });
    },
  });
}

export function useRequestOtp() {
  return useMutation({
    mutationFn: (identifier: string) => repositories.auth.requestOtp(identifier),
  });
}

export function useVerifyOtp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ identifier, code }: { identifier: string; code: string }) =>
      repositories.auth.verifyOtp(identifier, code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['athlete'] });
    },
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async () => {
      if (isDemoAuthEnabled()) {
        await repositories.auth.signOut().catch(() => undefined);
      }
      await cognitoSignOut();
    },
    onSettled: () => {
      applySignedOutCache(queryClient);
      router.replace('/(auth)/login');
    },
  });
}

function requireClient() {
  const client = getCognitoAuthClient();
  if (!client) throw new Error('auth.cognito.unconfigured');
  return client;
}

export function useCognitoSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const next = await requireClient().signIn(email, password);
      if (next === 'totp_required') return { next: 'totp_required' as const };
      const me = await ensureBackendPerson();
      const session = await cognitoGetSession();
      return { next: 'done' as const, session, me };
    },
    onSuccess: (result) => {
      if (result.next !== 'done') return;
      queryClient.setQueryData(['auth', 'me'], result.me);
      queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
    },
  });
}

export function useCognitoConfirmTotp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const client = requireClient();
      if (!client.confirmTotpCode) throw new Error('auth.cognito.unconfigured');
      const next = await client.confirmTotpCode(code);
      if (next === 'totp_required') throw new Error('auth.mfa.invalid_code');
      const me = await ensureBackendPerson();
      const session = await cognitoGetSession();
      return { session, me };
    },
    onSuccess: (result) => {
      queryClient.setQueryData(['auth', 'me'], result.me);
      queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
    },
  });
}

export function useCognitoSignUp() {
  return useMutation({
    mutationFn: (input: {
      email: string;
      password: string;
      givenName: string;
      familyName: string;
    }) => requireClient().signUp(input),
  });
}

export function useCognitoConfirmSignUp() {
  return useMutation({
    mutationFn: ({ email, code }: { email: string; code: string }) =>
      requireClient().confirmSignUp(email, code),
  });
}

export function useCognitoResendCode() {
  return useMutation({
    mutationFn: (email: string) => requireClient().resendSignUpCode(email),
  });
}

export function useCognitoForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => requireClient().resetPassword(email),
  });
}

export function useCognitoConfirmReset() {
  return useMutation({
    mutationFn: (input: { email: string; code: string; newPassword: string }) =>
      requireClient().confirmResetPassword(input.email, input.code, input.newPassword),
  });
}
