import type { PaginatedResponse } from '../models/api';
import type {
  DecideRestrictedEvidenceRequest,
  ListRestrictedEvidenceRequest,
  RestrictedEvidence,
  RestrictedEvidenceMutationResponse,
  ReviewRestrictedEvidenceRequest,
  UploadRestrictedEvidenceRequest,
} from '../models/restrictedEvidence';

/** PRV-04 access-controlled REST boundary with independent keys and access logs. */
export interface RestrictedEvidenceRepository {
  /** GET /restricted-evidence?registrationEntryId=... (privileged + logged) */
  list(input: ListRestrictedEvidenceRequest): Promise<PaginatedResponse<RestrictedEvidence>>;
  /** POST /restricted-evidence/{evidenceId}/uploads */
  upload(input: UploadRestrictedEvidenceRequest): Promise<RestrictedEvidenceMutationResponse>;
  /** POST /restricted-evidence/{evidenceId}/review */
  startReview(input: ReviewRestrictedEvidenceRequest): Promise<RestrictedEvidenceMutationResponse>;
  /** POST /restricted-evidence/{evidenceId}/decisions */
  decide(input: DecideRestrictedEvidenceRequest): Promise<RestrictedEvidenceMutationResponse>;
}
