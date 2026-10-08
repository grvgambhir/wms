import type { Registration, RegistrationDraft, RegistrationFeeConfig } from '../models/registration';

export interface RegistrationRepository {
  getDraft(eventId: string): Promise<RegistrationDraft | null>;
  saveDraft(draft: RegistrationDraft): Promise<void>;
  submitRegistration(draft: RegistrationDraft): Promise<Registration>;
  getRegistration(id: string): Promise<Registration | null>;
  getRegistrationByEvent(eventId: string, athleteId: string): Promise<Registration | null>;
  updateRegistrationStatus(id: string, status: Registration['status']): Promise<Registration>;
  getFeeConfig(eventId: string): Promise<RegistrationFeeConfig | null>;
}
