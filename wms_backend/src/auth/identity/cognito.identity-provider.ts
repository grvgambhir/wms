/**
 * Cognito implementation of IdentityProvider. Verifies access tokens with
 * aws-jwt-verify (RS256, JWKS cache, iss / token_use / client_id). Roles come
 * from core.person_role, never from the token. Login, refresh and password reset
 * stay on Cognito — this class does not implement them.
 */

import { OnModuleInit } from '@nestjs/common';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { SimpleJwksCache } from 'aws-jwt-verify/jwk';
import { env } from '../../config/env';
import { pool } from '../../db/pool';
import {
  InvalidTokenError,
  type AppClient,
  type AuthenticatedIdentity,
  type IdentityProvider,
  type TokenPair,
} from './identity-provider';

/** A few seconds of clock skew, not more. */
const CLOCK_SKEW_SECONDS = 5;

const PLACEHOLDER_GIVEN_NAME = 'Pending';
const PLACEHOLDER_FAMILY_NAME = 'User';
const PLACEHOLDER_DOB = '1900-01-01';

export type CognitoJwksFetch = (jwksUri: string) => Promise<ArrayBuffer>;

export interface CognitoIdentityProviderOptions {
  region: string;
  userPoolId: string;
  clientIdParticipant: string;
  clientIdAdmin: string;
  /** Test-only: fetch JWKS from a local server instead of Cognito. */
  fetchJwks?: CognitoJwksFetch;
}

function configFromEnv(): CognitoIdentityProviderOptions {
  if (env.AUTH_PROVIDER !== 'cognito') {
    throw new Error('CognitoIdentityProvider requires AUTH_PROVIDER=cognito');
  }
  return {
    region: env.COGNITO_REGION,
    userPoolId: env.COGNITO_USER_POOL_ID,
    clientIdParticipant: env.COGNITO_CLIENT_ID_PARTICIPANT,
    clientIdAdmin: env.COGNITO_CLIENT_ID_ADMIN,
  };
}

type AccessVerifier = ReturnType<typeof CognitoJwtVerifier.create>;

export class CognitoIdentityProvider implements IdentityProvider, OnModuleInit {
  private readonly options: CognitoIdentityProviderOptions;
  private readonly verifier: AccessVerifier;

  constructor(options: CognitoIdentityProviderOptions = configFromEnv()) {
    if (!options.userPoolId.startsWith(`${options.region}_`)) {
      throw new Error(
        'COGNITO_USER_POOL_ID must start with COGNITO_REGION followed by an underscore.',
      );
    }
    this.options = options;
    const jwksCache = options.fetchJwks
      ? new SimpleJwksCache({
          fetcher: {
            fetch: (uri: string) => {
              const fetchJwks = this.options.fetchJwks;
              if (!fetchJwks) return Promise.reject(new Error('JWKS fetch is not configured'));
              return fetchJwks(uri);
            },
          },
        })
      : undefined;

    try {
      this.verifier = CognitoJwtVerifier.create(
        {
          userPoolId: options.userPoolId,
          tokenUse: 'access',
          clientId: [options.clientIdParticipant, options.clientIdAdmin],
          graceSeconds: CLOCK_SKEW_SECONDS,
          customJwtCheck: ({ header }) => {
            if (header.alg !== 'RS256') {
              throw new Error('Rejected');
            }
          },
        },
        jwksCache ? { jwksCache } : undefined,
      );
    } catch {
      throw new Error('COGNITO_USER_POOL_ID is not a valid Cognito user pool id.');
    }
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.verifier.hydrate();
    } catch {
      throw new Error(
        'Cognito JWKS could not be loaded. Check COGNITO_REGION and COGNITO_USER_POOL_ID.',
      );
    }
  }

  async authenticate(_email: string, _password: string): Promise<AuthenticatedIdentity | null> {
    return null;
  }

  async issue(_identity: AuthenticatedIdentity): Promise<TokenPair> {
    throw new InvalidTokenError();
  }

  async verify(accessToken: string): Promise<AuthenticatedIdentity> {
    let payload: { sub?: unknown; client_id?: unknown };
    try {
      payload = await this.verifier.verify(accessToken);
    } catch {
      throw new InvalidTokenError();
    }

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new InvalidTokenError();
    }
    if (typeof payload.client_id !== 'string') {
      throw new InvalidTokenError();
    }

    const client = this.appClient(payload.client_id);
    const personId = await this.linkPerson(payload.sub);
    const roles = await this.loadRoles(personId);
    return { personId, roles, client };
  }

  async refresh(_refreshToken: string): Promise<TokenPair> {
    throw new InvalidTokenError();
  }

  async revoke(_refreshToken: string): Promise<void> {
    // Refresh tokens live in Cognito. Our logout endpoint is a no-op here.
  }

  private appClient(clientId: string): AppClient {
    if (clientId === this.options.clientIdParticipant) return 'participant';
    if (clientId === this.options.clientIdAdmin) return 'admin';
    throw new InvalidTokenError();
  }

  /**
   * Link on Cognito `sub` only. Never on email — it is mutable in Cognito and
   * not present on an access token. First seen sub inserts a person with
   * idp_subject set and placeholder profile fields (DOB is NOT NULL).
   */
  private async linkPerson(idpSubject: string): Promise<string> {
    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM core.person WHERE idp_subject = $1`,
      [idpSubject],
    );
    const found = existing.rows[0]?.id;
    if (found) return found;

    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO core.person (idp_subject, given_name, family_name, date_of_birth, profile_status)
       VALUES ($1, $2, $3, $4, 'placeholder')
       ON CONFLICT (idp_subject) DO NOTHING
       RETURNING id`,
      [idpSubject, PLACEHOLDER_GIVEN_NAME, PLACEHOLDER_FAMILY_NAME, PLACEHOLDER_DOB],
    );
    const created = inserted.rows[0]?.id;
    if (created) return created;

    const raced = await pool.query<{ id: string }>(
      `SELECT id FROM core.person WHERE idp_subject = $1`,
      [idpSubject],
    );
    const id = raced.rows[0]?.id;
    if (!id) throw new InvalidTokenError();
    return id;
  }

  private async loadRoles(personId: string): Promise<string[]> {
    const { rows } = await pool.query<{ role_code: string }>(
      `SELECT role_code FROM core.person_role WHERE person_id = $1`,
      [personId],
    );
    return rows.map((r) => r.role_code);
  }
}
