import type { AthleteProfile, AthleteProfileInput } from '@/domain/models/athlete';
import type { AthleteRepository } from '@/domain/repositories/athlete.repository';
import { fixtures } from '@/data/mock/fixtures';
import { getLocalAthlete, mergeAthleteProfile, upsertLocalAthlete } from '@/data/mock/localAthletes';
import { getJson } from '@/data/storage/asyncStorage';
import { storageKeys } from '@/data/storage/keys';

import hubAthletesJson from '@/data/mock/fixtures/data-hub/athletes.json';

function hubAthleteById(id: string): AthleteProfile | null {
  const row = hubAthletesJson.items.find((item) => item.id === id);
  return row ? (row as AthleteProfile) : null;
}

export class MockAthleteRepository implements AthleteRepository {
  async getCurrentProfile(): Promise<AthleteProfile | null> {
    const session = await getJson<{ athleteId: string }>(storageKeys.authSession);
    if (!session?.athleteId) return null;
    return this.getProfile(session.athleteId);
  }

  async getProfile(id: string): Promise<AthleteProfile | null> {
    const local = await getLocalAthlete(id);
    // Como data-hub UUIDs first, then the legacy A07 fixture ids.
    const fixture = hubAthleteById(id) ?? fixtures.athletes.find((athlete) => athlete.id === id) ?? null;
    // Legacy single-key override — read only for migration; new saves go to localAthletes.
    const legacyOverride = await getJson<AthleteProfile>(storageKeys.athleteProfile);
    const stored =
      local ?? (legacyOverride?.id === id ? legacyOverride : null);

    return mergeAthleteProfile(stored, fixture);
  }

  async updateProfile(input: AthleteProfileInput): Promise<AthleteProfile> {
    return this.saveProfile(input);
  }

  async saveProfile(input: AthleteProfileInput): Promise<AthleteProfile> {
    const existing = input.id ? await this.getProfile(input.id) : await this.getCurrentProfile();
    const profile: AthleteProfile = {
      id: input.id ?? existing?.id ?? fixtures.athletes[0].id,
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: input.dateOfBirth,
      nationalityCountryCode: input.nationalityCountryCode,
      gender: input.gender ?? existing?.gender,
      email: input.email,
      phone: input.phone,
      passportNumber: input.passportNumber ?? existing?.passportNumber,
      profileImageUri: input.profileImageUri ?? existing?.profileImageUri,
      profileImageKey: input.profileImageKey ?? existing?.profileImageKey,
      emergencyContact: input.emergencyContact ?? existing?.emergencyContact,
    };

    await upsertLocalAthlete(profile);
    return profile;
  }
}
