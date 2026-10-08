// Assisted/proxy registration repository contract (PLT-06). The future API
// implementation replaces the mock at the provider seam without changing hooks/UI.
import type {
  AssistedMutationResponse,
  AssistedRegistrationOverview,
  PerformProxyActionInput,
  RecordProxyConsentInput,
} from '../models/assistedRegistration';

export interface AssistedRegistrationRepository {
  /** GET /assisted-registration — participants, sessions and newest-first audit. */
  getOverview(): Promise<AssistedRegistrationOverview>;
  /** POST /assisted-registration/consents — capture participant authority/consent. */
  recordConsent(input: RecordProxyConsentInput): Promise<AssistedMutationResponse>;
  /** POST /assisted-registration/actions — act for a participant after consent. */
  performProxyAction(input: PerformProxyActionInput): Promise<AssistedMutationResponse>;
}
