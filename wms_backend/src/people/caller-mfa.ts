/**
 * Enrolment check for the caller's own access token.
 *
 * GetUser with that token returns UserMFASettingList. This needs no IAM and is
 * not AdminGetUser. It proves MFA is enrolled and every session minted since
 * enrolment completed it — not that this request came from an MFA session.
 * Cognito access tokens in this pool carry no amr (REV-068). The remaining
 * hole is a pre-enrolment refresh token, closed by AdminUserGlobalSignOut at
 * enrolment plus a shorter admin-client refresh lifetime.
 */
import { env } from '../config/env';
import { pool } from '../db/pool';

export const CALLER_MFA_SOURCE = Symbol('CallerMfaSource');

export const MFA_ENFORCEMENT_THRESHOLD = 2;

export type CallerMfaState = {
  enrolled: boolean;
  username: string | null;
};

export interface CallerMfaSource {
  inspect(accessToken: string): Promise<CallerMfaState>;
}

export class LocalCallerMfaSource implements CallerMfaSource {
  async inspect(_accessToken: string): Promise<CallerMfaState> {
    return { enrolled: false, username: null };
  }
}

type CognitoGetUserBody = {
  Username?: string;
  UserMFASettingList?: string[];
  PreferredMfaSetting?: string;
};

export class CognitoGetUserMfaSource implements CallerMfaSource {
  constructor(private readonly region: string) {}

  async inspect(accessToken: string): Promise<CallerMfaState> {
    let response: Response;
    try {
      response = await fetch(`https://cognito-idp.${this.region}.amazonaws.com/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.GetUser',
        },
        body: JSON.stringify({ AccessToken: accessToken }),
      });
    } catch {
      return { enrolled: false, username: null };
    }
    if (!response.ok) return { enrolled: false, username: null };
    const body = (await response.json()) as CognitoGetUserBody;
    const settings = body.UserMFASettingList ?? [];
    return {
      enrolled: settings.includes('SOFTWARE_TOKEN_MFA'),
      username: body.Username ?? null,
    };
  }
}

/** Test seam. Production never calls this. */
let testOverride: CallerMfaSource | undefined;

export function setCallerMfaSourceForTests(source: CallerMfaSource | undefined): void {
  testOverride = source;
}

export function callerMfaSourceFromEnv(): CallerMfaSource {
  if (testOverride) return testOverride;
  if (env.AUTH_PROVIDER === 'cognito') {
    return new CognitoGetUserMfaSource(env.COGNITO_REGION);
  }
  return new LocalCallerMfaSource();
}

export async function countEnrolledOcAdmins(): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n
       FROM core.person_role pr
       JOIN core.person p ON p.id = pr.person_id
      WHERE pr.role_code = 'oc_admin'
        AND p.mfa_enrolled_at IS NOT NULL`,
  );
  return Number(rows[0]?.n ?? 0);
}
