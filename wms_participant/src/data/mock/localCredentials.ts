import { getJson, setJson } from '@/data/storage/asyncStorage';
import { storageKeys } from '@/data/storage/keys';

export type StoredCredential = {
  athleteId: string;
  password: string;
};

type CredentialStore = Record<string, StoredCredential>;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function readCredentialStore(): Promise<CredentialStore> {
  return (await getJson<CredentialStore>(storageKeys.localCredentials)) ?? {};
}

/** POC local accounts — email maps to athleteId + password (device storage only). */
export async function getStoredCredential(email: string): Promise<StoredCredential | null> {
  const store = await readCredentialStore();
  return store[normalizeEmail(email)] ?? null;
}

export async function saveStoredCredential(
  email: string,
  athleteId: string,
  password: string,
): Promise<void> {
  const store = await readCredentialStore();
  store[normalizeEmail(email)] = { athleteId, password };
  await setJson(storageKeys.localCredentials, store);
}
