/**
 * HTTP client for the caller's team roster against wms_backend.
 * MockTeamRosterRepository stays as the offline fallback.
 */
import { backendRequest } from '@/data/api/wmsBackend';
import { isNetworkError } from '@/auth/me';
import { newIdempotencyKey } from '@/features/profile/completeProfile';
import type {
  GetTeamRosterRequest,
  ProposeRosterChangeRequest,
  RosterChangeProposal,
  TeamInvitation,
  TeamRoster,
  TeamRosterRole,
} from '@/domain/models/teamRoster';
import type { TeamRosterRepository } from '@/domain/repositories/teamRoster.repository';

export class ApiTeamRosterRepository implements TeamRosterRepository {
  constructor(private readonly fallback: TeamRosterRepository) {}

  async getTeamRoster(input: GetTeamRosterRequest): Promise<TeamRoster> {
    try {
      return await backendRequest<TeamRoster>(
        `/v1/registration-entries/${encodeURIComponent(input.registrationEntryId)}/rosters/${encodeURIComponent(input.sportEntryProductId)}`,
      );
    } catch (err) {
      if (isNetworkError(err)) return this.fallback.getTeamRoster(input);
      throw err;
    }
  }

  async createTeam(entryId: string): Promise<{ id: string; teamId: string; status: 'draft' }> {
    return backendRequest<{ id: string; teamId: string; status: 'draft' }>(`/v1/me/entries/${encodeURIComponent(entryId)}/team`, {
      method: 'POST',
      idempotencyKey: newIdempotencyKey(),
    });
  }

  async invite(input: {
    teamId: string;
    sportEntryProductId: string;
    inviteePersonId: string;
    role?: TeamRosterRole;
  }): Promise<TeamInvitation> {
    return backendRequest<TeamInvitation>(`/v1/teams/${encodeURIComponent(input.teamId)}/invitations`, {
      method: 'POST',
      body: JSON.stringify({
        sportEntryProductId: input.sportEntryProductId,
        inviteePersonId: input.inviteePersonId,
        role: input.role,
      }),
      idempotencyKey: newIdempotencyKey(),
    });
  }

  async cancelInvitation(invitationId: string): Promise<TeamInvitation> {
    return backendRequest<TeamInvitation>(`/v1/team-invitations/${encodeURIComponent(invitationId)}/cancel`, {
      method: 'POST',
      idempotencyKey: newIdempotencyKey(),
    });
  }

  async respondToInvitation(
    invitationId: string,
    decision: 'accepted' | 'declined',
  ): Promise<TeamInvitation> {
    return backendRequest<TeamInvitation>(
      `/v1/team-invitations/${encodeURIComponent(invitationId)}/${decision === 'accepted' ? 'accept' : 'decline'}`,
      { method: 'POST', idempotencyKey: newIdempotencyKey() },
    );
  }

  async proposeRosterChange(input: ProposeRosterChangeRequest): Promise<RosterChangeProposal> {
    return backendRequest<RosterChangeProposal>(
      `/v1/registration-entries/${encodeURIComponent(input.registrationEntryId)}/roster-substitutions`,
      {
        method: 'POST',
        body: JSON.stringify({
          ...(input.replacePersonId ? { replacePersonId: input.replacePersonId } : {}),
          withPersonId: input.withPersonId,
        }),
        idempotencyKey: newIdempotencyKey(),
      },
    );
  }
}
