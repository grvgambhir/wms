import type {
  AssistedMutationResponse,
  AssistedRegistrationOverview,
  PerformProxyActionInput,
  RecordProxyConsentInput,
} from '../domain/assistedRegistration';

export interface AssistedRegistrationRepository {
  getOverview(): Promise<AssistedRegistrationOverview>;
  recordConsent(input: RecordProxyConsentInput): Promise<AssistedMutationResponse>;
  performProxyAction(input: PerformProxyActionInput): Promise<AssistedMutationResponse>;
}
