import { getAllKeys, removeMany } from '@/data/storage/asyncStorage';
import { storageKeys } from '@/data/storage/keys';

const DRAFT_PREFIX = 'imga.registration.draft.';

/**
 * Tester helper only — not athlete cancel/deregister (out of POC product scope).
 * Keeps login + profile. Clears drafts, submitted registrations, partner requests, payments.
 * Document *uploads* in storage are cleared; Harper’s fixture files still load from JSON.
 */
export async function resetRegistrationDemoKeepSession(): Promise<void> {
  const keys = await getAllKeys();
  const draftKeys = keys.filter((key) => key.startsWith(DRAFT_PREFIX));

  await removeMany([
    ...draftKeys,
    storageKeys.registrations,
    storageKeys.partnerRequests,
    storageKeys.documents,
    storageKeys.payments,
  ]);
}
