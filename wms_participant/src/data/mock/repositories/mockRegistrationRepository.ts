import { DEMO_IDS } from '@/constants/demo';
import type { Registration, RegistrationDraft, RegistrationFeeConfig } from '@/domain/models/registration';
import type { RegistrationRepository } from '@/domain/repositories/registration.repository';
import { fixtures } from '@/data/mock/fixtures';
import { getJson, setJson } from '@/data/storage/asyncStorage';
import { storageKeys } from '@/data/storage/keys';

type RegistrationStore = Record<string, Registration>;

async function readRegistrations(): Promise<RegistrationStore> {
  return (await getJson<RegistrationStore>(storageKeys.registrations)) ?? {};
}

export class MockRegistrationRepository implements RegistrationRepository {
  async getDraft(eventId: string): Promise<RegistrationDraft | null> {
    return getJson<RegistrationDraft>(storageKeys.registrationDraft(eventId));
  }

  async saveDraft(draft: RegistrationDraft): Promise<void> {
    await setJson(storageKeys.registrationDraft(draft.eventId), {
      ...draft,
      updatedAt: new Date().toISOString(),
    });
  }

  async submitRegistration(draft: RegistrationDraft): Promise<Registration> {
    if (!draft.sportId || !draft.disciplineId || !draft.categoryId) {
      throw new Error('Registration draft is incomplete');
    }

    const registration: Registration = {
      id: DEMO_IDS.registrationDemo,
      athleteId: draft.athleteId,
      eventId: draft.eventId,
      sportId: draft.sportId,
      disciplineId: draft.disciplineId,
      categoryId: draft.categoryId,
      partnerAthleteId: draft.partnerAthleteId,
      documentIds: draft.documentIds,
      status: 'under_review',
      submittedAt: new Date().toISOString(),
    };

    const store = await readRegistrations();
    store[registration.id] = registration;
    await setJson(storageKeys.registrations, store);
    return registration;
  }

  async getRegistration(id: string): Promise<Registration | null> {
    const store = await readRegistrations();
    return store[id] ?? null;
  }

  async getRegistrationByEvent(eventId: string, athleteId: string): Promise<Registration | null> {
    const store = await readRegistrations();
    return Object.values(store).find((r) => r.eventId === eventId && r.athleteId === athleteId) ?? null;
  }

  async updateRegistrationStatus(id: string, status: Registration['status']): Promise<Registration> {
    const store = await readRegistrations();
    const existing = store[id];
    if (!existing) throw new Error('Registration not found');

    const updated: Registration = {
      ...existing,
      status,
      approvedAt: status === 'approved' ? new Date().toISOString() : existing.approvedAt,
    };

    store[id] = updated;
    await setJson(storageKeys.registrations, store);
    return updated;
  }

  async getFeeConfig(eventId: string): Promise<RegistrationFeeConfig | null> {
    return fixtures.registrationFees.find((fee) => fee.eventId === eventId) ?? null;
  }
}
