// Claim / pre-registration hooks (P03 — REG-13). Lookup and claim run as mutations
// (both are user-triggered actions) so the screen can drive them from button presses and
// read isPending/data/error directly. Repository seam = future REST.
import { useMutation } from '@tanstack/react-query';

import { repositories } from '@/data/providers/repositories';
import type {
  ClaimPreRegistrationRequest,
  PreRegistrationLookupRequest,
} from '@/domain/models/preRegistration';

export function usePreRegistrationLookup() {
  return useMutation({
    mutationFn: (input: PreRegistrationLookupRequest) => repositories.preRegistration.lookup(input),
  });
}

export function useClaimPreRegistration() {
  return useMutation({
    mutationFn: (input: ClaimPreRegistrationRequest) => repositories.preRegistration.claim(input),
  });
}
