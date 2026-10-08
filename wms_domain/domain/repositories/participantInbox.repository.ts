// The participant's message inbox — the athlete-facing side of the admin Communications
// Center (A06). Deliberately a separate contract from CommunicationsRepository: that one
// is the OC's console (send a broadcast, read the delivery log for everyone), this one is
// a single participant reading their own mail. Keeping them apart stops a participant
// implementation from inheriting send/overview capability it should never have.
import type { PaginatedResponse } from '../models/api';
import type { CommunicationRecord } from '../models/communications';

export interface ParticipantInboxRepository {
  /** GET /communications/inbox/{athleteId} — broadcasts addressed to a segment this athlete is in. */
  listInbox(athleteId: string): Promise<PaginatedResponse<CommunicationRecord>>;
}
