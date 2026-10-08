import type { AppNotification, ScheduleItem, Venue } from '../models/gameshub';

export interface GamesHubRepository {
  listVenues(eventId: string): Promise<Venue[]>;
  listSchedule(eventId: string, athleteId: string): Promise<ScheduleItem[]>;
  listNotifications(eventId: string, athleteId: string): Promise<AppNotification[]>;
}
