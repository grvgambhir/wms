import 'react-native-get-random-values';

import { Amplify } from 'aws-amplify';
import {
  confirmResetPassword,
  confirmSignIn,
  confirmSignUp,
  fetchAuthSession,
  fetchUserAttributes,
  getCurrentUser,
  resendSignUpCode,
  resetPassword,
  setUpTOTP,
  signIn,
  signOut,
  signUp,
  updateMFAPreference,
  verifyTOTPSetup,
} from 'aws-amplify/auth';
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';

import type { CognitoAuthClient } from './cognitoClient';
import { cognitoConfig } from './env';
import { assertAccessToken } from './jwt';
import { createTokenStorage } from './tokenStorage';

let configured = false;

function requireConfig() {
  const config = cognitoConfig();
  if (!config) {
    throw new Error('auth.cognito.unconfigured');
  }
  return config;
}

export function createAmplifyCognitoClient(): CognitoAuthClient {
  return {
    configure() {
      if (configured) return;
      const config = requireConfig();
      cognitoUserPoolsTokenProvider.setKeyValueStorage(createTokenStorage());
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

    async signUp({ email, password, givenName, familyName }) {
      await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
            given_name: givenName,
            family_name: familyName,
          },
        },
      });
    },

    async confirmSignUp(email, code) {
      await confirmSignUp({ username: email, confirmationCode: code });
    },

    async resendSignUpCode(email) {
      await resendSignUpCode({ username: email });
    },

    async signIn(email, password) {
      // USER_SRP_AUTH — not USER_PASSWORD_AUTH. The password never rides our code
      // path to InitiateAuth as a USER_PASSWORD_AUTH flow.
      const result = await signIn({
        username: email,
        password,
        options: { authFlowType: 'USER_SRP_AUTH' },
      });
      if (result.nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE') {
        return 'totp_required';
      }
      return 'done';
    },

    async confirmTotpCode(code) {
      const result = await confirmSignIn({ challengeResponse: code });
      return result.nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE' ? 'totp_required' : 'done';
    },

    async startTotpSetup(email) {
      const setup = await setUpTOTP();
      return { secret: setup.sharedSecret, uri: setup.getSetupUri('WMS', email).toString() };
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

    async currentEmail() {
      try {
        const attributes = await fetchUserAttributes();
        return attributes.email ?? null;
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
