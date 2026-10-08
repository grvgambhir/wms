import type { AppNotification, ScheduleItem, Venue } from '@/domain/models/gameshub';
import type { GamesHubRepository } from '@/domain/repositories/gameshub.repository';
import { fixtures } from '@/data/mock/fixtures';

export class MockGamesHubRepository implements GamesHubRepository {
  async listVenues(eventId: string): Promise<Venue[]> {
    return fixtures.venues.filter((venue) => venue.eventId === eventId);
  }

  async listSchedule(eventId: string, athleteId: string): Promise<ScheduleItem[]> {
    return fixtures.schedules.filter(
      (item) => item.eventId === eventId && (!item.athleteId || item.athleteId === athleteId),
    );
  }

  async listNotifications(eventId: string, athleteId: string): Promise<AppNotification[]> {
    return fixtures.notifications.filter(
      (item) => item.eventId === eventId && (!item.athleteId || item.athleteId === athleteId),
    );
  }
}
