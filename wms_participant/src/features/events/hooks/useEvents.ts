import { useQuery } from '@tanstack/react-query';

import { repositories } from '@/data/providers/repositories';

export function useEvents() {
  return useQuery({
    queryKey: ['events'],
    queryFn: () => repositories.events.listEvents(),
  });
}

export function useEvent(eventId: string) {
  return useQuery({
    queryKey: ['events', eventId],
    queryFn: () => repositories.events.getEvent(eventId),
    enabled: Boolean(eventId),
  });
}

export function useEventSports(eventId: string) {
  return useQuery({
    queryKey: ['events', eventId, 'sports'],
    queryFn: () => repositories.events.listSports(eventId),
    enabled: Boolean(eventId),
  });
}

export function useSport(sportId: string) {
  return useQuery({
    queryKey: ['sports', sportId],
    queryFn: () => repositories.events.getSport(sportId),
    enabled: Boolean(sportId),
  });
}

export function useSportDisciplines(sportId: string) {
  return useQuery({
    queryKey: ['sports', sportId, 'disciplines'],
    queryFn: () => repositories.events.listDisciplines(sportId),
    enabled: Boolean(sportId),
  });
}

export function useDisciplineCategories(disciplineId: string) {
  return useQuery({
    queryKey: ['disciplines', disciplineId, 'categories'],
    queryFn: () => repositories.events.listCategories(disciplineId),
    enabled: Boolean(disciplineId),
  });
}
