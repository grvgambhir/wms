import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { repositories } from '@/data/providers/repositories';
import type { EligibilityDocument } from '@/domain/models/document';

export function useDocumentRequirements(eventId: string) {
  return useQuery({
    queryKey: ['documents', 'requirements', eventId],
    queryFn: () => repositories.documents.listRequirements(eventId),
    enabled: Boolean(eventId),
  });
}

export function useAthleteDocuments(athleteId: string) {
  return useQuery({
    queryKey: ['documents', 'athlete', athleteId],
    queryFn: () => repositories.documents.listDocuments(athleteId),
    enabled: Boolean(athleteId),
  });
}

export function useSaveDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (document: EligibilityDocument) => repositories.documents.saveDocument(document),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['documents', 'athlete', saved.athleteId] });
    },
  });
}
