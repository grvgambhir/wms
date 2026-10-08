import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { repositories } from '@/data/providers/repositories';
import type { Registration, RegistrationDraft } from '@/domain/models/registration';

export function useRegistrationDraft(eventId: string) {
  return useQuery({
    queryKey: ['registration', 'draft', eventId],
    queryFn: () => repositories.registration.getDraft(eventId),
    enabled: Boolean(eventId),
  });
}

export function useSaveRegistrationDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (draft: RegistrationDraft) => repositories.registration.saveDraft(draft),
    onSuccess: (_, draft) => {
      queryClient.invalidateQueries({ queryKey: ['registration', 'draft', draft.eventId] });
      queryClient.invalidateQueries({ queryKey: ['registration', 'registered-events'] });
    },
  });
}

export function useRegistrationFee(eventId: string) {
  return useQuery({
    queryKey: ['registration', 'fee', eventId],
    queryFn: () => repositories.registration.getFeeConfig(eventId),
    enabled: Boolean(eventId),
  });
}

export function useRegistrationByEvent(eventId: string, athleteId: string) {
  return useQuery({
    queryKey: ['registration', 'event', eventId, athleteId],
    queryFn: () => repositories.registration.getRegistrationByEvent(eventId, athleteId),
    enabled: Boolean(eventId && athleteId),
  });
}

export function useSubmitRegistration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (draft: RegistrationDraft) => repositories.registration.submitRegistration(draft),
    onSuccess: (registration) => {
      queryClient.invalidateQueries({
        queryKey: ['registration', 'event', registration.eventId, registration.athleteId],
      });
      queryClient.invalidateQueries({ queryKey: ['registration', 'draft', registration.eventId] });
      queryClient.invalidateQueries({ queryKey: ['registration', 'registered-events'] });
    },
  });
}

export function useUpdateRegistrationStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Registration['status'] }) =>
      repositories.registration.updateRegistrationStatus(id, status),
    onSuccess: (registration) => {
      queryClient.invalidateQueries({
        queryKey: ['registration', 'event', registration.eventId, registration.athleteId],
      });
      queryClient.invalidateQueries({ queryKey: ['registration', 'registered-events'] });
    },
  });
}

/** Event IDs where the athlete has a draft (sport selected) or submitted registration. */
export function useRegisteredEventIds(eventIds: string[], athleteId: string) {
  return useQuery({
    queryKey: ['registration', 'registered-events', athleteId, eventIds.join(',')],
    queryFn: async () => {
      const registered: string[] = [];

      for (const eventId of eventIds) {
        const registration = await repositories.registration.getRegistrationByEvent(eventId, athleteId);
        if (registration) {
          registered.push(eventId);
          continue;
        }

        const draft = await repositories.registration.getDraft(eventId);
        if (draft?.athleteId === athleteId && draft.sportId) {
          registered.push(eventId);
        }
      }

      return registered;
    },
    enabled: Boolean(athleteId) && eventIds.length > 0,
  });
}
