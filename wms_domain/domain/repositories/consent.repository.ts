// Participant consent repository contract (P06 — PLT-07 / PRV-02). The profile
// screen reads the list and grants/withdraws through this seam only; the API
// implementation swaps in later with no UI change (§6.6).
import type {
  ConsentActionRequest,
  ConsentActionResponse,
  ConsentListResponse,
} from '../models/consent';

export interface ConsentRepository {
  /** GET /participants/{id}/consents — granular notices for one participant. */
  getConsents(participantId: string): Promise<ConsentListResponse>;
  /** POST /consents/{id}/grant — explicit opt-in; idempotent on the same key. */
  grantConsent(input: ConsentActionRequest): Promise<ConsentActionResponse>;
  /** POST /consents/{id}/withdraw — records withdrawal + timestamp; idempotent on the same key. */
  withdrawConsent(input: ConsentActionRequest): Promise<ConsentActionResponse>;
}
