// The participant's own messages — broadcasts the OC addressed to a segment this
// athlete belongs to. Same delivery log the admin Communications Center writes into.
import { useQuery } from '@tanstack/react-query';

import { repositories } from '@/data/providers/repositories';
import { COMO_DEMO_PARTICIPANT_ID } from '@/domain/models/consent';

export function useMyInbox(athleteId: string = COMO_DEMO_PARTICIPANT_ID) {
  return useQuery({
    queryKey: ['communications', 'inbox', athleteId],
    queryFn: () => repositories.participantInbox.listInbox(athleteId),
    enabled: Boolean(athleteId),
    // The OC can broadcast at any moment during a demo — keep this cheap to re-read.
    staleTime: 0,
  });
}
