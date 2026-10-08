import type { Event } from '@/domain/models/event';
import type { EventsRepository } from '@/domain/repositories/events.repository';
import type { CompetitionCategory, Discipline, Sport } from '@/domain/models/sport';
import { fixtures } from '@/data/mock/fixtures';

const SECTION_ORDER = { upcoming: 0, previous: 1 } as const;

function sortEvents(events: Event[]): Event[] {
  return [...events].sort((a, b) => {
    const sectionA = SECTION_ORDER[a.listingSection as keyof typeof SECTION_ORDER] ?? 0;
    const sectionB = SECTION_ORDER[b.listingSection as keyof typeof SECTION_ORDER] ?? 0;
    if (sectionA !== sectionB) return sectionA - sectionB;
    return (a.listingOrder ?? 99) - (b.listingOrder ?? 99);
  });
}

export class MockEventsRepository implements EventsRepository {
  async listEvents(): Promise<Event[]> {
    return sortEvents(fixtures.events);
  }

  async getEvent(id: string): Promise<Event | null> {
    return fixtures.events.find((event) => event.id === id) ?? null;
  }

  async listSports(eventId: string): Promise<Sport[]> {
    return fixtures.sports.filter((sport) => sport.eventId === eventId);
  }

  async getSport(id: string): Promise<Sport | null> {
    return fixtures.sports.find((sport) => sport.id === id) ?? null;
  }

  async listDisciplines(sportId: string): Promise<Discipline[]> {
    const found = fixtures.disciplines.filter((discipline) => discipline.sportId === sportId);
    if (found.length > 0) return found;

    const sport = fixtures.sports.find((item) => item.id === sportId);
    if (!sport) return [];

    // POC fallback — sports on the event card without full discipline fixtures still get a pickable entry.
    const categoryId = `category_${sportId}_50_plus`;
    return [
      {
        id: `discipline_${sportId}_general`,
        sportId,
        name: 'Individual',
        participantType: 'individual',
        categoryIds: [categoryId],
      },
    ];
  }

  async listCategories(disciplineId: string): Promise<CompetitionCategory[]> {
    const direct = fixtures.categories.filter((category) => category.disciplineId === disciplineId);
    if (direct.length > 0) return direct;

    const discipline = fixtures.disciplines.find((item) => item.id === disciplineId);
    if (discipline?.categoryIds.length) {
      const linked = discipline.categoryIds
        .map((id) => fixtures.categories.find((category) => category.id === id))
        .filter((category): category is CompetitionCategory => Boolean(category))
        .map((category) => ({ ...category, disciplineId }));

      if (linked.length > 0) return linked;
    }

    if (disciplineId.endsWith('_general')) {
      const sportId = disciplineId.replace(/^discipline_/, '').replace(/_general$/, '');
      return [
        {
          id: `category_${sportId}_50_plus`,
          disciplineId,
          name: '50+',
          ageGroup: '50+',
          entryType: 'recreational',
          partnerRequired: false,
          quotaStatus: 'available',
        },
      ];
    }

    return [];
  }
}
