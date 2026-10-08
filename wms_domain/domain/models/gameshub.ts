export interface Venue {
  id: string;
  eventId: string;
  name: string;
  city: string;
  address?: string;
}

export interface ScheduleItem {
  id: string;
  eventId: string;
  athleteId?: string;
  sportId?: string;
  type: 'match' | 'training' | 'ceremony' | 'social' | 'other';
  title: string;
  startAt: string;
  endAt?: string;
  venueId?: string;
  court?: string;
  matchId?: string;
}

export type NotificationType = 'info' | 'schedule_change' | 'registration' | 'result' | 'alert';

export interface AppNotification {
  id: string;
  athleteId?: string;
  eventId: string;
  title: string;
  body: string;
  type: NotificationType;
  createdAt: string;
  read: boolean;
}
