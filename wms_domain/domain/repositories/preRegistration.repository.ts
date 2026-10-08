// Participant claim / pre-registration repository contract (P03 — REG-13). Lookup a
// migrated EOI record and claim it through this seam only; the API implementation swaps
// in later with no UI change (§6.6).
import type {
  ClaimPreRegistrationRequest,
  ClaimPreRegistrationResponse,
  PreRegistrationLookupRequest,
  PreRegistrationLookupResult,
} from '../models/preRegistration';

export interface PreRegistrationRepository {
  /** GET — find a pre-registration by reference or email; returns a masked preview. */
  lookup(input: PreRegistrationLookupRequest): Promise<PreRegistrationLookupResult>;
  /** POST /…/{id}/claim — claim the record, returning its full pre-fill details. */
  claim(input: ClaimPreRegistrationRequest): Promise<ClaimPreRegistrationResponse>;
}
