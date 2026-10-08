import type {
  AdminPerson,
  AdminPeoplePage,
  GrantAdminRoleInput,
  GrantAdminRoleResult,
  InviteAdminUserInput,
  ListAdminPeopleInput,
  PurgePersonInput,
  ResendInviteInput,
  ResetMfaInput,
  RevokeAdminRoleInput,
} from '../domain/adminPeople';

export interface AdminPeopleRepository {
  listPeople(input: ListAdminPeopleInput): Promise<AdminPeoplePage>;
  grantRole(input: GrantAdminRoleInput): Promise<GrantAdminRoleResult>;
  revokeRole(input: RevokeAdminRoleInput): Promise<void>;
  inviteUser(input: InviteAdminUserInput): Promise<AdminPerson>;
  resendInvite(input: ResendInviteInput): Promise<void>;
  purgePerson(input: PurgePersonInput): Promise<void>;
  resetMfa(input: ResetMfaInput): Promise<void>;
  /** Test helper — restore the in-memory seed. API impl is a no-op. */
  reset(): Promise<void>;
}
