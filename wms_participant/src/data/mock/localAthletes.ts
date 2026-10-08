import type { AthleteProfile } from '@/domain/models/athlete';
import { fixtures } from '@/data/mock/fixtures';
import { getJson, setJson } from '@/data/storage/asyncStorage';
import { storageKeys } from '@/data/storage/keys';

type LocalAthleteStore = Record<string, AthleteProfile>;

const HARPER_EMAILS = new Set(['daniel.harper@email.com', 'daniel.harper@example.com']);

async function readLocalAthletes(): Promise<LocalAthleteStore> {
  return (await getJson<LocalAthleteStore>(storageKeys.localAthletes)) ?? {};
}

/** POC athletes created via Sign Up — stored locally, not in JSON fixtures. */
export async function upsertLocalAthlete(profile: AthleteProfile): Promise<void> {
  const store = await readLocalAthletes();
  store[profile.id] = profile;
  await setJson(storageKeys.localAthletes, store);
}

export async function getLocalAthlete(id: string): Promise<AthleteProfile | null> {
  const store = await readLocalAthletes();
  return store[id] ?? null;
}

export async function findLocalAthleteByEmail(email: string): Promise<AthleteProfile | null> {
  const normalized = email.trim().toLowerCase();
  const store = await readLocalAthletes();
  return Object.values(store).find((athlete) => athlete.email.trim().toLowerCase() === normalized) ?? null;
}

/** Fill blank override fields from the fixture athlete of the same id (A07 mockup prefill). */
export function mergeAthleteProfile(
  primary: AthleteProfile | null,
  fallback: AthleteProfile | null,
): AthleteProfile | null {
  if (!primary) return fallback;
  if (!fallback) return primary;

  const hasEmergency = Boolean(primary.emergencyContact?.name && primary.emergencyContact?.phone);

  return {
    ...fallback,
    ...primary,
    phone: primary.phone || fallback.phone,
    gender: primary.gender || fallback.gender,
    passportNumber: primary.passportNumber || fallback.passportNumber,
    profileImageKey: primary.profileImageKey || fallback.profileImageKey,
    profileImageUri: primary.profileImageUri || fallback.profileImageUri,
    emergencyContact: hasEmergency ? primary.emergencyContact : fallback.emergencyContact,
  };
}

export function findFixtureAthleteByEmail(email: string): AthleteProfile | undefined {
  const normalized = email.trim().toLowerCase();
  if (HARPER_EMAILS.has(normalized)) {
    return fixtures.athletes.find((athlete) => athlete.id === 'athlete_daniel_harper');
  }
  return fixtures.athletes.find((athlete) => athlete.email.trim().toLowerCase() === normalized);
}

export async function resolveAthleteIdForIdentifier(identifier: string): Promise<string | null> {
  const fixture = findFixtureAthleteByEmail(identifier);
  if (fixture) return fixture.id;

  const local = await findLocalAthleteByEmail(identifier);
  return local?.id ?? null;
}
