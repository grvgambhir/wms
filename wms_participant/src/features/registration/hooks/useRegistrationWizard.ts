import { useLocalSearchParams } from 'expo-router';

import { useRegistrationDraft } from '@/features/registration/hooks/useRegistration';

/** Shared eventId param for registration wizard screens. */
export function useRegistrationEventId(): string {
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  return eventId ?? '';
}

export function useRegistrationWizard(eventId: string) {
  const draftQuery = useRegistrationDraft(eventId);

  return {
    eventId,
    draft: draftQuery.data,
    isLoading: draftQuery.isLoading,
    isError: draftQuery.isError,
    refetch: draftQuery.refetch,
  };
}
