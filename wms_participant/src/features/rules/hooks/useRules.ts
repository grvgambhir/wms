// Feature hooks for the rules engine (WS-B). Screens read rule DATA through these
// (never the fixtures/engine directly) — useMemo the derivation in the screen.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { repositories } from '@/data/providers/repositories';
import type { PublishRuleChangeInput } from '@/domain/models/rule';

const RULE_CHANGE_KEY = ['rules', 'change', 'latest'] as const;

export function useSportRules() {
  return useQuery({
    queryKey: ['rules', 'all'],
    queryFn: () => repositories.rules.listRules(),
    staleTime: 5 * 60_000,
  });
}

export function useRuleForEvent(sport: string, event?: string, enabled = true) {
  return useQuery({
    queryKey: ['rules', 'event', sport, event],
    queryFn: () => repositories.rules.getRuleForEvent(sport, event),
    enabled: enabled && Boolean(sport),
    staleTime: 5 * 60_000,
  });
}

/** P19 — the latest rule-register change affecting this sport/event (cross-portal from A04). */
export function useLatestRuleChange(sport: string, event?: string, enabled = true) {
  return useQuery({
    queryKey: [...RULE_CHANGE_KEY, sport, event],
    queryFn: () => repositories.rules.getLatestRuleChange(sport, event),
    enabled: enabled && Boolean(sport),
    // Short + refetch on focus so a just-published admin change surfaces on the participant side.
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });
}

/** A04 — record a published rule change so affected participants (P19) can review it. */
export function usePublishRuleChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PublishRuleChangeInput) => repositories.rules.publishRuleChange(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RULE_CHANGE_KEY });
    },
  });
}

/** P19 — participant acknowledges/reviews the change before commit. */
export function useAcknowledgeRuleChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noticeId: string) => repositories.rules.acknowledgeRuleChange(noticeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RULE_CHANGE_KEY });
    },
  });
}
