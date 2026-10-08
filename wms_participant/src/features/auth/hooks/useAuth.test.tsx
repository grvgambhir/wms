import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { AUTH_SESSION_QUERY_KEY } from '@/auth/session';
import { copy } from '@/constants/copy';
import { applySignedOutCache, useAuthSession } from '@/features/auth/hooks/useAuth';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: jest.fn(),
    push: jest.fn(),
    back: jest.fn(),
  }),
}));

afterEach(() => {
  jest.restoreAllMocks();
});

function testQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

/** Same predicate as CognitoLoginScreen (`if (isLoading || session)`). */
function LoginGuard() {
  const { data: session, isLoading } = useAuthSession();
  if (isLoading || session) return <Text>{copy.loading}</Text>;
  return <Text>{copy.loginWelcome}</Text>;
}

describe('sign-out cache', () => {
  it('sets session to null synchronously and drops other cached queries', () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, {
      athleteId: 'athlete_daniel_harper',
      identifier: 'daniel.harper@email.com',
      verifiedAt: '2020-01-01T00:00:00.000Z',
    });
    queryClient.setQueryData(['athlete', 'athlete_daniel_harper'], { name: 'Daniel Harper' });

    applySignedOutCache(queryClient);

    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toBeNull();
    expect(queryClient.getQueryData(['athlete', 'athlete_daniel_harper'])).toBeUndefined();
  });

  it('renders the login form after sign-out instead of LoadingState', () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, {
      athleteId: 'athlete_daniel_harper',
      identifier: 'daniel.harper@email.com',
      verifiedAt: '2020-01-01T00:00:00.000Z',
    });
    queryClient.setQueryData(['athlete', 'previous'], { name: 'Daniel Harper' });

    applySignedOutCache(queryClient);

    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toBeNull();
    expect(queryClient.getQueryData(['athlete', 'previous'])).toBeUndefined();

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const screen = render(<LoginGuard />, { wrapper });
    expect(screen.getByText(copy.loginWelcome)).toBeTruthy();
    expect(screen.queryByText(copy.loading)).toBeNull();
  });
});
