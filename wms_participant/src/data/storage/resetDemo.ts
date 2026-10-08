import { clearAll } from '@/data/storage/asyncStorage';

/** Clears persisted POC state (auth, drafts, payments, etc.). */
export async function resetDemoState(): Promise<void> {
  await clearAll();
}
