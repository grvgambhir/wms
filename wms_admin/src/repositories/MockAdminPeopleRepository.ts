import { ApiError } from '../api/httpClient';
import {
  PAGE_SIZE,
  clonePersonRoles,
  sameRoleGrant,
  type AdminPeoplePage,
  type AdminPerson,
  type GrantAdminRoleInput,
  type GrantAdminRoleResult,
  type InviteAdminUserInput,
  type ListAdminPeopleInput,
  type PurgePersonInput,
  type ResendInviteInput,
  type ResetMfaInput,
  type RevokeAdminRoleInput,
} from '../domain/adminPeople';
import type { AdminPeopleRepository } from './AdminPeopleRepository';

export const MOCK_ADMIN_ID = '11111111-1111-4111-8111-111111111111';
export const MOCK_STAFF_ID = '22222222-2222-4222-8222-222222222222';
export const MOCK_FINANCE_ID = '33333333-3333-4333-8333-333333333333';
export const MOCK_INVITED_ID = '55555555-5555-4555-8555-555555555555';

function extraId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function seedPeople(): AdminPerson[] {
  const named: AdminPerson[] = [
    {
      id: MOCK_ADMIN_ID,
      givenName: 'Olga',
      familyName: 'Admin',
      email: 'olga.admin@example.com',
      profileStatus: 'complete',
      roles: [{ roleCode: 'oc_admin', eventId: null }],
      purgeable: false,
      purgeBlockers: ['has_signed_in'],
    },
    {
      id: MOCK_STAFF_ID,
      givenName: 'Sam',
      familyName: 'Staff',
      email: 'sam.staff@example.com',
      profileStatus: 'complete',
      roles: [{ roleCode: 'participant', eventId: null }],
      purgeable: false,
      purgeBlockers: ['has_signed_in'],
    },
    {
      id: MOCK_FINANCE_ID,
      givenName: 'Priya',
      familyName: 'Finance',
      email: 'priya.finance@example.com',
      profileStatus: 'complete',
      roles: [{ roleCode: 'finance', eventId: null }],
      purgeable: false,
      purgeBlockers: ['has_signed_in'],
    },
    {
      id: MOCK_INVITED_ID,
      givenName: 'Ivy',
      familyName: 'Invited',
      email: 'ivy.invited@example.com',
      profileStatus: 'placeholder',
      roles: [{ roleCode: 'oc_staff', eventId: null }],
      purgeable: true,
      purgeBlockers: [],
    },
  ];
  const extras: AdminPerson[] = Array.from({ length: 22 }, (_, index) => {
    const n = index + 1;
    return {
      id: extraId(n),
      givenName: 'Extra',
      familyName: `Person ${String(n).padStart(2, '0')}`,
      email: `extra.${String(n).padStart(2, '0')}@example.com`,
      profileStatus: n % 4 === 0 ? 'placeholder' : 'complete',
      roles: [{ roleCode: 'participant', eventId: null }],
      purgeable: n % 4 === 0,
      purgeBlockers: n % 4 === 0 ? [] : ['has_signed_in'],
    };
  });
  return [...named, ...extras];
}

function matchesSearch(person: AdminPerson, search: string): boolean {
  if (!search) return true;
  const needle = search.toLowerCase();
  const fullName = `${person.givenName} ${person.familyName}`.toLowerCase();
  return (
    person.givenName.toLowerCase().includes(needle) ||
    person.familyName.toLowerCase().includes(needle) ||
    (person.email ?? '').toLowerCase().includes(needle) ||
    fullName.includes(needle)
  );
}

function clonePerson(person: AdminPerson): AdminPerson {
  return { ...person, roles: clonePersonRoles(person.roles) };
}

function hasRoleGrant(person: AdminPerson, roleCode: string, eventId: string | null): boolean {
  return person.roles.some((grant) => sameRoleGrant(grant, roleCode, eventId));
}

/**
 * In-memory people & roles for vitest. Same grantable codes as the API — no HTTP,
 * so page tests stay deterministic. Offline demo uses this too.
 */
export class MockAdminPeopleRepository implements AdminPeopleRepository {
  private people: AdminPerson[] = seedPeople();

  async listPeople(input: ListAdminPeopleInput): Promise<AdminPeoplePage> {
    const search = input.search?.trim() ?? '';
    const limit = input.limit && input.limit > 0 ? input.limit : PAGE_SIZE;
    const filtered = this.people.filter((person) => matchesSearch(person, search));
    let start = 0;
    if (input.cursor) {
      const index = filtered.findIndex((person) => person.id === input.cursor);
      start = index >= 0 ? index + 1 : filtered.length;
    }
    const slice = filtered.slice(start, start + limit);
    const last = slice[slice.length - 1];
    const hasMore = start + slice.length < filtered.length;
    return {
      items: slice.map(clonePerson),
      ...(hasMore && last ? { cursor: last.id } : {}),
    };
  }

