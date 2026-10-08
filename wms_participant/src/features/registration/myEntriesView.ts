// Pure helpers for My Entries and Register — kept out of the screens so they can be tested
// without rendering.
import type { JourneyEntryStatus } from '@/domain/models/registrationJourney';
import { RepositoryError } from '@/data/errors/repositoryError';
import type { CopyDict } from '@/i18n';

export type EntryNextStep = {
  route: '/sport-entry' | '/eligibility-evidence' | '/checkout' | '/waitlist' | '/registration-status';
  labelKey: keyof Pick<
    CopyDict,
    | 'myEntriesNextComplete'
    | 'myEntriesNextEvidence'
    | 'myEntriesNextPay'
    | 'myEntriesNextWaitlist'
    | 'myEntriesNextView'
  >;
};

/** Where an entry goes when tapped, by the status the backend reports. */
export function nextStepFor(status: string): EntryNextStep {
  switch (status as JourneyEntryStatus) {
    case 'draft':
    case 'pending_team':
      return { route: '/sport-entry', labelKey: 'myEntriesNextComplete' };
    case 'pending_evidence':
      return { route: '/eligibility-evidence', labelKey: 'myEntriesNextEvidence' };
    case 'pending_payment':
      return { route: '/checkout', labelKey: 'myEntriesNextPay' };
    case 'waitlisted':
      return { route: '/waitlist', labelKey: 'myEntriesNextWaitlist' };
    default:
      return { route: '/registration-status', labelKey: 'myEntriesNextView' };
  }
}

export type CreateEntryOutcome =
  | { kind: 'open_existing'; entryId: string }
  | { kind: 'go_profile'; message: string }
  | { kind: 'message'; message: string };

/** Turns a `POST /v1/me/entries` refusal into what the Register screen should do. */
export function createEntryOutcome(error: unknown, copy: CopyDict): CreateEntryOutcome {
  if (error instanceof RepositoryError) {
    const existing = error.fields?.entryId;
    if (error.code === 'DUPLICATE_ENTRY' && existing) return { kind: 'open_existing', entryId: existing };
    if (error.code === 'CONSENT_REQUIRED') return { kind: 'go_profile', message: copy.registerErrorConsent };
    if (error.code === 'PROFILE_INCOMPLETE') return { kind: 'go_profile', message: copy.registerErrorProfile };
    if (error.code === 'CATEGORY_NOT_ELIGIBLE') return { kind: 'message', message: copy.registerErrorNotEligible };
    if (error.code === 'EVENT_UNAVAILABLE') return { kind: 'message', message: copy.registerErrorClosed };
  }
  return { kind: 'message', message: copy.registerErrorGeneric };
}
