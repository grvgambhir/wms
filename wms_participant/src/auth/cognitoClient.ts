/**
 * Cognito operations used by the participant app. Amplify is an implementation
 * detail — tests inject a fake client so they never call AWS.
 */

export type SignInNextStep = 'done' | 'totp_required';

export type CognitoAuthClient = {
  configure(): void;
  signUp(input: {
    email: string;
    password: string;
    givenName: string;
    familyName: string;
  }): Promise<void>;
  confirmSignUp(email: string, code: string): Promise<void>;
  resendSignUpCode(email: string): Promise<void>;
  signIn(email: string, password: string): Promise<SignInNextStep>;
  confirmTotpCode?(code: string): Promise<SignInNextStep>;
  startTotpSetup?(email: string): Promise<{ secret: string; uri: string }>;
  verifyAndEnableTotp?(code: string): Promise<void>;
  disableTotp?(): Promise<void>;
  signOut(): Promise<void>;
  /** Returns the access token string, or null if signed out. Never an id token. */
  fetchAccessToken(forceRefresh?: boolean): Promise<string | null>;
  currentUsername(): Promise<string | null>;
  /** The `email` user attribute from Cognito. This pool's username is an opaque sub, not the
   * email, so `currentUsername()` alone can't show what the person actually signed in with. */
  currentEmail?(): Promise<string | null>;
  resetPassword(email: string): Promise<void>;
  confirmResetPassword(email: string, code: string, newPassword: string): Promise<void>;
};

let client: CognitoAuthClient | null = null;

export function setCognitoAuthClient(next: CognitoAuthClient | null): void {
  client = next;
}

export function getCognitoAuthClient(): CognitoAuthClient | null {
  return client;
}
