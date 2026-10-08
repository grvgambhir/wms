/**
 * Identity seam. Application code talks only to this interface.
 * LocalIdentityProvider (AUTH_PROVIDER=local) and CognitoIdentityProvider
 * (AUTH_PROVIDER=cognito) are the two implementations. Guards, controllers and
 * services must not import jsonwebtoken, aws-jwt-verify, or the credential table.
 */

export const IDENTITY_PROVIDER = Symbol('IdentityProvider');

export type AppClient = 'participant' | 'admin';

export interface AuthenticatedIdentity {
  personId: string;
  roles: string[];
  /** Which of our two Cognito app clients issued the token. Unset for local auth. */
  client?: AppClient;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface IdentityProvider {
  authenticate(email: string, password: string): Promise<AuthenticatedIdentity | null>;
  issue(identity: AuthenticatedIdentity): Promise<TokenPair>;
  verify(accessToken: string): Promise<AuthenticatedIdentity>;
  refresh(refreshToken: string): Promise<TokenPair>;
  revoke(refreshToken: string): Promise<void>;
}

/** Thrown by verify/refresh when the token is missing, expired, or reused. */
export class InvalidTokenError extends Error {
  constructor(message = 'Invalid token') {
    super(message);
    this.name = 'InvalidTokenError';
  }
}
