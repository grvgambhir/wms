// The participant's own credential record — the pass side of the admin Accreditation
// Desk. Both portals read the SAME record through wms_api, so a badge issued by the OC
// shows up here on the next refetch; there is no second copy to keep in sync.
import { useQuery } from '@tanstack/react-query';

import { repositories } from '@/data/providers/repositories';
import { COMO_DEMO_PARTICIPANT_ID } from '@/domain/models/consent';

export function useMyAccreditationPass(athleteId: string = COMO_DEMO_PARTICIPANT_ID) {
  return useQuery({
    queryKey: ['accreditation', 'pass', athleteId],
    queryFn: () => repositories.accreditation.getPassForAthlete(athleteId),
    enabled: Boolean(athleteId),
    // The OC can issue at any moment during a demo — keep this cheap to re-read.
    staleTime: 0,
  });
}
