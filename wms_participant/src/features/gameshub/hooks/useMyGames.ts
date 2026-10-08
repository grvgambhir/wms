// The participant's Games-time schedule for Como Lake 2027.
//
// Reads the Como data-hub seed rather than the legacy A16 gameshub fixtures, which are
// keyed to the superseded POC id universe (event_wmg_kansai_2027 / athlete_daniel_harper).
// There is no admin counterpart for a schedule, so this stays a local read — wiring it to
// wms_api would add a hop without gaining a cross-portal leg.
import { useQuery } from '@tanstack/react-query';

import seed from '@/data/mock/fixtures/data-hub/games-schedule.json';
import { COMO_DEMO_PARTICIPANT_ID } from '@/domain/models/consent';
import type { ScheduleItem, Venue } from '@/domain/models/gameshub';

type GamesSeed = { venues: Venue[]; schedule: ScheduleItem[] };

export type ScheduledEntry = ScheduleItem & { venue?: Venue };

/** Schedule items for one athlete, oldest first, each resolved to its venue. */
export function useMyGames(athleteId: string = COMO_DEMO_PARTICIPANT_ID) {
  return useQuery({
    queryKey: ['gameshub', 'schedule', athleteId],
    queryFn: async (): Promise<ScheduledEntry[]> => {
      const { venues, schedule } = seed as unknown as GamesSeed;
      return schedule
        .filter((item) => item.athleteId === athleteId)
        .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
        .map((item) => ({ ...item, venue: venues.find((v) => v.id === item.venueId) }));
    },
    enabled: Boolean(athleteId),
  });
}
