/**
 * Service-side Cognito AdminCreateUser. The rest of the codebase talks only to
 * this interface — AWS SDK types stay here, the way GetUser stays in caller-email.
 *
 * AdminCreateUser is authorised by the process identity (IAM), not the caller's
 * access token. Missing credentials must never fall through to creating a person
 * without a pool user.
 *
 * Resend uses the same IAM action (`cognito-idp:AdminCreateUser`) with
 * `MessageAction: 'RESEND'` — same user, same `sub`, new temporary password.
 */
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserMFAPreferenceCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
  InvalidParameterException,
  UnsupportedUserStateException,
  UsernameExistsException,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import { env } from '../../config/env';

export const COGNITO_USER_ADMIN = Symbol('CognitoUserAdmin');

export interface InvitedCognitoUser {
  sub: string;
}

export interface CognitoUserAdmin {
  createInvitedUser(args: {
    email: string;
    givenName: string;
    familyName: string;
  }): Promise<InvitedCognitoUser>;
  resendInvitation(args: { username: string }): Promise<void>;
  deleteUser(args: { username: string }): Promise<void>;
  setSoftwareTokenMfa(args: { username: string; enabled: boolean }): Promise<void>;
  globalSignOut(args: { username: string }): Promise<void>;
}

export class CognitoAdminError extends Error {
  constructor(
    readonly code:
      | 'UsernameExistsException'
      | 'InvalidParameterException'
      | 'InviteAlreadyAccepted'
      | 'UserNotFound'
      | 'Unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'CognitoAdminError';
  }
}

/** AUTH_PROVIDER=local, or Cognito without an IAM identity that can AdminCreateUser. */
export class UnavailableCognitoUserAdmin implements CognitoUserAdmin {
  async createInvitedUser(): Promise<InvitedCognitoUser> {
    throw new CognitoAdminError('Unavailable', 'admin.invite.cognito_unavailable');
  }

  async resendInvitation(): Promise<void> {
    throw new CognitoAdminError('Unavailable', 'admin.invite.cognito_unavailable');
  }

  async deleteUser(): Promise<void> {
    throw new CognitoAdminError('Unavailable', 'admin.invite.cognito_unavailable');
  }

  async setSoftwareTokenMfa(): Promise<void> {
    throw new CognitoAdminError('Unavailable', 'admin.invite.cognito_unavailable');
  }

  async globalSignOut(): Promise<void> {
    throw new CognitoAdminError('Unavailable', 'admin.invite.cognito_unavailable');
  }
}

function sdkErrorName(err: unknown): string | undefined {
  return (err as { name?: string }).name;
}

function isCredentialFailure(name: string | undefined): boolean {
  return (
    name === 'CredentialsProviderError' ||
    name === 'InvalidClientTokenId' ||
    name === 'UnrecognizedClientException' ||
    name === 'ExpiredTokenException'
  );
}

export class SdkCognitoUserAdmin implements CognitoUserAdmin {
  constructor(
    private readonly client: CognitoIdentityProviderClient,
    private readonly userPoolId: string,
  ) {}

  async createInvitedUser(args: {
    email: string;
    givenName: string;
    familyName: string;
  }): Promise<InvitedCognitoUser> {
    try {
      const result = await this.client.send(
        new AdminCreateUserCommand({
          UserPoolId: this.userPoolId,
          Username: args.email,
          UserAttributes: [
            { Name: 'email', Value: args.email },
            { Name: 'email_verified', Value: 'true' },
            { Name: 'given_name', Value: args.givenName },
            { Name: 'family_name', Value: args.familyName },
          ],
          DesiredDeliveryMediums: ['EMAIL'],
        }),
      );
      const attributes = result.User?.Attributes ?? [];
      const sub =
        attributes.find((attribute) => attribute.Name === 'sub')?.Value ?? result.User?.Username;
      if (!sub) {
        throw new CognitoAdminError('InvalidParameterException', 'admin.invite.invalid');
      }
      return { sub };
    } catch (err) {
      if (err instanceof CognitoAdminError) throw err;
      if (err instanceof UsernameExistsException || sdkErrorName(err) === 'UsernameExistsException') {
        throw new CognitoAdminError('UsernameExistsException', 'admin.invite.already_exists');
      }
      if (
        err instanceof InvalidParameterException ||
        sdkErrorName(err) === 'InvalidParameterException'
      ) {
        throw new CognitoAdminError('InvalidParameterException', 'admin.invite.invalid');
      }
      if (isCredentialFailure(sdkErrorName(err))) {
        throw new CognitoAdminError('Unavailable', 'admin.invite.cognito_unavailable');
      }
      throw err;
    }
  }

