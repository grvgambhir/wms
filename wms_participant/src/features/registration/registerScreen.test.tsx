/**
 * Register for a sport — the screen that creates a real entry. The refusals are the point: a
 * duplicate opens the existing entry, a missing consent points at the profile, and a success
 * opens the NEW entry rather than any demo one.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { copy } from '@/constants/copy';
import { RepositoryError } from '@/data/errors/repositoryError';
import type { RegistrationOptions } from '@/domain/models/myEntries';
import RegisterScreen from '../../../app/(participant)/register';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

// Same stubs as claimScreen.test.tsx: @rn-primitives ships untransformed JSX that jest-expo
// does not compile, and the shell pulls in auth/navigation this screen test is not about.
jest.mock('@/components/ui/text', () => {
  const { Text } = require('react-native');
  return { Text };
});

jest.mock('@/components/shell/ErrorState', () => {
  const { Text } = require('react-native');
  return { ErrorState: ({ description }: { description?: string }) => <Text>{description}</Text> };
});

jest.mock('@/components/shell/LoadingState', () => {
  const { Text } = require('react-native');
  return { LoadingState: ({ message }: { message: string }) => <Text>{message}</Text> };
});

jest.mock('@/i18n', () => ({
  useCopy: () => require('@/constants/copy').copy,
}));

jest.mock('@/components/shell/ParticipantPortalShell', () => ({
  ParticipantPortalShell: ({ children }: { children: ReactNode }) => children,
}));

const mockOpenEntry = jest.fn(async (_id: string) => undefined);
jest.mock('@/features/registration/RegistrationJourneyContext', () => ({
  useRegistrationJourney: () => ({ openEntry: mockOpenEntry }),
}));

const mockCreate = jest.fn<(input: { sportEntryProductId: string; grade: string; idempotencyKey: string }) => Promise<unknown>>();
let mockOptions: RegistrationOptions;
jest.mock('@/data/providers/repositories', () => ({
  repositories: {
    myEntries: {
      list: jest.fn(async () => ({ items: [] })),
      create: (input: { sportEntryProductId: string; grade: string; idempotencyKey: string }) => mockCreate(input),
      registrationOptions: async () => mockOptions,
    },
  },
}));

function options(overrides: Partial<RegistrationOptions['products'][number]> = {}): RegistrationOptions {
  return {
    event: { id: 'event-1', name: 'Como Lake 2027', startsOn: '2027-09-17', endsOn: '2027-09-26', registrationOpen: true },
    products: [
      {
        id: 'swim',
        name: '100m Freestyle',
        sportId: 'sport-swim',
        sportName: 'Swimming',
        participantType: 'individual',
        allowedGrades: ['competitive'],
        partnerRequired: false,
        requiresEvidence: true,
        myEntryId: null,
        category: { name: '40–44', eligible: true, referenceDate: '2027-12-31', blockedBy: [] },
        ...overrides,
      },
    ],
  };
}

function renderScreen() {
  const client = new QueryClient({
    // gcTime Infinity: no garbage-collection timers, so Jest can exit when the tests finish.
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RegisterScreen />
    </QueryClientProvider>,
  );
}

const startButton = () => screen.getByLabelText(`${copy.registerStart}: Swimming 100m Freestyle`);

beforeEach(() => {
  mockPush.mockReset();
  mockOpenEntry.mockClear();
  mockCreate.mockReset();
  mockOptions = options();
});

describe('Register screen', () => {
  it('shows the athlete their own category before they start', async () => {
    renderScreen();
    expect(await screen.findByText(copy.registerYourCategory.replace('{category}', '40–44'))).toBeTruthy();
  });

  it('creates the entry, opens it, and goes to its next step', async () => {
    mockCreate.mockResolvedValue({ id: 'new-entry', status: 'draft' });
    renderScreen();
    await screen.findByText('100m Freestyle');
    fireEvent.press(startButton());

    await waitFor(() => expect(mockOpenEntry).toHaveBeenCalledWith('new-entry'));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ sportEntryProductId: 'swim', grade: 'competitive' }),
    );
    expect(mockPush).toHaveBeenCalledWith('/sport-entry');
  });

  it('opens the existing entry when the backend says it is a duplicate', async () => {
    mockCreate.mockRejectedValue(
      new RepositoryError({ code: 'DUPLICATE_ENTRY', message: 'dup', fields: { entryId: 'existing-entry' } }),
    );
    renderScreen();
    await screen.findByText('100m Freestyle');
    fireEvent.press(startButton());
    await waitFor(() => expect(mockOpenEntry).toHaveBeenCalledWith('existing-entry'));
  });

  it('explains a missing consent and offers the profile', async () => {
    mockCreate.mockRejectedValue(
      new RepositoryError({ code: 'CONSENT_REQUIRED', message: 'x', fields: { consents: 'privacy_policy' } }),
    );
    renderScreen();
    await screen.findByText('100m Freestyle');
    fireEvent.press(startButton());
    expect(await screen.findByText(copy.registerErrorConsent)).toBeTruthy();
    fireEvent.press(screen.getByText(copy.registerGoToProfile));
    expect(mockPush).toHaveBeenCalledWith('/profile');
    expect(mockOpenEntry).not.toHaveBeenCalled();
  });

  it('offers "open my entry" instead of a second registration', async () => {
    mockOptions = options({ myEntryId: 'already-mine' });
    renderScreen();
    fireEvent.press(await screen.findByText(copy.registerOpenExisting));
    await waitFor(() => expect(mockOpenEntry).toHaveBeenCalledWith('already-mine'));
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('does not let an athlete outside every band start', async () => {
    mockOptions = options({ category: { name: null, eligible: false, referenceDate: '2027-12-31', blockedBy: ['x'] } });
    renderScreen();
    expect(await screen.findByText(copy.registerNotEligible)).toBeTruthy();
    fireEvent.press(startButton());
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('sends a fresh idempotency key on every tap', async () => {
    mockCreate.mockRejectedValue(new RepositoryError({ code: 'EVENT_UNAVAILABLE', message: 'closed' }));
    renderScreen();
    await screen.findByText('100m Freestyle');
    fireEvent.press(startButton());
    await screen.findByText(copy.registerErrorClosed);
    fireEvent.press(startButton());
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(2));
    const [first, second] = mockCreate.mock.calls.map(([input]) => input.idempotencyKey);
    expect(first).not.toBe(second);
  });
});
