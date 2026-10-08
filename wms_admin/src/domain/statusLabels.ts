// Locale-ready labels for REG-11 status + admin actions. Ported from the Expo helper.
import type { JourneyEntryStatus } from './registrationJourney';

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
  govActionCancel: string;
  govActionDisqualify: string;
  govActionSubstitute: string;
  govActionReinstate: string;
};

export const GOVERNANCE_COPY = {
  govTitle: 'Registration lifecycle (governance)',
  govSubtitle: 'Act on the live participant entry — the same governed record.',
  govCurrentStatus: 'Current status',
  govLiveTag: 'Live · one record',
  govLocalTag: 'Local fallback · backend unreachable',
  govNoEntry: 'No live entry to govern.',
  govNoActions: 'No admin actions available in this state.',
  govToastDone: 'Entry updated',
  govError: 'Could not update this entry.',
  loading: 'Loading...',
  statusLabelDraft: 'Draft',
  statusLabelPendingEvidence: 'Pending evidence',
  statusLabelPendingTeam: 'Pending team',
  statusLabelPendingPayment: 'Pending payment',
  statusLabelWaitlisted: 'Waitlisted',
  statusLabelConfirmed: 'Confirmed',
  statusLabelCancelled: 'Cancelled',
  statusLabelSubstituted: 'Substituted',
  statusLabelWithdrawn: 'Withdrawn',
  statusLabelDisqualified: 'Disqualified',
  govActionCancel: 'Cancel entry',
  govActionDisqualify: 'Disqualify',
  govActionSubstitute: 'Mark substituted',
  govActionReinstate: 'Reinstate',
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

export function actionLabel(copy: StatusCopy, action: string): string {
  switch (action) {
    case 'cancel':
      return copy.govActionCancel;
    case 'disqualify':
      return copy.govActionDisqualify;
    case 'substitute':
      return copy.govActionSubstitute;
    case 'reinstate':
      return copy.govActionReinstate;
    default:
      return action;
  }
}
