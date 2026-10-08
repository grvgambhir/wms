import { getAccessToken } from './accessToken';
import { backendRequest } from '@/data/api/wmsBackend';
import { RepositoryError } from '@/data/errors/repositoryError';

export type EmergencyContactPayload = {
  ordinal: number;
  name: string;
  phone: string;
  relationship?: string;
};

export type ProfilePatchBody = {
  givenName: string;
  familyName: string;
  dateOfBirth: string;
  nationality?: string;
  gender?: string;
  phone?: string;
  locale?: 'en' | 'it';
  emergencyContacts: EmergencyContactPayload[];
};

export type MeProfile = {
  id: string;
  email: string | null;
  givenName: string;
  familyName: string;
  dateOfBirth: string;
  nationality: string | null;
  gender: string | null;
  phone: string | null;
  locale: string | null;
  profileStatus: 'placeholder' | 'complete';
  roles: string[];
  emergencyContacts: Array<{
    ordinal: number;
    name: string;
    relationship: string | null;
    phone: string;
  }>;
  mfa?: {
    enrolled: boolean;
    enforcementActive: boolean;
    enrolledOcAdminCount: number;
  };
};

export function isUnauthorized(err: unknown): boolean {
  return err instanceof RepositoryError && err.code === 'UNAUTHORIZED';
}

export function isNetworkError(err: unknown): boolean {
  return err instanceof RepositoryError && err.code === 'NETWORK_ERROR';
}

export async function fetchMe(): Promise<MeProfile> {
  return backendRequest<MeProfile>('/v1/me');
}

export async function patchMeProfile(body: ProfilePatchBody, idempotencyKey: string): Promise<MeProfile> {
  return backendRequest<MeProfile>('/v1/me/profile', {
    method: 'PATCH',
    body: JSON.stringify(body),
    idempotencyKey,
  });
}

export async function completeMfa(): Promise<MeProfile> {
  return backendRequest<MeProfile>('/v1/me/mfa/complete', { method: 'POST' });
}

export async function disableMfa(): Promise<MeProfile> {
  return backendRequest<MeProfile>('/v1/me/mfa/disable', { method: 'POST' });
}

/** First authenticated call — creates the placeholder person on the Nest API. */
export async function ensureBackendPerson(): Promise<MeProfile | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    return await fetchMe();
  } catch {
    return null;
  }
}