  async grantRole(input: GrantAdminRoleInput): Promise<GrantAdminRoleResult> {
    if (!input.idempotencyKey) {
      throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'idempotency.key.required', 400);
    }
    const person = this.people.find((item) => item.id === input.personId);
    if (!person) {
      throw new ApiError('PERSON_NOT_FOUND', 'admin.person.not_found', 404);
    }
    const eventId = input.eventId ?? null;
    if (!hasRoleGrant(person, input.roleCode, eventId)) {
      person.roles = [...person.roles, { roleCode: input.roleCode, eventId }];
    }
    return {
      personId: person.id,
      roleCode: input.roleCode,
      eventId: input.eventId ?? null,
    };
  }

  async revokeRole(input: RevokeAdminRoleInput): Promise<void> {
    if (!input.idempotencyKey) {
      throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'idempotency.key.required', 400);
    }
    if (input.roleCode === 'participant') {
      throw new ApiError('ROLE_NOT_GRANTABLE', 'admin.role.participant_self_service', 422);
    }
    const person = this.people.find((item) => item.id === input.personId);
    if (!person) {
      throw new ApiError('PERSON_NOT_FOUND', 'admin.person.not_found', 404);
    }
    const eventId = input.eventId ?? null;
    if (!hasRoleGrant(person, input.roleCode, eventId)) {
      throw new ApiError('PERSON_ROLE_NOT_FOUND', 'admin.role.not_found', 404);
    }
    if (input.roleCode === 'oc_admin') {
      const remaining = this.people.filter(
        (item) =>
          item.id !== person.id && item.roles.some((grant) => grant.roleCode === 'oc_admin'),
      ).length;
      if (remaining === 0) {
        throw new ApiError('LAST_OC_ADMIN', 'admin.role.last_oc_admin', 422);
      }
    }
    person.roles = person.roles.filter((grant) => !sameRoleGrant(grant, input.roleCode, eventId));
  }

  async inviteUser(input: InviteAdminUserInput): Promise<AdminPerson> {
    if (!input.idempotencyKey) {
      throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'idempotency.key.required', 400);
    }
    const email = input.email.trim().toLowerCase();
    if (this.people.some((person) => (person.email ?? '').toLowerCase() === email)) {
      throw new ApiError('USER_ALREADY_EXISTS', 'admin.invite.already_exists', 409);
    }
    const person: AdminPerson = {
      id: extraId(this.people.length + 100),
      givenName: input.givenName,
      familyName: input.familyName,
      email,
      profileStatus: 'placeholder',
      roles: [{ roleCode: input.roleCode, eventId: input.eventId ?? null }],
      purgeable: true,
      purgeBlockers: [],
    };
    this.people = [person, ...this.people];
    return clonePerson(person);
  }

  async purgePerson(input: PurgePersonInput): Promise<void> {
    if (!input.idempotencyKey) {
      throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'idempotency.key.required', 400);
    }
    const person = this.people.find((item) => item.id === input.personId);
    if (!person) {
      throw new ApiError('PERSON_NOT_FOUND', 'admin.person.not_found', 404);
    }
    if (!person.purgeable) {
      throw new ApiError(
        'PURGE_BLOCKED',
        'This person has signed in and completed or started a profile.',
        422,
      );
    }
    this.people = this.people.filter((item) => item.id !== input.personId);
  }

  async resetMfa(input: ResetMfaInput): Promise<void> {
    if (!input.idempotencyKey) {
      throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'idempotency.key.required', 400);
    }
    const person = this.people.find((item) => item.id === input.personId);
    if (!person) {
      throw new ApiError('PERSON_NOT_FOUND', 'admin.person.not_found', 404);
    }
    person.mfaEnrolled = false;
  }

  async resendInvite(input: ResendInviteInput): Promise<void> {
    if (!input.idempotencyKey) {
      throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'idempotency.key.required', 400);
    }
    const person = this.people.find((item) => item.id === input.personId);
    if (!person) {
      throw new ApiError('PERSON_NOT_FOUND', 'admin.person.not_found', 404);
    }
    if (person.profileStatus !== 'placeholder') {
      throw new ApiError('INVITE_ALREADY_ACCEPTED', 'admin.invite.already_accepted', 409);
    }
  }

  async reset(): Promise<void> {
    this.people = seedPeople();
  }
}
