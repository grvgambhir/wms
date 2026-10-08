import { backendRequest } from '../auth/backendRequest';
import type {
  AdminPeoplePage,
  AdminPerson,
  GrantAdminRoleInput,
  GrantAdminRoleResult,
  InviteAdminUserInput,
  ListAdminPeopleInput,
  PurgePersonInput,
  ResendInviteInput,
  ResetMfaInput,
  RevokeAdminRoleInput,
} from '../domain/adminPeople';
import type { AdminPeopleRepository } from './AdminPeopleRepository';

export class ApiAdminPeopleRepository implements AdminPeopleRepository {
  async listPeople(input: ListAdminPeopleInput): Promise<AdminPeoplePage> {
    const params = new URLSearchParams();
    if (input.search) params.set('search', input.search);
    if (input.cursor) params.set('cursor', input.cursor);
    if (input.limit) params.set('limit', String(input.limit));
    const query = params.toString();
    return backendRequest<AdminPeoplePage>(`/v1/admin/people${query ? `?${query}` : ''}`);
  }

  async grantRole(input: GrantAdminRoleInput): Promise<GrantAdminRoleResult> {
    return backendRequest<GrantAdminRoleResult>(`/v1/admin/people/${input.personId}/roles`, {
      method: 'POST',
      headers: { 'Idempotency-Key': input.idempotencyKey },
      body: JSON.stringify({
        roleCode: input.roleCode,
        eventId: input.eventId ?? null,
      }),
    });
  }

  async revokeRole(input: RevokeAdminRoleInput): Promise<void> {
    const params = new URLSearchParams();
    if (input.eventId) params.set('eventId', input.eventId);
    const query = params.toString();
    await backendRequest<void>(
      `/v1/admin/people/${input.personId}/roles/${encodeURIComponent(input.roleCode)}${query ? `?${query}` : ''}`,
      {
        method: 'DELETE',
        headers: { 'Idempotency-Key': input.idempotencyKey },
      },
    );
  }

  async inviteUser(input: InviteAdminUserInput): Promise<AdminPerson> {
    return backendRequest<AdminPerson>('/v1/admin/people/invite', {
      method: 'POST',
      headers: { 'Idempotency-Key': input.idempotencyKey },
      body: JSON.stringify({
        email: input.email,
        givenName: input.givenName,
        familyName: input.familyName,
        roleCode: input.roleCode,
        eventId: input.eventId ?? null,
      }),
    });
  }

  async resendInvite(input: ResendInviteInput): Promise<void> {
    await backendRequest<{ ok: true }>(`/v1/admin/people/${input.personId}/invite/resend`, {
      method: 'POST',
      headers: { 'Idempotency-Key': input.idempotencyKey },
    });
  }

  async purgePerson(input: PurgePersonInput): Promise<void> {
    await backendRequest<void>(`/v1/admin/people/${input.personId}`, {
      method: 'DELETE',
      headers: { 'Idempotency-Key': input.idempotencyKey },
    });
  }

  async resetMfa(input: ResetMfaInput): Promise<void> {
    await backendRequest<{ ok: true }>(`/v1/admin/people/${input.personId}/mfa/reset`, {
      method: 'POST',
      headers: { 'Idempotency-Key': input.idempotencyKey },
    });
  }

  async reset(): Promise<void> {
    // Live people and roles are owned by wms_backend.
  }
}
