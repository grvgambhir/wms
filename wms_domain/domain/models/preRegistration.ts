// Participant claim / pre-registration domain (P03 — REG-13). Como Lake 2027 migrates
// ~15k legacy expression-of-interest (EOI) records; a participant "claims" their existing
// pre-registration to activate an account, carrying the pre-filled details forward.
// Backend-adaptable (§6.6): plain JSON DTOs; lookup -> GET, claim -> POST /…/claim.
// A privacy-masked PREVIEW is returned before the claim so whoever typed a reference sees
// only enough to recognise "is this me?" — full PII is revealed only on a successful claim.
import type { PaginatedResponse } from './api';

export type PreRegistrationStatus = 'unclaimed' | 'claimed';

/** A migrated legacy EOI record (the full server-side row). */
export type PreRegistrationRecord = {
  id: string;
  /** Human-facing claim code, e.g. "COMO27-EOI-0001". */
  reference: string;
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: string;
  nationalityCountryCode: string;
  /** Sports the participant expressed interest in — carried into the new account. */
  intendedSports: string[];
  /** Provenance of the migrated row (dedup/audit — REG-13). */
  sourceList: string;
  status: PreRegistrationStatus;
  migratedAt: string;
  claimedAt?: string;
};

/** Privacy-masked identity preview shown before the participant confirms + claims (PRV). */
export type PreRegistrationPreview = {
  id: string;
  reference: string;
  /** e.g. "D••• H•••" — enough to recognise, not to harvest. */
  maskedName: string;
  /** e.g. "d••••@example.com". */
  maskedEmail: string;
  /** Coarse birth year only (not the full date of birth). */
  birthYear: number;
  nationalityCountryCode: string;
  intendedSports: string[];
  status: PreRegistrationStatus;
};

export type PreRegistrationLookupRequest = {
  /** A claim reference or the email on the pre-registration. */
  query: string;
};

/** Discriminated outcome so the screen renders match / already-claimed / not-found cleanly. */
export type PreRegistrationLookupResult =
  | { outcome: 'found'; preview: PreRegistrationPreview }
  | { outcome: 'already_claimed'; preview: PreRegistrationPreview }
  | { outcome: 'not_found' };

export type ClaimPreRegistrationRequest = {
  recordId: string;
  /** Guards against a double-claim (retry / double-tap) — same key returns the same result. */
  idempotencyKey: string;
};

export type ClaimPreRegistrationResponse = {
  /** The now-claimed record with full details, ready to pre-fill the profile. */
  record: PreRegistrationRecord;
  /** True when the record was already claimed (idempotent replay), false on a fresh claim. */
  alreadyClaimed: boolean;
};

/** Fixture shape for the seeded EOI list. */
export type PreRegistrationSeed = PaginatedResponse<PreRegistrationRecord>;
