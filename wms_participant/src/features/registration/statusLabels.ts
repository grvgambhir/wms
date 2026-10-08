// Locale-aware labels for the REG-11 participant entry status timeline. Keys stay
// English; values resolve via useCopy(). Not in statusLifecycle.ts because that
// module is pure (no copy dictionary) so it can lift into the shared package.
import type { JourneyEntryStatus } from '@/domain/models/registrationJourney';

/** Minimal copy bag for status labels — avoids coupling to the full app i18n dictionary. */
export type StatusCopy = {
  statusLabelDraft: string;
  statusLabelPendingEvidence: string;
  statusLabelPendingTeam: string;
  statusLabelPendingPayment: string;
  statusLabelWaitlisted: string;
  statusLabelConfirmed: string;
  statusLabelCancelled: string;
  statusLabelSubstituted: string;
  statusLabelWithdrawn: string;
  statusLabelDisqualified: string;
};

export function statusLabel(copy: StatusCopy, status: JourneyEntryStatus): string {
  switch (status) {
    case 'draft':
      return copy.statusLabelDraft;
    case 'pending_evidence':
      return copy.statusLabelPendingEvidence;
    case 'pending_team':
      return copy.statusLabelPendingTeam;
    case 'pending_payment':
      return copy.statusLabelPendingPayment;
    case 'waitlisted':
      return copy.statusLabelWaitlisted;
    case 'confirmed':
      return copy.statusLabelConfirmed;
    case 'cancelled':
      return copy.statusLabelCancelled;
    case 'substituted':
      return copy.statusLabelSubstituted;
    case 'withdrawn':
      return copy.statusLabelWithdrawn;
    case 'disqualified':
      return copy.statusLabelDisqualified;
  }
}
