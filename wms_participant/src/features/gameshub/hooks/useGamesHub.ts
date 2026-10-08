import { useQuery } from '@tanstack/react-query';

import { repositories } from '@/data/providers/repositories';

/** Event-time feed — pass `enabled` so unregistered Home does not fetch mock schedule. */
export function useGamesHubVenues(eventId: string, enabled = true) {
  return useQuery({
    queryKey: ['gameshub', 'venues', eventId],
    queryFn: () => repositories.gamesHub.listVenues(eventId),
    enabled: enabled && Boolean(eventId),
  });
}

export function useGamesHubSchedule(eventId: string, athleteId: string, enabled = true) {
  return useQuery({
    queryKey: ['gameshub', 'schedule', eventId, athleteId],
    queryFn: () => repositories.gamesHub.listSchedule(eventId, athleteId),
    enabled: enabled && Boolean(eventId && athleteId),
  });
}

export function useGamesHubNotifications(eventId: string, athleteId: string, enabled = true) {
  return useQuery({
    queryKey: ['gameshub', 'notifications', eventId, athleteId],
    queryFn: () => repositories.gamesHub.listNotifications(eventId, athleteId),
    enabled: enabled && Boolean(eventId && athleteId),
  });
}
