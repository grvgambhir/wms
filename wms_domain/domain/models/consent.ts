// Participant consent records (P06 — PLT-07 / PRV-02). Each notice is independently
// grantable/withdrawable, with a policy version + timestamp so lawful-basis history
// is visible on screen. Backend-adaptable (§6.6): plain JSON DTOs; UUID ids; ISO-8601.
import type { PaginatedResponse } from './api';

/** Stable Como demo participant (Daniel Harper) — same UUID as data-hub athletes.json. */
export const COMO_DEMO_PARTICIPANT_ID = '693edf31-739e-4f28-96c4-202700000001';

export type ConsentKind =
  | 'terms_and_conditions'
  | 'privacy_policy'
  | 'eligibility_medical_evidence'
  | 'photo_media_accreditation'
  | 'marketing_communications';

export type ConsentStatus = 'granted' | 'withdrawn';

export type ConsentRecord = {
  id: string;
  participantId: string;
  kind: ConsentKind;
  /** Required notices must be granted before registration can complete. */
  required: boolean;
  /** True for eligibility/medical processing — explicit opt-in (PRV-02). */
  sensitive: boolean;
  status: ConsentStatus;
  /** Policy artefact version string, e.g. "T&C v1.2" — fixture/API content, not i18n. */
  policyVersion: string;
  updatedAt: string;
  grantedAt?: string;
  withdrawnAt?: string;
};

export type ConsentListResponse = PaginatedResponse<ConsentRecord>;

/** POST /consents/{id}/grant and POST /consents/{id}/withdraw. */
export type ConsentActionRequest = {
  consentId: string;
  idempotencyKey: string;
};

export type ConsentActionResponse = {
  record: ConsentRecord;
};
