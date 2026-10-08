// Admin accreditation-desk domain (A03 — WS-D / P1). The OC "Accreditation Desk"
// reviews each participant's photo + eligibility, then issues a credential (badge +
// access zones + validity), and can reissue or revoke it. Distinct from the
// participant-side `Accreditation` (the digital pass) — this is the staff review view.
// Backend-adaptable (§6.6): plain JSON DTOs; getOverview -> GET, issue/reissue/revoke
// -> POST /…/{verb}. Credential is only issuable once photo AND eligibility are approved.
import type { PaginatedResponse } from './api';

export type CredentialStatus = 'pending_review' | 'issued' | 'revoked';
export type PhotoStatus = 'submitted' | 'approved' | 'rejected';
export type EligibilityStatus = 'approved' | 'pending';
/** Accreditation access zones printed on the badge (ACC / venue access control). */
export type AccessZone = 'field-of-play' | 'athlete-lounge' | 'media' | 'officials' | 'back-of-house';

export type AccreditationRecord = {
  id: string;
  /**
   * The participant account this credential belongs to, when there is one. The desk
   * accredits athletes, team officials and staff alike, and not all of them hold an
   * app account — hence optional. Where it IS set, the participant's own pass screen
   * reads the SAME record by this id, so issuing a badge at the desk is what makes it
   * appear on the athlete's pass; there is no second copy to keep in sync.
   */
  athleteId?: string;
  participantName: string;
  nationalityCountryCode: string;
  sportName: string;
  role: string;
  photoStatus: PhotoStatus;
  eligibilityStatus: EligibilityStatus;
  status: CredentialStatus;
  accessZones: AccessZone[];
  /** Assigned on issue, e.g. "COMO27-000123". */
  badgeNumber?: string;
  validFrom: string;
  validUntil: string;
  issuedAt?: string;
  revokedReason?: string;
  updatedAt: string;
};

export type AccreditationSummary = {
  pendingCount: number;
  issuedCount: number;
  revokedCount: number;
};

export type AccreditationOverview = {
  summary: AccreditationSummary;
  records: PaginatedResponse<AccreditationRecord>;
};

export type IssueCredentialRequest = { recordId: string; idempotencyKey: string };
export type RevokeCredentialRequest = { recordId: string; reason: string; idempotencyKey: string };
export type CredentialActionResponse = { record: AccreditationRecord; summary: AccreditationSummary };
