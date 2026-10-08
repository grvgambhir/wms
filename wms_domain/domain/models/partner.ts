export type PartnerRequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface PartnerRequest {
  id: string;
  eventId: string;
  categoryId: string;
  fromAthleteId: string;
  toAthleteId: string;
  status: PartnerRequestStatus;
  createdAt: string;
  /** The sender's doubles entry; the server, not the recipient, owns this association. */
  entryId?: string;
}

export type IncomingInvitation =
  | {
      kind: 'partner';
      id: string;
      eventId: string;
      categoryId: string;
      fromName: string;
      createdAt: string;
    }
  | {
      kind: 'team';
      id: string;
      teamId: string;
      teamName: string;
      sportEntryProductId: string;
      fromName: string;
      role: string | null;
      expiresAt: string;
      createdAt: string;
    };

export interface PartnerFilters {
  eventId: string;
  categoryId: string;
  sportId?: string;
  query?: string;
}
