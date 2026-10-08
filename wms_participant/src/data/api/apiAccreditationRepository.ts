/**
 * HTTP client for the participant's own credential record against wms_backend.
 *
 * The OC issues a badge at the admin Accreditation Desk; this read is the same
 * `core.accreditation` row, scoped to the caller so a participant never sees the desk queue.
 *
 * Only `getPassForAthlete` is served over HTTP. The legacy A16 pass methods
 * (`getAccreditation` / `issueAccreditation`) belong to the older POC id universe, so they
 * stay on the local mock rather than being faked here.
 */
import { backendRequest } from '@/data/api/wmsBackend';
import { isNetworkError } from '@/auth/me';
import type { Accreditation } from '@/domain/models/accreditation';
import type { AccreditationRecord } from '@/domain/models/accreditationDesk';
import type { AccreditationRepository } from '@/domain/repositories/accreditation.repository';
import { RepositoryError } from '@/data/errors/repositoryError';

export class ApiAccreditationRepository implements AccreditationRepository {
  constructor(private readonly fallback: AccreditationRepository) {}

  async getPassForAthlete(athleteId: string): Promise<AccreditationRecord | null> {
    try {
      return await backendRequest<AccreditationRecord>('/v1/me/accreditation');
    } catch (err) {
      if (isMissingPass(err)) return null;
      if (isNetworkError(err)) return this.fallback.getPassForAthlete(athleteId);
      throw err;
    }
  }

  async getAccreditation(registrationId: string): Promise<Accreditation | null> {
    return this.fallback.getAccreditation(registrationId);
  }

  async issueAccreditation(registrationId: string): Promise<Accreditation> {
    return this.fallback.issueAccreditation(registrationId);
  }
}

function isMissingPass(err: unknown): boolean {
  return err instanceof RepositoryError && (err.code === 'ACCREDITATION_NOT_FOUND' || err.code === 'NOT_FOUND');
}
