/**
 * Authoritative email for the caller. Never taken from a request body.
 *
 * An access token has no email. Under Cognito we call GetUser with that token.
 * Under local auth (and tests) we read the person row — there is no IdP to ask.
 */
import { env } from '../config/env';
import { pool } from '../db/pool';

export const CALLER_EMAIL_SOURCE = Symbol('CallerEmailSource');

export interface CallerEmailSource {
  emailFor(accessToken: string, personId: string): Promise<string | null>;
}

export class PersonTableEmailSource implements CallerEmailSource {
  async emailFor(_accessToken: string, personId: string): Promise<string | null> {
    const { rows } = await pool.query<{ email: string | null }>(
      `SELECT email::text AS email FROM core.person WHERE id = $1`,
      [personId],
    );
    return rows[0]?.email ?? null;
  }
}

type CognitoGetUserBody = {
  UserAttributes?: Array<{ Name?: string; Value?: string }>;
};

export class CognitoGetUserEmailSource implements CallerEmailSource {
  constructor(private readonly region: string) {}

  async emailFor(accessToken: string, _personId: string): Promise<string | null> {
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
      return null;
    }
    if (!response.ok) return null;
    const body = (await response.json()) as CognitoGetUserBody;
    const email = body.UserAttributes?.find((attribute) => attribute.Name === 'email')?.Value;
    return email && email.length > 0 ? email : null;
  }
}

export function callerEmailSourceFromEnv(): CallerEmailSource {
  if (env.AUTH_PROVIDER === 'cognito') {
    return new CognitoGetUserEmailSource(env.COGNITO_REGION);
  }
  return new PersonTableEmailSource();
}