  async resendInvitation(args: { username: string }): Promise<void> {
    try {
      await this.client.send(
        new AdminCreateUserCommand({
          UserPoolId: this.userPoolId,
          Username: args.username,
          MessageAction: 'RESEND',
          DesiredDeliveryMediums: ['EMAIL'],
        }),
      );
    } catch (err) {
      if (err instanceof CognitoAdminError) throw err;
      if (err instanceof UserNotFoundException || sdkErrorName(err) === 'UserNotFoundException') {
        throw new CognitoAdminError('UserNotFound', 'admin.person.not_found');
      }
      if (
        err instanceof UnsupportedUserStateException ||
        sdkErrorName(err) === 'UnsupportedUserStateException' ||
        err instanceof InvalidParameterException ||
        sdkErrorName(err) === 'InvalidParameterException'
      ) {
        // RESEND is only valid while the user is FORCE_CHANGE_PASSWORD. A confirmed
        // account means they already signed in — rotating the temp password would lock them out.
        throw new CognitoAdminError('InviteAlreadyAccepted', 'admin.invite.already_accepted');
      }
      if (isCredentialFailure(sdkErrorName(err))) {
        throw new CognitoAdminError('Unavailable', 'admin.invite.cognito_unavailable');
      }
      throw err;
    }
  }

  async deleteUser(args: { username: string }): Promise<void> {
    try {
      await this.client.send(
        new AdminDeleteUserCommand({
          UserPoolId: this.userPoolId,
          Username: args.username,
        }),
      );
    } catch (err) {
      if (err instanceof CognitoAdminError) throw err;
      if (err instanceof UserNotFoundException || sdkErrorName(err) === 'UserNotFoundException') {
        return;
      }
      if (sdkErrorName(err) === 'AccessDeniedException') {
        throw new CognitoAdminError('Unavailable', 'admin.invite.cognito_unavailable');
      }
      if (isCredentialFailure(sdkErrorName(err))) {
        throw new CognitoAdminError('Unavailable', 'admin.invite.cognito_unavailable');
      }
      throw err;
    }
  }

  async setSoftwareTokenMfa(args: { username: string; enabled: boolean }): Promise<void> {
    try {
      await this.client.send(
        new AdminSetUserMFAPreferenceCommand({
          UserPoolId: this.userPoolId,
          Username: args.username,
          SoftwareTokenMfaSettings: { Enabled: args.enabled, PreferredMfa: args.enabled },
        }),
      );
    } catch (err) {
      if (err instanceof UserNotFoundException || sdkErrorName(err) === 'UserNotFoundException') {
        throw new CognitoAdminError('UserNotFound', 'admin.person.not_found');
      }
      if (sdkErrorName(err) === 'AccessDeniedException' || isCredentialFailure(sdkErrorName(err))) {
        throw new CognitoAdminError('Unavailable', 'admin.invite.cognito_unavailable');
      }
      throw err;
    }
  }

  async globalSignOut(args: { username: string }): Promise<void> {
    try {
      await this.client.send(
        new AdminUserGlobalSignOutCommand({
          UserPoolId: this.userPoolId,
          Username: args.username,
        }),
      );
    } catch (err) {
      if (err instanceof UserNotFoundException || sdkErrorName(err) === 'UserNotFoundException') {
        throw new CognitoAdminError('UserNotFound', 'admin.person.not_found');
      }
      if (sdkErrorName(err) === 'AccessDeniedException' || isCredentialFailure(sdkErrorName(err))) {
        throw new CognitoAdminError('Unavailable', 'admin.invite.cognito_unavailable');
      }
      throw err;
    }
  }
}

/**
 * Test seam. Set before NestFactory.create so PeopleModule's factory picks it up.
 * Production never calls this.
 */
let testOverride: CognitoUserAdmin | undefined;

export function setCognitoUserAdminForTests(admin: CognitoUserAdmin | undefined): void {
  testOverride = admin;
}

export function cognitoUserAdminFromEnv(): CognitoUserAdmin {
  if (testOverride) return testOverride;
  if (env.AUTH_PROVIDER !== 'cognito') {
    return new UnavailableCognitoUserAdmin();
  }
  return new SdkCognitoUserAdmin(
    new CognitoIdentityProviderClient({ region: env.AWS_REGION }),
    env.COGNITO_USER_POOL_ID,
  );
}
