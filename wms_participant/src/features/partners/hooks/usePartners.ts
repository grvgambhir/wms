import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { DEMO_IDS } from '@/constants/demo';
import type { PartnerFilters, PartnerRequestStatus } from '@/domain/models/partner';
import { repositories } from '@/data/providers/repositories';

export function usePartnerCandidates(
  eventId: string,
  categoryId: string,
  sportId?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: ['partners', 'candidates', eventId, categoryId, sportId],
    queryFn: () =>
      repositories.partners.searchPartners({
        eventId,
        categoryId,
        sportId,
      }),
    enabled: enabled && Boolean(eventId && categoryId),
    staleTime: 60_000,
  });
}

/** @deprecated Prefer usePartnerCandidates + client-side query filter (avoids refetch on each keystroke). */
export function usePartnerSearch(filters: PartnerFilters, enabled = true) {
  return useQuery({
    queryKey: ['partners', filters],
    queryFn: () => repositories.partners.searchPartners(filters),
    enabled: enabled && Boolean(filters.eventId && filters.categoryId),
  });
}

export function usePartnerRequests(eventId: string, athleteId: string) {
  return useQuery({
    queryKey: ['partners', 'requests', eventId, athleteId],
    queryFn: () => repositories.partners.listRequests(eventId, athleteId),
    enabled: Boolean(eventId && athleteId),
  });
}

function invalidatePartnerRequests(queryClient: ReturnType<typeof useQueryClient>, eventId: string, athleteId: string) {
  queryClient.invalidateQueries({
    queryKey: ['partners', 'requests', eventId, athleteId],
  });
}

export function useSendPartnerRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      eventId: string;
      categoryId: string;
      fromAthleteId: string;
      toAthleteId: string;
    }) => repositories.partners.sendPartnerRequest(input),
    onSuccess: (_, variables) => {
      invalidatePartnerRequests(queryClient, variables.eventId, variables.fromAthleteId);
    },
  });
}

export function useRespondToPartnerRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { requestId: string; status: PartnerRequestStatus; eventId: string; fromAthleteId: string }) =>
      repositories.partners.respondToPartnerRequest(input.requestId, input.status),
    onSuccess: (_, variables) => {
      invalidatePartnerRequests(queryClient, variables.eventId, variables.fromAthleteId);
    },
  });
}

export function useCancelPendingPartnerRequests() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { eventId: string; fromAthleteId: string; exceptToAthleteId?: string }) =>
      repositories.partners.cancelPendingOutgoing(input.eventId, input.fromAthleteId, input.exceptToAthleteId),
    onSuccess: (_, variables) => {
      invalidatePartnerRequests(queryClient, variables.eventId, variables.fromAthleteId);
    },
  });
}

export function useMarcoPartnerDemo() {
  return usePartnerSearch({
    eventId: DEMO_IDS.eventDemo,
    categoryId: DEMO_IDS.categoryTennisMd4044,
    query: 'Marco',
  });
}
