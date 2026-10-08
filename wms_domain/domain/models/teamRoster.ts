import type { CategoryImpact, IsoDate, RosterMember } from './rule';

export type TeamRosterRole = 'captain' | 'player' | 'rower' | 'coxswain';

export type TeamRosterMember = RosterMember & {
  athleteId: string;
  role: TeamRosterRole;
};

export type TeamRoster = {
  id: string;
  eventId: string;
  registrationEntryId: string;
  sportEntryProductId: string;
  name: string;
  members: TeamRosterMember[];
  originalMemberIds: string[];
  substituteMemberIds: string[];
  originalCategoryId: string;
  originalCategoryName: string;
  createdAt: string;
  updatedAt: string;
  /** Invitations are visible only to the captain and current members (REG-07). */
  pendingInvitations?: Array<{
    id: string;
    inviteePersonId: string;
    role: TeamRosterRole;
    createdAt: string;
    expiresAt: string;
  }>;
};

export type TeamInvitation = {
  id: string;
  teamId: string;
  sportEntryProductId: string;
  inviteePersonId: string;
  role?: TeamRosterRole;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
};

export type CategoryAuditRecord = CategoryImpact & {
  id: string;
  ruleId: string;
  ruleVersion: string;
  occurredAt: string;
};

export type GetTeamRosterRequest = {
  registrationEntryId: string;
  sportEntryProductId: string;
};

/**
 * A team roster change proposed against an already-confirmed entry (RUL-03/04, CMP-04).
 * `replacePersonId` absent means a pure addition — nobody leaves. Nothing on the live roster
 * moves until an OC approves it; the entry's own status is never touched by proposing one.
 */
export type ProposeRosterChangeRequest = {
  registrationEntryId: string;
  replacePersonId?: string;
  withPersonId: string;
};

export type RosterChangeProposal = {
  id: string;
  fromCategoryId: string;
  toCategoryId: string;
  fromCategoryName: string;
  toCategoryName: string;
};

/** Serializable payload for PUT /registration-entries/{entryId}/roster. */
export type TeamRosterSelection = {
  teamRosterId: string;
  memberIds: string[];
  changedAt?: IsoDate;
};
