import { backendRequest } from '../auth/backendRequest';
import type {
  AssistedMutationResponse,
  AssistedRegistrationOverview,
  PerformProxyActionInput,
  RecordProxyConsentInput,
} from '../domain/assistedRegistration';
import type { AssistedRegistrationRepository } from './AssistedRegistrationRepository';

export class ApiAssistedRegistrationRepository implements AssistedRegistrationRepository {
  constructor(private readonly fallback?: AssistedRegistrationRepository) {}

  async getOverview(): Promise<AssistedRegistrationOverview> {
    try {
      return await backendRequest<AssistedRegistrationOverview>('/v1/assisted-registration');
    } catch (caught) {
      if (this.fallback && isNetworkFailure(caught)) return this.fallback.getOverview();
      throw caught;
    }
  }

  async recordConsent(input: RecordProxyConsentInput): Promise<AssistedMutationResponse> {
    try {
      return await backendRequest<AssistedMutationResponse>('/v1/assisted-registration/consents', {
        method: 'POST',
        headers: { 'Idempotency-Key': input.idempotencyKey },
        body: JSON.stringify({
          participantId: input.participantId,
          method: input.method,
        }),
      });
    } catch (caught) {
      if (this.fallback && isNetworkFailure(caught)) return this.fallback.recordConsent(input);
      throw caught;
    }
  }

  async performProxyAction(input: PerformProxyActionInput): Promise<AssistedMutationResponse> {
    try {
      return await backendRequest<AssistedMutationResponse>('/v1/assisted-registration/actions', {
        method: 'POST',
        headers: { 'Idempotency-Key': input.idempotencyKey },
        body: JSON.stringify({
          participantId: input.participantId,
          action: input.action,
        }),
      });
    } catch (caught) {
      if (this.fallback && isNetworkFailure(caught)) return this.fallback.performProxyAction(input);
      throw caught;
    }
  }
}

function isNetworkFailure(caught: unknown): boolean {
  return caught instanceof TypeError || (caught instanceof Error && /fetch|network|ECONNREFUSED/i.test(caught.message));
}
