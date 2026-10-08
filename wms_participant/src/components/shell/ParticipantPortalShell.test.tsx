import { describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { MeProfile } from '@/auth/me';
import { AUTH_SESSION_QUERY_KEY } from '@/auth/session';
import { ParticipantAccountMenu } from '@/components/shell/ParticipantAccountMenu';
import { copy } from '@/constants/copy';
import { usePortalUserName } from '@/features/auth/hooks/useAuth';

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

function adaMe(): MeProfile {
  return {
    id: 'person-ada',
    email: 'ada@example.com',
    givenName: 'Ada',
    familyName: 'Lovelace',
    dateOfBirth: '1985-03-15',
    nationality: 'GB',
    gender: 'female',
    phone: null,
    locale: 'en',
    profileStatus: 'complete',
    roles: ['participant'],
    emergencyContacts: [],
  };
}

function seededClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, {
    athleteId: 'cognito-sub',
    identifier: 'ada@example.com',
    verifiedAt: '2020-01-01T00:00:00.000Z',
  });
  queryClient.setQueryData(['auth', 'me'], adaMe());
  return queryClient;
}

describe('ParticipantAccountMenu', () => {
  it('shows the signed-in name from /v1/me and exposes Log out', () => {
    const queryClient = seededClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => usePortalUserName(undefined, copy.accountAthleteFallback), {
      wrapper,
    });
    expect(result.current).toBe('Ada Lovelace');
    expect(result.current).not.toContain('Daniel Harper');

    const screen = render(
      <ParticipantAccountMenu
        userName={result.current}
        labels={{
          menu: copy.accountMenuA11y,
          signedInAs: copy.cognitoSignedInAs,
          logout: copy.accountLogout,
          loggingOut: copy.accountLoggingOut,
        }}
        onSignOut={() => undefined}
        signingOut={false}
      />,
      { wrapper },
    );

    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.queryByText('Daniel Harper')).toBeNull();
    fireEvent.press(screen.getByLabelText(copy.accountMenuA11y));
    expect(screen.getByLabelText(copy.accountLogout)).toBeTruthy();
    expect(screen.getByText(copy.accountLogout)).toBeTruthy();
  });

  it('calls onSignOut when Log out is pressed', () => {
    const onSignOut = jest.fn();
    const screen = render(
      <ParticipantAccountMenu
        userName="Ada Lovelace"
        labels={{
          menu: copy.accountMenuA11y,
          signedInAs: copy.cognitoSignedInAs,
          logout: copy.accountLogout,
          loggingOut: copy.accountLoggingOut,
        }}
        onSignOut={onSignOut}
        signingOut={false}
      />,
    );

    fireEvent.press(screen.getByLabelText(copy.accountMenuA11y));
    fireEvent.press(screen.getByLabelText(copy.accountLogout));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
