import { ApiError } from '../api/httpClient';

export const GRANTABLE_ROLE_CODES = ['oc_staff', 'oc_admin', 'finance'] as const;
export type GrantableRoleCode = (typeof GRANTABLE_ROLE_CODES)[number];

export type PersonRoleGrant = {
  roleCode: string;
  eventId: string | null;
};

export type AdminPerson = {
  id: string;
  givenName: string;
  familyName: string;
  email: string | null;
  profileStatus: string;
  roles: PersonRoleGrant[];
  purgeable: boolean;
  purgeBlockers: string[];
  mfaEnrolled?: boolean;
};

export type AdminPeoplePage = {
  items: AdminPerson[];
  cursor?: string;
};

export type ListAdminPeopleInput = {
  search?: string;
  cursor?: string;
  limit?: number;
};

export type GrantAdminRoleInput = {
  personId: string;
  roleCode: GrantableRoleCode;
  eventId?: string | null;
  idempotencyKey: string;
};

export type GrantAdminRoleResult = {
  personId: string;
  roleCode: string;
  eventId: string | null;
};

export type RevokeAdminRoleInput = {
  personId: string;
  roleCode: string;
  eventId?: string | null;
  idempotencyKey: string;
};

export type InviteAdminUserInput = {
  email: string;
  givenName: string;
  familyName: string;
  roleCode: GrantableRoleCode;
  eventId?: string | null;
  idempotencyKey: string;
};

export type ResendInviteInput = {
  personId: string;
  idempotencyKey: string;
};

export type PurgePersonInput = {
  personId: string;
  idempotencyKey: string;
};

export type ResetMfaInput = {
  personId: string;
  idempotencyKey: string;
};

export const PAGE_SIZE = 20;

export function personDisplayName(person: Pick<AdminPerson, 'givenName' | 'familyName'>): string {
  return `${person.givenName} ${person.familyName}`.trim();
}

export function roleLabel(roleCode: string): string {
  switch (roleCode) {
    case 'oc_admin':
      return 'Administrator';
    case 'oc_staff':
      return 'OC staff';
    case 'finance':
      return 'Finance';
    case 'participant':
      return 'Participant';
    default:
      return roleCode;
  }
}

export function isGrantableRole(roleCode: string): roleCode is GrantableRoleCode {
  return (GRANTABLE_ROLE_CODES as readonly string[]).includes(roleCode);
}

export function sameRoleGrant(
  grant: PersonRoleGrant,
  roleCode: string,
  eventId: string | null | undefined,
): boolean {
  return grant.roleCode === roleCode && (grant.eventId ?? null) === (eventId ?? null);
}

export function roleGrantKey(grant: PersonRoleGrant): string {
  return `${grant.roleCode}:${grant.eventId ?? 'global'}`;
}

export function roleScopeLabel(eventId: string | null): string {
  return eventId ? `event ${eventId}` : 'global';
}

export function clonePersonRoles(roles: readonly PersonRoleGrant[]): PersonRoleGrant[] {
  return roles.map((grant) => ({ ...grant }));
}

export function profileStatusLabel(status: string): string {
  switch (status) {
    case 'complete':
      return 'Complete';
    case 'placeholder':
      return 'Invited / not signed in';
    default:
      return status;
  }
}

export function canResendInvite(person: Pick<AdminPerson, 'profileStatus'>): boolean {
  return person.profileStatus === 'placeholder';
}

export function canRemovePerson(person: Pick<AdminPerson, 'purgeable'>): boolean {
  return person.purgeable;
}

const BY_CODE: Record<string, string> = {
  LAST_OC_ADMIN:
    'You cannot revoke this role. It is the last administrator account, and removing it would lock everyone out of the Command Centre.',
  ROLE_NOT_GRANTABLE:
    'The participant role is granted by completing a profile, not from this screen.',
  GRANTER_MUST_BE_OC_ADMIN:
    'Your session is not an administrator. Sign in again with an oc_admin account.',
  PERSON_NOT_FOUND: 'This person is no longer in the list. Refresh and try again.',
  PERSON_ROLE_NOT_FOUND: 'That role is no longer on this person. Refresh and try again.',
  VALIDATION_ERROR: 'Check the role and event id. One of them is not valid.',
  EVENT_NOT_FOUND: 'That event id does not exist.',
  IDEMPOTENCY_KEY_REQUIRED: 'This change could not be sent. Try again.',
  IDEMPOTENCY_KEY_REUSED: 'This change was already submitted with a different payload. Try again.',
  IDEMPOTENCY_IN_PROGRESS: 'This change is already in progress. Wait a moment and try again.',
  USER_ALREADY_EXISTS:
    'This email already has an account. Grant a role on their existing row instead of inviting again.',
  INVITE_ALREADY_ACCEPTED:
    'This person has already signed in. They should use Forgot password instead of a new invitation.',
  COGNITO_ADMIN_UNAVAILABLE:
    'Sending or resending invitations needs AWS credentials for Cognito AdminCreateUser. Those are not configured on this server.',
  COGNITO_USER_ORPHANED:
    'Cognito created the user but the person record could not be saved. An administrator must resolve the pool user before retrying.',
  PURGE_BLOCKED: '',
  MFA_SELF_RESET: 'You cannot reset your own authenticator. Another administrator must do that.',
  MFA_REQUIRED: 'Enrol authenticator MFA to continue.',
};

const BY_DETAIL: Record<string, string> = {
  'admin.role.last_oc_admin': BY_CODE.LAST_OC_ADMIN,
  'admin.role.participant_self_service': BY_CODE.ROLE_NOT_GRANTABLE,
  'admin.role.granter_must_be_oc_admin': BY_CODE.GRANTER_MUST_BE_OC_ADMIN,
  'admin.person.not_found': BY_CODE.PERSON_NOT_FOUND,
  'admin.role.not_found': BY_CODE.PERSON_ROLE_NOT_FOUND,
  'admin.role.invalid': BY_CODE.VALIDATION_ERROR,
  'admin.role.unknown': BY_CODE.VALIDATION_ERROR,
  'admin.person.invalid': BY_CODE.VALIDATION_ERROR,
  'admin.event.not_found': BY_CODE.EVENT_NOT_FOUND,
  'admin.invite.invalid': BY_CODE.VALIDATION_ERROR,
  'admin.invite.already_exists': BY_CODE.USER_ALREADY_EXISTS,
  'admin.invite.already_accepted': BY_CODE.INVITE_ALREADY_ACCEPTED,
  'admin.invite.cognito_unavailable': BY_CODE.COGNITO_ADMIN_UNAVAILABLE,
  'admin.invite.cognito_orphaned': BY_CODE.COGNITO_USER_ORPHANED,
};

export function explainAdminPeopleError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'PURGE_BLOCKED') return error.message;
    const byCode = BY_CODE[error.code];
    if (byCode) return byCode;
    const byDetail = BY_DETAIL[error.message];
    if (byDetail) return byDetail;
    return 'The request was refused.';
  }
  if (error instanceof TypeError) {
    return 'The request did not reach the server. Try the same action again — it will not be sent twice.';
  }
  if (error instanceof Error && error.message && !error.message.includes('.')) {
    return error.message;
  }
  return 'The request could not be completed.';
}
