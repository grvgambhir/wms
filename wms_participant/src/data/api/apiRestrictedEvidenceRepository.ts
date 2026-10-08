/**
 * HTTP client for restricted evidence against wms_backend.
 * MockRestrictedEvidenceRepository stays as the offline fallback.
 * Restricted records never pass through the ordinary evidence routes.
 */
import { backendRequest } from '@/data/api/wmsBackend';
import { isNetworkError } from '@/auth/me';
import type { PaginatedResponse } from '@/domain/models/api';
import type {
  DecideRestrictedEvidenceRequest,
  ListRestrictedEvidenceRequest,
  RestrictedEvidence,
  RestrictedEvidenceMutationResponse,
  ReviewRestrictedEvidenceRequest,
  UploadRestrictedEvidenceRequest,
} from '@/domain/models/restrictedEvidence';
import type { RestrictedEvidenceRepository } from '@/domain/repositories/restrictedEvidence.repository';

export class ApiRestrictedEvidenceRepository implements RestrictedEvidenceRepository {
  constructor(private readonly fallback: RestrictedEvidenceRepository) {}

  async list(input: ListRestrictedEvidenceRequest): Promise<PaginatedResponse<RestrictedEvidence>> {
    const params = new URLSearchParams({
      registrationEntryId: input.registrationEntryId,
      sportEntryProductId: input.sportEntryProductId,
    });
    try {
      return await backendRequest<PaginatedResponse<RestrictedEvidence>>(
        `/v1/restricted-evidence?${params}`,
      );
    } catch {
      return this.fallback.list(input);
    }
  }

  async upload(input: UploadRestrictedEvidenceRequest): Promise<RestrictedEvidenceMutationResponse> {
    try {
      return await backendRequest<RestrictedEvidenceMutationResponse>(
        `/v1/restricted-evidence/${encodeURIComponent(input.evidenceId)}/uploads`,
        {
          method: 'POST',
          body: JSON.stringify({
            fileName: input.fileName,
            mimeType: input.mimeType,
            fileSizeBytes: input.fileSizeBytes,
          }),
          idempotencyKey: input.idempotencyKey,
        },
      );
    } catch (err) {
      if (isNetworkError(err)) return this.fallback.upload(input);
      throw err;
    }
  }

  async startReview(
    input: ReviewRestrictedEvidenceRequest,
  ): Promise<RestrictedEvidenceMutationResponse> {
    try {
      return await backendRequest<RestrictedEvidenceMutationResponse>(
        `/v1/restricted-evidence/${encodeURIComponent(input.evidenceId)}/review`,
        { method: 'POST', body: JSON.stringify({}), idempotencyKey: input.idempotencyKey },
      );
    } catch (err) {
      if (isNetworkError(err)) return this.fallback.startReview(input);
      throw err;
    }
  }

  async decide(input: DecideRestrictedEvidenceRequest): Promise<RestrictedEvidenceMutationResponse> {
    try {
      return await backendRequest<RestrictedEvidenceMutationResponse>(
        `/v1/restricted-evidence/${encodeURIComponent(input.evidenceId)}/decisions`,
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
