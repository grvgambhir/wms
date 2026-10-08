// Reset the Como Lake 2027 demo to a clean replay. The DURABLE demo artifacts are the
// published rule-change notice (A04 -> P19) and the live registration-journey state
// (save & resume: entries/orders/payments survive a reload). Everything else lives
// in-memory in the mock repositories and re-seeds on a page load. So a reset = clear
// those persisted keys + reload. The selected language is kept.
import { removeMany } from '@/data/storage/asyncStorage';
import { storageKeys } from '@/data/storage/keys';

export async function resetComoDemo(): Promise<void> {
  // These keys are leftover from the AsyncStorage mock. Journey + rule notices now
  // persist on wms_api (`data/db.json`); delete that file and restart the API to re-seed.
  await removeMany([storageKeys.ruleChangeNotice, storageKeys.registrationJourney]);
  // Web: a reload re-instantiates the singleton repositories from their seed fixtures.
  if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
    window.location.reload();
  }
}
