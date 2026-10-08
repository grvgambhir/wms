import type {
  GetTeamRosterRequest,
  ProposeRosterChangeRequest,
  RosterChangeProposal,
  TeamInvitation,
  TeamRoster,
  TeamRosterRole,
} from '../models/teamRoster';

/** REST mapping: getTeamRoster -> GET /registration-entries/{entryId}/rosters/{productId}. */
export interface TeamRosterRepository {
  getTeamRoster(input: GetTeamRosterRequest): Promise<TeamRoster>;
  createTeam(entryId: string): Promise<{ id: string; teamId: string; status: 'draft' }>;
  invite(input: {
    teamId: string;
    sportEntryProductId: string;
    inviteePersonId: string;
    role?: TeamRosterRole;
  }): Promise<TeamInvitation>;
  cancelInvitation(invitationId: string): Promise<TeamInvitation>;
  respondToInvitation(invitationId: string, decision: 'accepted' | 'declined'): Promise<TeamInvitation>;
  /**
   * REST mapping: POST /registration-entries/{entryId}/roster-substitutions. The only path that
   * can change a *confirmed* team's roster (RUL-03/04) — a proposal an OC must approve, not an
   * overwrite. Use this instead of saving the entry directly once it is confirmed.
   */
  proposeRosterChange(input: ProposeRosterChangeRequest): Promise<RosterChangeProposal>;
}
