import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { describe, expect, it, vi } from 'vitest';
import {
  CognitoAdminError,
  SdkCognitoUserAdmin,
} from '../src/auth/identity/cognito-user-admin';

function adminWithSend(send: ReturnType<typeof vi.fn>): SdkCognitoUserAdmin {
  return new SdkCognitoUserAdmin({ send } as never, 'eu-north-1_eLAmBFEkU');
}

describe('SdkCognitoUserAdmin.resendInvitation', () => {
  it('calls AdminCreateUser with MessageAction RESEND and the existing username', async () => {
    const send = vi.fn(async (_command: unknown) => ({}));
    const admin = adminWithSend(send);

    await admin.resendInvitation({ username: 'riya@example.com' });

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0] as AdminCreateUserCommand;
    expect(command).toBeInstanceOf(AdminCreateUserCommand);
    expect(command.input).toMatchObject({
      UserPoolId: 'eu-north-1_eLAmBFEkU',
      Username: 'riya@example.com',
      MessageAction: 'RESEND',
      DesiredDeliveryMediums: ['EMAIL'],
    });
    expect(command.input.UserAttributes).toBeUndefined();
  });

  it('does not set MessageAction when creating a new invited user', async () => {
    const send = vi.fn(async (_command: unknown) => ({
      User: {
        Username: 'new@example.com',
        Attributes: [{ Name: 'sub', Value: 'sub-new' }],
      },
    }));
    const admin = adminWithSend(send);

    await admin.createInvitedUser({
      email: 'new@example.com',
      givenName: 'New',
      familyName: 'User',
    });

    const command = send.mock.calls[0]?.[0] as AdminCreateUserCommand;
    expect(command.input.MessageAction).toBeUndefined();
    expect(command.input.Username).toBe('new@example.com');
  });

  it('maps a confirmed-user RESEND refusal to InviteAlreadyAccepted', async () => {
    const send = vi.fn(async (_command: unknown) => {
      const err = new Error('User is not in FORCE_CHANGE_PASSWORD');
      err.name = 'UnsupportedUserStateException';
      throw err;
    });
    const admin = adminWithSend(send);

    await expect(admin.resendInvitation({ username: 'signed-in@example.com' })).rejects.toEqual(
      expect.objectContaining({
        name: 'CognitoAdminError',
        code: 'InviteAlreadyAccepted',
      }),
    );
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('SdkCognitoUserAdmin.deleteUser', () => {
  it('calls AdminDeleteUser with the pool username', async () => {
    const send = vi.fn(async (_command: unknown) => ({}));
    const admin = adminWithSend(send);

    await admin.deleteUser({ username: 'invited@example.com' });

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0] as AdminDeleteUserCommand;
    expect(command).toBeInstanceOf(AdminDeleteUserCommand);
    expect(command.input).toMatchObject({
      UserPoolId: 'eu-north-1_eLAmBFEkU',
      Username: 'invited@example.com',
    });
  });

  it('treats UserNotFoundException as success', async () => {
    const send = vi.fn(async (_command: unknown) => {
      const err = new Error('User does not exist');
      err.name = 'UserNotFoundException';
      throw err;
    });
    const admin = adminWithSend(send);

    await expect(admin.deleteUser({ username: 'gone@example.com' })).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('CognitoAdminError', () => {
  it('is distinguishable by code', () => {
    const err = new CognitoAdminError('Unavailable', 'admin.invite.cognito_unavailable');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('Unavailable');
  });
});
