// Eligibility exception review repository contract (A02 — WS-D). The review queue reads
// its cases and records approve/reject decisions through this seam only; the API
// implementation swaps in without changing hooks/UI (§6.6).
import type {
  ApproveExceptionRequest,
  EligibilityException,
  ExceptionsOverview,
  RejectExceptionRequest,
} from '../models/exceptions';

export interface ExceptionsRepository {
  /** GET /exceptions — the review queue with each case's checks and signatures. */
  getOverview(): Promise<ExceptionsOverview>;
  /** POST /exceptions/:id/approve — add one reviewer signature (dual control on high impact). */
  approveException(input: ApproveExceptionRequest): Promise<EligibilityException>;
  /** POST /exceptions/:id/reject — reject with a coded reason. */
  rejectException(input: RejectExceptionRequest): Promise<EligibilityException>;
}
