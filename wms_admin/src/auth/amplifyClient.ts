import { Amplify } from 'aws-amplify';
import {
  confirmResetPassword,
  confirmSignIn,
  fetchAuthSession,
  getCurrentUser,
  resetPassword,
  setUpTOTP,
  signIn,
  signOut,
  updateMFAPreference,
  verifyTOTPSetup,
} from 'aws-amplify/auth';
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';
import { defaultStorage } from 'aws-amplify/utils';

import type { CognitoAuthClient, SignInNextStep } from './cognitoClient';
import { cognitoConfig } from './env';
import { assertAccessToken } from './jwt';

let configured = false;

function isAlreadyAuthenticated(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'name' in err && err.name === 'UserAlreadyAuthenticatedException');
}

function nextStepOf(step: string): SignInNextStep {
  if (step === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') return 'new_password_required';
  if (step === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE') return 'totp_required';
  return 'done';
}

async function initiateSignIn(email: string, password: string): Promise<SignInNextStep> {
  const result = await signIn({
    username: email,
    password,
    options: { authFlowType: 'USER_SRP_AUTH' },
  });
  return nextStepOf(result.nextStep.signInStep);
}

export function createAmplifyCognitoClient(): CognitoAuthClient {
  return {
    configure() {
      if (configured) return;
      const config = cognitoConfig();
      if (!config) throw new Error('auth.cognito.unconfigured');
      // Persist Cognito tokens in localStorage so a refresh keeps the session.
      cognitoUserPoolsTokenProvider.setKeyValueStorage(defaultStorage);
      Amplify.configure({
        Auth: {
          Cognito: {
            userPoolId: config.userPoolId,
            userPoolClientId: config.userPoolClientId,
            loginWith: { email: true },
          },
        },
      });
      configured = true;
    },

    async signIn(email, password) {
      try {
        return await initiateSignIn(email, password);
      } catch (err) {
        if (!isAlreadyAuthenticated(err)) throw err;
        await signOut({ global: false }).catch(() => undefined);
        return initiateSignIn(email, password);
      }
    },

    async confirmNewPassword(newPassword) {
      const result = await confirmSignIn({ challengeResponse: newPassword });
      return nextStepOf(result.nextStep.signInStep);
    },

    async confirmTotpCode(code) {
      const result = await confirmSignIn({ challengeResponse: code });
      return nextStepOf(result.nextStep.signInStep);
    },

    async startTotpSetup(email) {
      const setup = await setUpTOTP();
      const uri = setup.getSetupUri('WMS Command Centre', email).toString();
      return { secret: setup.sharedSecret, uri };
    },

    async verifyAndEnableTotp(code) {
      await verifyTOTPSetup({ code });
      await updateMFAPreference({ totp: 'PREFERRED' });
    },

    async disableTotp() {
      await updateMFAPreference({ totp: 'DISABLED' });
    },

    async signOut() {
      try {
        await signOut({ global: false });
      } catch {
        // Caller always clears the in-app session.
      }
    },

    async fetchAccessToken(forceRefresh = false) {
      const session = await fetchAuthSession({ forceRefresh });
      const token = session.tokens?.accessToken?.toString();
      if (!token) return null;
      return assertAccessToken(token);
    },

    async currentUsername() {
      try {
        const user = await getCurrentUser();
        return user.username ?? user.userId ?? null;
      } catch {
        return null;
      }
    },

    async resetPassword(email) {
      await resetPassword({ username: email });
    },

    async confirmResetPassword(email, code, newPassword) {
      await confirmResetPassword({
        username: email,
        confirmationCode: code,
        newPassword,
      });
    },
  };
}
