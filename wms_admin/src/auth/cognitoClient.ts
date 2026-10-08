export type SignInNextStep = 'done' | 'new_password_required' | 'totp_required';

export type TotpSetup = { secret: string; uri: string };

export type CognitoAuthClient = {
  configure(): void;
  signIn(email: string, password: string): Promise<SignInNextStep>;
  confirmNewPassword(newPassword: string): Promise<SignInNextStep>;
  confirmTotpCode?(code: string): Promise<SignInNextStep>;
  startTotpSetup?(email: string): Promise<TotpSetup>;
  verifyAndEnableTotp?(code: string): Promise<void>;
  disableTotp?(): Promise<void>;
  signOut(): Promise<void>;
  fetchAccessToken(forceRefresh?: boolean): Promise<string | null>;
  currentUsername(): Promise<string | null>;
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
