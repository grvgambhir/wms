// Registration status lifecycle (REG-11). A PURE state machine over JourneyEntryStatus —
// no React Native / storage imports, so it lifts into the shared domain package unchanged
// (REV-025/D7). It defines the legal transitions (with the actor allowed to make each),
// the forward "spine" used to draw the participant timeline, and small guards the
// repository uses to reject illegal moves. Existing flows (saveEntry/pay/waitlist) already
// move the entry along the spine; this adds the explicit participant/admin actions
// (withdraw, cancel, disqualify, substitute, reinstate) and the governance around them.
import type { JourneyEntryStatus } from '../../domain/models/registrationJourney';

export type TransitionActor = 'participant' | 'admin' | 'system';

/** How a status reads on the timeline / which colour it takes. */
export type StatusKind = 'progress' | 'branch' | 'success' | 'terminal_bad' | 'terminal_neutral';

export type StatusTransition = {
  to: JourneyEntryStatus;
  actor: TransitionActor;
  /** Stable action verb (also the copy-key suffix + idempotency-key fragment). */
  action: string;
};

/** Presentation kind per status (colour + terminal-ness on the timeline). */
export const STATUS_KIND: Record<JourneyEntryStatus, StatusKind> = {
  draft: 'progress',
  pending_evidence: 'progress',
  pending_team: 'progress',
  pending_payment: 'progress',
  waitlisted: 'branch',
  confirmed: 'success',
  cancelled: 'terminal_bad',
  substituted: 'terminal_neutral',
  withdrawn: 'terminal_bad',
  disqualified: 'terminal_bad',
};

/** The forward milestones drawn on the participant timeline, in order. Conditional
 *  stages (evidence, team) are filtered per entry by `spineForEntry`. */
export const PROGRESS_SPINE: JourneyEntryStatus[] = [
  'draft',
  'pending_evidence',
  'pending_team',
  'pending_payment',
  'confirmed',
];

/** Truly final states — no further participant action, only an admin reinstate. */
const TERMINAL: ReadonlySet<JourneyEntryStatus> = new Set([
  'cancelled',
  'substituted',
  'withdrawn',
  'disqualified',
]);

/** Legal transitions out of each status, with the actor permitted to make them. */
export const TRANSITIONS: Record<JourneyEntryStatus, StatusTransition[]> = {
  draft: [
    { to: 'pending_evidence', actor: 'system', action: 'submit_evidence' },
    { to: 'pending_team', actor: 'system', action: 'submit_team' },
    { to: 'pending_payment', actor: 'system', action: 'submit' },
    { to: 'waitlisted', actor: 'system', action: 'waitlist' },
    { to: 'withdrawn', actor: 'participant', action: 'withdraw' },
    { to: 'cancelled', actor: 'admin', action: 'cancel' },
  ],
  pending_evidence: [
    { to: 'pending_payment', actor: 'system', action: 'evidence_approved' },
    { to: 'draft', actor: 'system', action: 'reconfigure' },
    { to: 'withdrawn', actor: 'participant', action: 'withdraw' },
    { to: 'cancelled', actor: 'admin', action: 'cancel' },
  ],
  pending_team: [
    { to: 'pending_payment', actor: 'system', action: 'team_complete' },
    { to: 'draft', actor: 'system', action: 'reconfigure' },
    { to: 'substituted', actor: 'admin', action: 'substitute' },
    { to: 'withdrawn', actor: 'participant', action: 'withdraw' },
    { to: 'cancelled', actor: 'admin', action: 'cancel' },
  ],
  pending_payment: [
    { to: 'confirmed', actor: 'system', action: 'paid' },
    { to: 'waitlisted', actor: 'system', action: 'waitlist' },
    // A reviewer can reject evidence after the entry already moved past the gate.
    { to: 'pending_evidence', actor: 'system', action: 'evidence_rejected' },
    { to: 'draft', actor: 'system', action: 'reconfigure' },
    { to: 'withdrawn', actor: 'participant', action: 'withdraw' },
    { to: 'cancelled', actor: 'admin', action: 'cancel' },
  ],
  waitlisted: [
    { to: 'pending_payment', actor: 'system', action: 'offer_claimed' },
    { to: 'draft', actor: 'system', action: 'reconfigure' },
    { to: 'withdrawn', actor: 'participant', action: 'withdraw' },
    { to: 'cancelled', actor: 'admin', action: 'cancel' },
  ],
  confirmed: [
    { to: 'withdrawn', actor: 'participant', action: 'withdraw' },
    { to: 'substituted', actor: 'admin', action: 'substitute' },
    { to: 'disqualified', actor: 'admin', action: 'disqualify' },
    { to: 'cancelled', actor: 'admin', action: 'cancel' },
  ],
  // Terminal states — only an admin reinstate reopens them.
  cancelled: [{ to: 'draft', actor: 'admin', action: 'reinstate' }],
  substituted: [{ to: 'draft', actor: 'admin', action: 'reinstate' }],
  withdrawn: [{ to: 'draft', actor: 'admin', action: 'reinstate' }],
  disqualified: [{ to: 'confirmed', actor: 'admin', action: 'reinstate' }],
};

export function isTerminal(status: JourneyEntryStatus): boolean {
  return TERMINAL.has(status);
}

/** The transition record from `from`→`to`, or undefined if that move is illegal. */
export function transitionFor(
  from: JourneyEntryStatus,
  to: JourneyEntryStatus,
): StatusTransition | undefined {
  return TRANSITIONS[from].find((t) => t.to === to);
}

export function canTransition(from: JourneyEntryStatus, to: JourneyEntryStatus): boolean {
  return transitionFor(from, to) !== undefined;
}

/** Legal transitions out of `from`, optionally filtered to a single actor. */
export function allowedTransitions(
  from: JourneyEntryStatus,
  actor?: TransitionActor,
): StatusTransition[] {
  const all = TRANSITIONS[from];
  return actor ? all.filter((t) => t.actor === actor) : all;
}

/** Timeline milestones relevant to THIS entry (drops evidence/team when they don't apply). */
export function spineForEntry(requiresEvidence: boolean, isTeamEntry: boolean): JourneyEntryStatus[] {
  return PROGRESS_SPINE.filter((status) => {
    if (status === 'pending_evidence') return requiresEvidence;
    if (status === 'pending_team') return isTeamEntry;
    return true;
  });
}

/** Index of a status on the forward spine, or -1 for branch/terminal states. */
export function spineIndex(spine: JourneyEntryStatus[], status: JourneyEntryStatus): number {
  return spine.indexOf(status);
}
