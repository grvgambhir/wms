import { RepositoryError } from '@/data/errors/repositoryError';
import teamRostersJson from '@/data/mock/fixtures/data-hub/team-rosters.json';
import type { PaginatedResponse } from '@/domain/models/api';
import type {
  GetTeamRosterRequest,
  ProposeRosterChangeRequest,
  RosterChangeProposal,
  TeamInvitation,
  TeamRoster,
  TeamRosterRole,
} from '@/domain/models/teamRoster';
import type { TeamRosterRepository } from '@/domain/repositories/teamRoster.repository';

const QUERY_DELAY_MS = 220;
const teamRosters = teamRostersJson as unknown as PaginatedResponse<TeamRoster>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class MockTeamRosterRepository implements TeamRosterRepository {
  async getTeamRoster(input: GetTeamRosterRequest): Promise<TeamRoster> {
    await new Promise((resolve) => setTimeout(resolve, QUERY_DELAY_MS));
    const roster = teamRosters.items.find(
      (item) =>
        item.registrationEntryId === input.registrationEntryId &&
        item.sportEntryProductId === input.sportEntryProductId,
    );
    if (!roster) {
      throw new RepositoryError({
        code: 'TEAM_ROSTER_NOT_FOUND',
        message: 'The team roster is not configured for this entry.',
      });
    }
    return clone(roster);
  }

  async createTeam(entryId: string): Promise<{ id: string; teamId: string; status: 'draft' }> {
    const roster = teamRosters.items.find((item) => item.registrationEntryId === entryId);
    if (!roster) {
      throw new RepositoryError({ code: 'TEAM_ROSTER_NOT_FOUND', message: 'The team roster is not configured for this entry.' });
    }
    return { id: entryId, teamId: roster.id, status: 'draft' };
  }

  async invite(input: {
    teamId: string;
    sportEntryProductId: string;
    inviteePersonId: string;
    role?: TeamRosterRole;
  }): Promise<TeamInvitation> {
    return {
      id: `team-invite-${Date.now()}`,
      teamId: input.teamId,
      sportEntryProductId: input.sportEntryProductId,
      inviteePersonId: input.inviteePersonId,
      role: input.role,
      status: 'pending',
    };
  }

  async cancelInvitation(invitationId: string): Promise<TeamInvitation> {
    return { id: invitationId, teamId: '', sportEntryProductId: '', inviteePersonId: '', status: 'cancelled' };
  }

  async respondToInvitation(
    invitationId: string,
    decision: 'accepted' | 'declined',
  ): Promise<TeamInvitation> {
    return {
      id: invitationId,
      teamId: '',
      sportEntryProductId: '',
      inviteePersonId: '',
      status: decision,
    };
  }

  async proposeRosterChange(input: ProposeRosterChangeRequest): Promise<RosterChangeProposal> {
    const roster = teamRosters.items.find(
      (item) => item.registrationEntryId === input.registrationEntryId,
    );
    if (!roster) {
      throw new RepositoryError({
        code: 'TEAM_ROSTER_NOT_FOUND',
        message: 'The team roster is not configured for this entry.',
      });
    }
    return {
      id: `roster-substitution-${Date.now()}`,
      fromCategoryId: roster.originalCategoryId,
      toCategoryId: roster.originalCategoryId,
      fromCategoryName: roster.originalCategoryName,
      toCategoryName: roster.originalCategoryName,
    };
  }
}
