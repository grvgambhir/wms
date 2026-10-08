import { describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { ConsentListResponse, ConsentRecord } from '@/domain/models/consent';
import { useParticipantConsents } from '@/features/profile/hooks/useProfileConsent';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuthSession: () => ({ data: null, isLoading: false }),
}));

const mockGetConsents = jest.fn(async (): Promise<ConsentListResponse> => ({
  items: [
    {
      id: 'terms_and_conditions',
      participantId: 'person-ada',
      kind: 'terms_and_conditions',
      required: true,
      sensitive: false,
      status: 'granted',
      policyVersion: 'T&C v1.2',
      updatedAt: '2026-08-12T09:00:00.000Z',
      grantedAt: '2026-08-12T09:00:00.000Z',
    },
    {
      id: 'eligibility_medical_evidence',
      participantId: 'person-ada',
      kind: 'eligibility_medical_evidence',
      required: true,
      sensitive: true,
      status: 'withdrawn',
      policyVersion: 'Evidence processing v1.0',
      updatedAt: '2026-08-20T14:30:00.000Z',
      grantedAt: '2026-08-12T09:05:00.000Z',
      withdrawnAt: '2026-08-20T14:30:00.000Z',
    },
  ],
  total: 2,
}));

jest.mock('@/data/providers/repositories', () => ({
  repositories: {
    consents: {
      getConsents: (...args: unknown[]) => mockGetConsents(...args),
      grantConsent: jest.fn(),
      withdrawConsent: jest.fn(),
    },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0 } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** Same predicate the P06 screen uses for the action-needed banner. */
function actionNeeded(items: ConsentRecord[]): ConsentRecord[] {
  return items.filter((item) => item.required && item.status !== 'granted');
}

describe('P06 consents from the API repository', () => {
  it('loads API-shaped records and treats a withdrawn required consent as action-needed', async () => {
    const { result } = renderHook(() => useParticipantConsents('person-ada'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetConsents).toHaveBeenCalledWith('person-ada');
    const items = result.current.data?.items ?? [];
    expect(items.map((item) => item.id)).toEqual([
      'terms_and_conditions',
      'eligibility_medical_evidence',
    ]);
    expect(actionNeeded(items).map((item) => item.kind)).toEqual(['eligibility_medical_evidence']);
  });
});
