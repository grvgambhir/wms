import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { repositories } from '@/data/providers/repositories';
import type { CreatedEntry } from '@/domain/models/myEntries';
import type { EntryGrade } from '@/domain/models/registrationJourney';
import { newIdempotencyKey } from '@/features/profile/completeProfile';

export const MY_ENTRIES_QUERY_KEY = ['my-entries'] as const;
export const REGISTRATION_OPTIONS_QUERY_KEY = ['registration-options'] as const;

/** `GET /v1/me/entries` — the signed-in person's entries, newest first. */
export function useMyEntries(enabled = true) {
  return useQuery({
    queryKey: MY_ENTRIES_QUERY_KEY,
    queryFn: () => repositories.myEntries.list(),
    enabled,
    staleTime: 10_000,
  });
}

/** `GET /v1/me/registration-options` — what they can register for, with their own category. */
export function useRegistrationOptions() {
  return useQuery({
    queryKey: REGISTRATION_OPTIONS_QUERY_KEY,
    queryFn: () => repositories.myEntries.registrationOptions(),
    staleTime: 10_000,
  });
}

/**
 * `POST /v1/me/entries`. One idempotency key per tap: a key built from the product would make a
 * second registration for that product (after a withdrawal) replay the first one's response.
 */
export function useCreateEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { sportEntryProductId: string; grade: EntryGrade }): Promise<CreatedEntry> =>
      repositories.myEntries.create({ ...input, idempotencyKey: newIdempotencyKey() }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: MY_ENTRIES_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: REGISTRATION_OPTIONS_QUERY_KEY });
    },
  });
}

/** One fresh key per tap lets a true second request be de-duplicated by the live-refusal rule. */
export function useRaiseEntryException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => repositories.myEntries.raiseException({ entryId, idempotencyKey: newIdempotencyKey() }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: MY_ENTRIES_QUERY_KEY }),
  });
}
