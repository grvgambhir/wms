import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { repositories } from '@/data/providers/repositories';
import type { MatchResult } from '@/domain/models/match';

export function useMatch(matchId: string) {
  return useQuery({
    queryKey: ['match', matchId],
    queryFn: () => repositories.results.getMatch(matchId),
    enabled: Boolean(matchId),
  });
}

/** Subscribes to mock live score updates for A18. */
export function useLiveMatch(matchId: string) {
  const { data: initial, isLoading, isError } = useMatch(matchId);
  const [liveMatch, setLiveMatch] = useState<MatchResult | null>(null);

  useEffect(() => {
    if (!matchId) return;

    const unsubscribe = repositories.results.subscribeToMatch(matchId, (update) => {
      setLiveMatch(update);
    });

    return unsubscribe;
  }, [matchId]);

  useEffect(() => {
    if (initial) setLiveMatch(initial);
  }, [initial]);

  return {
    match: liveMatch,
    isLoading,
    isError,
  };
}
