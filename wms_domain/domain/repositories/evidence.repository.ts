import type { PaginatedResponse } from '../models/api';
import type {
  DecideEvidenceRequest,
  EligibilityEvidence,
  EvidenceMutationResponse,
  ListEvidenceRequest,
  ReviewEvidenceRequest,
  UploadEvidenceRequest,
} from '../models/evidence';

/** Ordinary-data REST boundary. Restricted records never pass through it. */
export interface EvidenceRepository {
  /** GET /registration-entries/{entryId}/evidence */
  list(input: ListEvidenceRequest): Promise<PaginatedResponse<EligibilityEvidence>>;
  /** POST /evidence/{evidenceId}/uploads */
  upload(input: UploadEvidenceRequest): Promise<EvidenceMutationResponse<EligibilityEvidence>>;
  /** POST /evidence/{evidenceId}/review */
  startReview(input: ReviewEvidenceRequest): Promise<EvidenceMutationResponse<EligibilityEvidence>>;
  /** POST /evidence/{evidenceId}/decisions */
  decide(input: DecideEvidenceRequest): Promise<EvidenceMutationResponse<EligibilityEvidence>>;
}
