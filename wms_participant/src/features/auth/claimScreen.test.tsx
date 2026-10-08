import { describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor, cleanup } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import ClaimPreRegistrationScreen from '../../../app/(auth)/claim';
import { copy } from '@/constants/copy';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/components/ui/toast', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));

jest.mock('@/i18n', () => ({
  useCopy: () => require('@/constants/copy').copy,
}));

jest.mock('@/components/shell/AppScreen', () => {
  const { View } = require('react-native');
  return {
    AppScreen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('@/components/auth/AuthFormLayout', () => {
  const { View } = require('react-native');
  return {
    AuthFormLayout: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('@/components/ui/text', () => {
  const { Text } = require('react-native');
  return { Text };
});

jest.mock('@/components/ui/button', () => {
  const { Pressable } = require('react-native');
  return { Button: Pressable };
});

jest.mock('@/components/ui/input', () => {
  const { TextInput } = require('react-native');
  return { Input: TextInput };
});

jest.mock('@/data/providers/repositories', () => {
  const { MockPreRegistrationRepository } = require('@/data/mock/repositories/mockPreRegistrationRepository');
  return {
    repositories: {
      preRegistration: new MockPreRegistrationRepository(),
    },
  };
});

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
});

async function lookup(query: string) {
  const screen = render(<ClaimPreRegistrationScreen />, { wrapper });
  fireEvent.changeText(screen.getByLabelText(copy.claimQueryLabel), query);
  fireEvent.press(screen.getByLabelText(copy.claimLookup));
  return screen;
}

describe('claim pre-registration screen', () => {
  it('renders the masked preview for a found EOI — never the full name', async () => {
    const screen = await lookup('COMO27-EOI-0001');
    await waitFor(() => expect(screen.getByText(copy.claimFoundTitle)).toBeTruthy());
    expect(screen.getByText('D••• H•••')).toBeTruthy();
    expect(screen.getByText('d••••@example.com')).toBeTruthy();
    expect(screen.getByText('1985')).toBeTruthy();
    expect(screen.queryByText('Daniel Harper')).toBeNull();
    expect(screen.queryByText('1985-03-14')).toBeNull();
    expect(screen.queryByText('daniel.harper@example.com')).toBeNull();
  });

  it('renders already-claimed and not-found as distinct outcomes', async () => {
    const claimed = await lookup('COMO27-EOI-0003');
    await waitFor(() => expect(claimed.getByText(copy.claimAlreadyTitle)).toBeTruthy());
    expect(claimed.getByText(copy.claimAlreadyBody)).toBeTruthy();
    expect(claimed.queryByText('Giulia Moretti')).toBeNull();

    const missing = await lookup('no-such-record');
    await waitFor(() => expect(missing.getByText(copy.claimNotFoundTitle)).toBeTruthy());
    expect(missing.getByText(copy.claimNotFoundBody)).toBeTruthy();
    expect(missing.queryByText(copy.claimFoundTitle)).toBeNull();
    expect(missing.queryByText(copy.claimAlreadyTitle)).toBeNull();
  });
});
