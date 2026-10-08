// Eligibility exception review queue (A02 — WS-D). The OC reviews a participant's
// exception request against automated eligibility checks, then approves or rejects it.
// High-impact cases need TWO distinct reviewer signatures before they flip to approved
// (dual control); standard-impact cases need one. Backend-adaptable (§6.6): plain JSON
// DTOs; getOverview -> GET, approve/reject -> POST /…/{verb}.

/** How much scrutiny a case needs — 'high' requires dual approval. */
export type ExceptionImpact = 'high' | 'standard';

export type ExceptionDecision = 'pending' | 'approved' | 'rejected';

/**
 * Display identity of a collected signature. Dual control is UNIQUE (case_id, signer_id)
 * in Postgres, not this string — two labels for the same person still collide.
 */
export type ExceptionReviewerId = string;

export type ExceptionRejectReason =
  | 'Insufficient evidence'
  | 'Does not meet criteria'
  | 'Duplicate request';

/** One automated eligibility check shown to the reviewer as supporting evidence. */
export interface EligibilityCheck {
  readonly label: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface EligibilityException {
  readonly id: string;
  readonly participant: string;
  readonly sport: string;
  readonly event: string;
  readonly impact: ExceptionImpact;
  readonly reason: string;
  /** Medical/para cases carry restricted evidence — never expose the detail (PRV-04). */
  readonly restricted?: boolean;
  readonly checks?: readonly EligibilityCheck[];
  /** Signatures collected so far; length vs impact decides when it flips to approved. */
  readonly approvers: readonly ExceptionReviewerId[];
  readonly decision: ExceptionDecision;
  readonly reasonCode?: ExceptionRejectReason;
}

export interface ExceptionsOverview {
  readonly cases: readonly EligibilityException[];
}

export interface ApproveExceptionRequest {
  readonly exceptionId: string;
  readonly reviewerId: ExceptionReviewerId;
}

export interface RejectExceptionRequest {
  readonly exceptionId: string;
  readonly reasonCode: ExceptionRejectReason;
}

/** Signatures required before a case can flip to approved (dual control on high impact). */
export function requiredSignatures(impact: ExceptionImpact): number {
  return impact === 'high' ? 2 : 1;
}
