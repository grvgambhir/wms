import { DEMO_IDS } from '@/constants/demo';
import type { Accreditation } from '@/domain/models/accreditation';
import type { AccreditationRecord } from '@/domain/models/accreditationDesk';
import deskRecordsJson from '@/data/mock/fixtures/data-hub/accreditations.json';
import type { Registration } from '@/domain/models/registration';
import type { AccreditationRepository } from '@/domain/repositories/accreditation.repository';
import { fixtures } from '@/data/mock/fixtures';
import { getJson } from '@/data/storage/asyncStorage';
import { storageKeys } from '@/data/storage/keys';

export class MockAccreditationRepository implements AccreditationRepository {
  async getAccreditation(registrationId: string): Promise<Accreditation | null> {
    return fixtures.accreditations.find((item) => item.registrationId === registrationId) ?? null;
  }

  async issueAccreditation(registrationId: string): Promise<Accreditation> {
    const existing = await this.getAccreditation(registrationId);
    if (existing) return existing;

    const store = (await getJson<Record<string, Registration>>(storageKeys.registrations)) ?? {};
    const registration = store[registrationId];
    if (!registration) {
      throw new Error('Registration not found for accreditation');
    }

    const event = fixtures.events.find((item) => item.id === registration.eventId);

    return {
      id: DEMO_IDS.accreditationDemo,
      registrationId,
      athleteId: registration.athleteId,
      eventId: registration.eventId,
      badgeNumber: `WMG-KANSAI-2027-${registrationId.replace(/\D/g, '').slice(-6).padStart(6, '0')}`,
      qrValue: DEMO_IDS.accreditationDemo,
      accessLevel: 'Athlete',
      validFrom: event?.startDate ?? '2026-09-11',
      validUntil: event?.endDate ?? '2026-10-03',
      status: 'issued',
    };
  }

  /** Offline counterpart of the wms_api read — same record the desk fixture holds. */
  async getPassForAthlete(athleteId: string): Promise<AccreditationRecord | null> {
    const seed = deskRecordsJson as unknown as { items: AccreditationRecord[] };
    return seed.items.find((record) => record.athleteId === athleteId) ?? null;
  }
}
