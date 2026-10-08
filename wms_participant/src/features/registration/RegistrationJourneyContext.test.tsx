/**
 * Which entry the journey works on. It used to be one hard-coded demo entry for everybody; these
 * tests pin that it is now the signed-in person's own, and that an empty list is a state rather
 * than a request for somebody else's entry.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { MyEntry } from '@/domain/models/myEntries';
import {
  RegistrationJourneyProvider,
  useRegistrationJourney,
} from '@/features/registration/RegistrationJourneyContext';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuthSession: () => ({ data: { athleteId: 'person-1', username: 'ada' }, isLoading: false }),
  useMeProfile: () => ({ data: undefined }),
}));

jest.mock('@/features/rules/hooks/useRules', () => ({
  useRuleForEvent: () => ({ data: null, isLoading: false }),
}));

const mockList = jest.fn<() => Promise<{ items: MyEntry[] }>>();
const mockGetJourney = jest.fn<(input: { registrationEntryId: string; eventId: string }) => Promise<unknown>>();
const mockTransition = jest.fn<(input: { idempotencyKey: string }) => Promise<unknown>>();

jest.mock('@/data/providers/repositories', () => ({
  repositories: {
    myEntries: { list: () => mockList(), create: jest.fn(), registrationOptions: jest.fn() },
    registrationJourney: {
      getJourney: (input: { registrationEntryId: string; eventId: string }) => mockGetJourney(input),
      transitionEntryStatus: (input: { idempotencyKey: string }) => mockTransition(input),
    },
    teamRosters: { getTeamRoster: jest.fn() },
  },
}));

function entry(id: string, status = 'draft'): MyEntry {
  return {
    id,
    eventId: 'event-1',
    eventName: 'Como',
    sportId: 'sport-1',
    sportName: 'Swimming',
    sportEntryProductId: `product-${id}`,
    productName: '100m Freestyle',
    grade: 'competitive',
    categoryName: '40–44',
    status,
    evidenceStatus: 'not_required',
    teamRosterId: null,
    createdAt: '2026-09-15T10:00:00.000Z',
    updatedAt: '2026-09-15T10:00:00.000Z',
  };
}

function snapshotFor(id: string) {
  return {
    event: { id: 'event-1' },
    athlete: { id: 'athlete-1', firstName: 'Ada', lastName: 'L', dateOfBirth: '1985-06-01' },
    sports: { items: [] },
    sportEntryProducts: { items: [] },
    partners: { items: [] },
    rules: { items: [] },
    documents: { items: [] },
    entry: { id, sportEntryProductId: `product-${id}`, grade: 'competitive', status: 'draft' },
    fees: { items: [] },
    quotas: { items: [] },
    waitlist: null,
    order: null,
    payment: null,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    // gcTime Infinity: no garbage-collection timers, so Jest can exit when the tests finish.
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  return (
    <QueryClientProvider client={client}>
      <RegistrationJourneyProvider>{children}</RegistrationJourneyProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockList.mockReset();
  mockGetJourney.mockReset();
  mockTransition.mockReset();
  mockGetJourney.mockImplementation(async (input) => snapshotFor(input.registrationEntryId));
});

describe('RegistrationJourneyProvider', () => {
  it('with no entries reports needsEntry and requests no journey at all', async () => {
    mockList.mockResolvedValue({ items: [] });
    const { result } = renderHook(() => useRegistrationJourney(), { wrapper });
    await waitFor(() => expect(result.current.needsEntry).toBe(true));
    expect(result.current.entryId).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(mockGetJourney).not.toHaveBeenCalled();
  });

  it('opens the newest of the person’s own entries, then the one they choose', async () => {
    mockList.mockResolvedValue({ items: [entry('newest'), entry('older')] });
    const { result } = renderHook(() => useRegistrationJourney(), { wrapper });

    await waitFor(() => expect(result.current.snapshot?.entry.id).toBe('newest'));
    expect(mockGetJourney).toHaveBeenCalledWith(expect.objectContaining({ registrationEntryId: 'newest', eventId: 'event-1' }));

    await act(async () => {
      await result.current.openEntry('older');
    });
    await waitFor(() => expect(result.current.snapshot?.entry.id).toBe('older'));
    expect(mockGetJourney.mock.calls.map(([input]) => input.registrationEntryId)).not.toContain(
      '74bd5dc5-37cb-49be-8ef6-202700000001',
    );
  });

  it('ignores a remembered entry id that is not in this person’s list', async () => {
    const storage = require('@react-native-async-storage/async-storage');
    await storage.setItem('imga.registration.activeEntry', JSON.stringify('someone-elses-entry'));
    mockList.mockResolvedValue({ items: [entry('mine')] });
    const { result } = renderHook(() => useRegistrationJourney(), { wrapper });
    await waitFor(() => expect(result.current.snapshot?.entry.id).toBe('mine'));
    expect(mockGetJourney.mock.calls.map(([input]) => input.registrationEntryId)).not.toContain('someone-elses-entry');
    await storage.clear();
  });

  it('sends a different idempotency key for each status action', async () => {
    mockList.mockResolvedValue({ items: [entry('mine')] });
    mockTransition.mockImplementation(async () => ({ id: 'mine', status: 'withdrawn' }));
    const { result } = renderHook(() => useRegistrationJourney(), { wrapper });
    await waitFor(() => expect(result.current.snapshot?.entry.id).toBe('mine'));

    await act(async () => {
      await result.current.withdrawEntry();
    });
    await act(async () => {
      await result.current.withdrawEntry();
    });
    const keys = mockTransition.mock.calls.map(([input]) => input.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });
});
