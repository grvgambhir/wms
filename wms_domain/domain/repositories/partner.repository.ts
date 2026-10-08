import type { AthleteSummary } from '../models/athlete';
import type { IncomingInvitation, PartnerFilters, PartnerRequest, PartnerRequestStatus } from '../models/partner';

export interface PartnerRepository {
  searchPartners(filters: PartnerFilters): Promise<AthleteSummary[]>;
  sendPartnerRequest(input: Omit<PartnerRequest, 'id' | 'status' | 'createdAt'>): Promise<PartnerRequest>;
  /** Accept / decline / cancel an existing request. Accepting cancels other outgoing pending requests. */
  respondToPartnerRequest(requestId: string, status: PartnerRequestStatus): Promise<PartnerRequest>;
  listRequests(eventId: string, athleteId: string): Promise<PartnerRequest[]>;
  /** Drop leftover pending requests when the athlete confirms a known partner (A11 "I have a partner"). */
  cancelPendingOutgoing(eventId: string, fromAthleteId: string, exceptToAthleteId?: string): Promise<void>;
  listIncomingInvitations(): Promise<IncomingInvitation[]>;
}
