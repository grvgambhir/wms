/**
 * HTTP client for participant pre-registration claim against wms_backend.
 * MockPreRegistrationRepository stays as the offline fallback, matching the other Api* repos.
 */
import { backendRequest } from '@/data/api/wmsBackend';
import { isNetworkError } from '@/auth/me';
import type {
  ClaimPreRegistrationRequest,
  ClaimPreRegistrationResponse,
  PreRegistrationLookupRequest,
  PreRegistrationLookupResult,
} from '@/domain/models/preRegistration';
import type { PreRegistrationRepository } from '@/domain/repositories/preRegistration.repository';

export class ApiPreRegistrationRepository implements PreRegistrationRepository {
  constructor(private readonly fallback: PreRegistrationRepository) {}

  async lookup(input: PreRegistrationLookupRequest): Promise<PreRegistrationLookupResult> {
    try {
      const query = encodeURIComponent(input.query);
      return await backendRequest<PreRegistrationLookupResult>(
        `/v1/me/pre-registrations?query=${query}`,
      );
    } catch {
      return this.fallback.lookup(input);
    }
  }

  async claim(input: ClaimPreRegistrationRequest): Promise<ClaimPreRegistrationResponse> {
    try {
      return await backendRequest<ClaimPreRegistrationResponse>(
        `/v1/me/pre-registrations/${encodeURIComponent(input.recordId)}/claim`,
        {
          method: 'POST',
          body: JSON.stringify({}),
          idempotencyKey: input.idempotencyKey,
        },
      );
    } catch (err) {
      if (isNetworkError(err)) {
        return this.fallback.claim(input);
      }
      throw err;
    }
  }
}
