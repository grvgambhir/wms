import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { repositories } from '@/data/providers/repositories';

export function useAccreditation(registrationId: string) {
  return useQuery({
    queryKey: ['accreditation', registrationId],
    queryFn: () => repositories.accreditation.getAccreditation(registrationId),
    enabled: Boolean(registrationId),
  });
}

export function useIssueAccreditation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (registrationId: string) => repositories.accreditation.issueAccreditation(registrationId),
    onSuccess: (accreditation) => {
      queryClient.invalidateQueries({ queryKey: ['accreditation', accreditation.registrationId] });
    },
  });
}
