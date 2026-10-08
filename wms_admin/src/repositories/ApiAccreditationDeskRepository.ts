import { backendRequest } from '../auth/backendRequest';
import type {
  AccreditationOverview,
  CredentialActionResponse,
  IssueCredentialRequest,
  RevokeCredentialRequest,
} from '../domain/accreditationDesk';
import type { AccreditationDeskRepository } from './AccreditationDeskRepository';

/**
 * Accreditation desk against wms_backend (:3050). MockAccreditationDeskRepository
 * stays as the offline fallback — its in-memory queue is what used to vanish on restart.
 */
export class ApiAccreditationDeskRepository implements AccreditationDeskRepository {
  constructor(private readonly fallback?: AccreditationDeskRepository) {}

  async getOverview(): Promise<AccreditationOverview> {
    try {
      return await backendRequest<AccreditationOverview>('/v1/accreditation-desk');
    } catch (caught) {
      if (this.fallback && isNetworkFailure(caught)) return this.fallback.getOverview();
      throw caught;
    }
  }

  async issueCredential(input: IssueCredentialRequest): Promise<CredentialActionResponse> {
    try {
      return await backendRequest<CredentialActionResponse>(
        `/v1/accreditations/${encodeURIComponent(input.recordId)}/issue`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': input.idempotencyKey },
          body: JSON.stringify({}),
        },
      );
    } catch (caught) {
      if (this.fallback && isNetworkFailure(caught)) return this.fallback.issueCredential(input);
      throw caught;
    }
  }

  async reissueCredential(input: IssueCredentialRequest): Promise<CredentialActionResponse> {
    try {
      return await backendRequest<CredentialActionResponse>(
        `/v1/accreditations/${encodeURIComponent(input.recordId)}/reissue`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': input.idempotencyKey },
          body: JSON.stringify({}),
        },
      );
    } catch (caught) {
      if (this.fallback && isNetworkFailure(caught)) return this.fallback.reissueCredential(input);
      throw caught;
    }
  }

  async revokeCredential(input: RevokeCredentialRequest): Promise<CredentialActionResponse> {
    try {
      return await backendRequest<CredentialActionResponse>(
        `/v1/accreditations/${encodeURIComponent(input.recordId)}/revoke`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': input.idempotencyKey },
          body: JSON.stringify({ reason: input.reason }),
        },
      );
    } catch (caught) {
      if (this.fallback && isNetworkFailure(caught)) return this.fallback.revokeCredential(input);
      throw caught;
    }
  }
}

function isNetworkFailure(caught: unknown): boolean {
  return caught instanceof TypeError || (caught instanceof Error && /fetch|network|ECONNREFUSED/i.test(caught.message));
}
