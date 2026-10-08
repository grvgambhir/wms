// Admin communications-center domain (A06 — WS-D / P1). The OC "Communications Center"
// sends segmented broadcasts (payment reminders, document requests, schedule updates)
// to participant audiences from bilingual templates, and keeps a delivery log.
// Backend-adaptable (§6.6): plain JSON DTOs; getOverview -> GET, sendBroadcast -> POST.
// Template bodies are OC-authored CONTENT (data from the future backend), not app
// chrome — they live in the fixture like other demo data, not in the copy dictionary.
import type { PaginatedResponse } from './api';

/** Delivery channel for a broadcast (mock — no real provider is wired in the POC). */
export type CommsChannel = 'email' | 'in-app' | 'both';

/** Audience segments the OC can target. Counts come from the repository (data);
 *  the human label is resolved to an i18n key in the screen (segment id -> copy). */
export type CommsAudienceId =
  | 'all-participants'
  | 'pending-payment'
  | 'incomplete-documents'
  | 'confirmed'
  | 'tennis'
  | 'rowing';

export type BroadcastStatus = 'sent' | 'sending' | 'draft';

export type AudienceSegment = {
  id: string;
  /** Live size of the segment at read time — drives the "reaches N participants" preview. */
  recipientCount: number;
};

/** A reusable, bilingual message template (EN + IT), authored by the OC. */
export type MessageTemplate = {
  id: string;
  /** Internal display name for the template picker (e.g. "Payment reminder"). */
  name: string;
  subjectEn: string;
  bodyEn: string;
  subjectIt: string;
  bodyIt: string;
  defaultAudienceId: string;
  channel: CommsChannel;
};

/** One entry in the delivery log — an immutable record of what was actually sent. */
export type CommunicationRecord = {
  id: string;
  /** Subject as sent (frozen at send time — an audit log is historical fact). */
  subject: string;
  audienceId: string;
  channel: CommsChannel;
  recipientCount: number;
  status: BroadcastStatus;
  sentAt: string;
  templateId?: string;
};

export type CommunicationsSummary = {
  /** Total broadcasts sent (delivery-log length). */
  sentCount: number;
  /** Sum of recipients reached across all sent broadcasts. */
  totalRecipients: number;
  /** Number of reusable templates available. */
  templateCount: number;
};

export type CommunicationsOverview = {
  summary: CommunicationsSummary;
  segments: AudienceSegment[];
  templates: MessageTemplate[];
  history: PaginatedResponse<CommunicationRecord>;
};

export type SendBroadcastInput = {
  templateId?: string;
  /** Resolved subject text at send time (already localized by the screen). */
  subject: string;
  audienceId: string;
  channel: CommsChannel;
  /** Guards against a double-send (retry / double-tap) — same key returns the same record. */
  idempotencyKey: string;
};

export type SendBroadcastResponse = { record: CommunicationRecord; summary: CommunicationsSummary };

/**
 * What the OC knows about one participant when deciding whether a broadcast reaches
 * them. Deliberately the few facts the audience segments are defined on — not the
 * whole entry — so this rule stays testable and portable.
 */
export type AudienceSubject = {
  /** Sport name as shown in the segment list, e.g. 'Tennis'. */
  sportName: string;
  /** REG-11 entry status. */
  entryStatus: string;
  /** Evidence gate state; anything other than 'approved'/'not_required' is incomplete. */
  evidenceStatus: string;
};

/**
 * Stored on `core.comms_audience.filter`. A new audience is a row, not a deploy.
 * Combinations are AND: every set field must match.
 */
export type CommsAudienceFilter = {
  all?: boolean;
  sport?: string;
  entryStatus?: string;
  evidenceIncomplete?: boolean;
};

export function audienceFilterFromId(audienceId: string): CommsAudienceFilter {
  switch (audienceId) {
    case 'all-participants':
      return { all: true };
    case 'confirmed':
      return { entryStatus: 'confirmed' };
    case 'pending-payment':
      return { entryStatus: 'pending_payment' };
    case 'incomplete-documents':
      return { evidenceIncomplete: true };
    default:
      return { sport: audienceId };
  }
}

/**
 * Does a broadcast sent to `audience` actually reach this participant?
 *
 * This is the single source of that rule. The admin portal uses it to say who a
 * broadcast will reach; the participant's inbox uses it to decide what to show. If the
 * two ever computed it separately they would drift, and an athlete would either miss a
 * message the OC believes was delivered or see one meant for someone else.
 *
 * `audience` may be a stored filter or a segment id. Sport ids ('tennis', 'rowing', …)
 * match `sportName` case-insensitively — that is REV-038 (a Rowing send does not
 * reach a Tennis entrant).
 */
export function audienceIncludesParticipant(
  audience: CommsAudienceId | CommsAudienceFilter | string,
  subject: AudienceSubject,
): boolean {
  const filter = typeof audience === 'string' ? audienceFilterFromId(audience) : audience;
  if (filter.all) return true;
  if (filter.sport && filter.sport.toLowerCase() !== subject.sportName.toLowerCase()) return false;
  if (filter.entryStatus && subject.entryStatus !== filter.entryStatus) return false;
  if (filter.evidenceIncomplete) {
    if (subject.evidenceStatus === 'approved' || subject.evidenceStatus === 'not_required') {
      return false;
    }
  }
  return Boolean(filter.sport || filter.entryStatus || filter.evidenceIncomplete);
}
