/**
 * HTTP client for ordinary evidence against wms_backend.
 * MockEvidenceRepository stays as the offline fallback.
 */
import { backendRequest } from '@/data/api/wmsBackend';
import { isNetworkError } from '@/auth/me';
import type { PaginatedResponse } from '@/domain/models/api';
import type {
  DecideEvidenceRequest,
  EligibilityEvidence,
  EvidenceMutationResponse,
  ListEvidenceRequest,
  ReviewEvidenceRequest,
  UploadEvidenceRequest,
} from '@/domain/models/evidence';
import type { EvidenceRepository } from '@/domain/repositories/evidence.repository';

export class ApiEvidenceRepository implements EvidenceRepository {
  constructor(private readonly fallback: EvidenceRepository) {}

  async list(input: ListEvidenceRequest): Promise<PaginatedResponse<EligibilityEvidence>> {
    const params = new URLSearchParams({ sportEntryProductId: input.sportEntryProductId });
    try {
      return await backendRequest<PaginatedResponse<EligibilityEvidence>>(
        `/v1/registration-entries/${encodeURIComponent(input.registrationEntryId)}/evidence?${params}`,
      );
    } catch {
      return this.fallback.list(input);
    }
  }

  async upload(input: UploadEvidenceRequest): Promise<EvidenceMutationResponse<EligibilityEvidence>> {
    try {
      return await backendRequest<EvidenceMutationResponse<EligibilityEvidence>>(
        `/v1/evidence/${encodeURIComponent(input.evidenceId)}/uploads`,
        {
          method: 'POST',
          body: JSON.stringify({
            fileName: input.fileName,
            mimeType: input.mimeType,
            fileSizeBytes: input.fileSizeBytes,
            declaredAttribute: input.declaredAttribute,
          }),
          idempotencyKey: input.idempotencyKey,
        },
      );
    } catch (err) {
      if (isNetworkError(err)) return this.fallback.upload(input);
      throw err;
    }
  }

  async startReview(input: ReviewEvidenceRequest): Promise<EvidenceMutationResponse<EligibilityEvidence>> {
    try {
      return await backendRequest<EvidenceMutationResponse<EligibilityEvidence>>(
        `/v1/evidence/${encodeURIComponent(input.evidenceId)}/review`,
        { method: 'POST', body: JSON.stringify({}), idempotencyKey: input.idempotencyKey },
      );
    } catch (err) {
      if (isNetworkError(err)) return this.fallback.startReview(input);
      throw err;
    }
  }

  async decide(input: DecideEvidenceRequest): Promise<EvidenceMutationResponse<EligibilityEvidence>> {
    try {
      return await backendRequest<EvidenceMutationResponse<EligibilityEvidence>>(
        `/v1/evidence/${encodeURIComponent(input.evidenceId)}/decisions`,
        {
          method: 'POST',
          body: JSON.stringify({ decision: input.decision, reason: input.reason }),
          idempotencyKey: input.idempotencyKey,
        },
      );
    } catch (err) {
      if (isNetworkError(err)) return this.fallback.decide(input);
      throw err;
    }
  }
}
