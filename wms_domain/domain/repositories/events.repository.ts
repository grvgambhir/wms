import type { Event } from '../models/event';
import type { CompetitionCategory, Discipline, Sport } from '../models/sport';

export interface EventsRepository {
  listEvents(): Promise<Event[]>;
  getEvent(id: string): Promise<Event | null>;
  listSports(eventId: string): Promise<Sport[]>;
  getSport(id: string): Promise<Sport | null>;
  listDisciplines(sportId: string): Promise<Discipline[]>;
  listCategories(disciplineId: string): Promise<CompetitionCategory[]>;
}
