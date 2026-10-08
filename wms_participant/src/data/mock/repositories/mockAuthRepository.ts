import { DEMO_OTP, DEMO_PASSWORD } from '@/constants/demo';
import type { AuthSession } from '@/domain/models/auth';
import type { AuthRepository, SignUpInput } from '@/domain/repositories/auth.repository';
import { getStoredCredential, saveStoredCredential } from '@/data/mock/localCredentials';
import {
  findFixtureAthleteByEmail,
  resolveAthleteIdForIdentifier,
  upsertLocalAthlete,
} from '@/data/mock/localAthletes';
import { getJson, removeItem, setJson } from '@/data/storage/asyncStorage';
import { storageKeys } from '@/data/storage/keys';

const OTP_DELAY_MS = 400;

function buildSession(athleteId: string, identifier: string): AuthSession {
  return {
    athleteId,
    identifier,
    verifiedAt: new Date().toISOString(),
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function resolveAthleteIdForAuth(identifier: string): Promise<string | null> {
  const normalized = normalizeEmail(identifier);
  const stored = await getStoredCredential(normalized);
  if (stored) return stored.athleteId;

  return resolveAthleteIdForIdentifier(normalized);
}

async function verifyPasswordForLogin(identifier: string, password: string): Promise<string> {
  const normalized = normalizeEmail(identifier);
  const stored = await getStoredCredential(normalized);

  if (stored) {
    if (password !== stored.password) {
      throw new Error('Invalid email or password');
    }
    return stored.athleteId;
  }

  const fixture = findFixtureAthleteByEmail(normalized);
  if (!fixture) {
    throw new Error('No account found for this email. Sign up first.');
  }

  if (password !== DEMO_PASSWORD) {
    throw new Error('Invalid email or password');
  }

  return fixture.id;
}

export class MockAuthRepository implements AuthRepository {
  async signInWithPassword(identifier: string, password: string): Promise<AuthSession> {
    await new Promise((resolve) => setTimeout(resolve, OTP_DELAY_MS));

    const normalized = identifier.trim();
    if (!normalized) {
      throw new Error('Enter your email');
    }

    const athleteId = await verifyPasswordForLogin(normalized, password);
    const session = buildSession(athleteId, normalized);
    await setJson(storageKeys.authSession, session);
    return session;
  }

  async signUp({ firstName, lastName, email, password }: SignUpInput): Promise<AuthSession> {
    await new Promise((resolve) => setTimeout(resolve, OTP_DELAY_MS));

    const normalized = normalizeEmail(email);
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    const existingId = await resolveAthleteIdForAuth(normalized);
    if (existingId) {
      throw new Error('An account with this email already exists. Use Log In.');
    }

    const athleteId = `athlete_signup_${Date.now()}`;
    await upsertLocalAthlete({
      id: athleteId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dateOfBirth: '',
      nationalityCountryCode: '',
      email: normalized,
    });
    await saveStoredCredential(normalized, athleteId, password);

    const session = buildSession(athleteId, normalized);
    await setJson(storageKeys.authSession, session);
    return session;
  }

  async requestOtp(identifier: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, OTP_DELAY_MS));

    const normalized = identifier.trim();
    if (!normalized) {
      throw new Error('Enter your email');
    }

    const athleteId = await resolveAthleteIdForAuth(normalized);
    if (!athleteId) {
      throw new Error('No account found for this email. Sign up first.');
    }
  }

  async verifyOtp(identifier: string, code: string): Promise<AuthSession> {
    await new Promise((resolve) => setTimeout(resolve, OTP_DELAY_MS));

    if (code !== DEMO_OTP) {
      throw new Error('Invalid verification code');
    }

    const normalized = identifier.trim();
    const athleteId = await resolveAthleteIdForAuth(normalized);
    if (!athleteId) {
      throw new Error('No account found for this email. Sign up first.');
    }

    const session = buildSession(athleteId, normalized);
    await setJson(storageKeys.authSession, session);
    return session;
  }

  async getSession(): Promise<AuthSession | null> {
    return getJson<AuthSession>(storageKeys.authSession);
  }

  async signOut(): Promise<void> {
    await removeItem(storageKeys.authSession);
  }
}
