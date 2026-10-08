import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { repositories } from '@/data/providers/repositories';
import type { AthleteProfileInput } from '@/domain/models/athlete';

export function useAthleteProfile() {
  return useQuery({
    queryKey: ['athlete', 'profile'],
    queryFn: () => repositories.athlete.getCurrentProfile(),
  });
}

export function useAthleteById(athleteId: string) {
  return useQuery({
    queryKey: ['athlete', athleteId],
    queryFn: () => repositories.athlete.getProfile(athleteId),
    enabled: Boolean(athleteId),
  });
}

export function useSaveAthleteProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AthleteProfileInput) => repositories.athlete.saveProfile(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['athlete', 'profile'] });
    },
  });
}
