// TEMPORARY AUTH — placeholder until decision D5 selects an identity provider.
// Not production: no MFA (PLT-04 is a mandatory gate item), no password reset,
// passwords stored locally. Replace LocalIdentityProvider, keep the interface.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { hash as argon2Hash, verify as argon2Verify } from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { pool } from '../../db/pool';
import { ARGON2_OPTIONS } from './argon2-options';
import {
  InvalidTokenError,
  type AuthenticatedIdentity,
  type IdentityProvider,
  type TokenPair,
} from './identity-provider';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_SQL = `now() + interval '30 days'`;
const LOCK_AFTER_FAILURES = 5;

interface CredentialRow {
  person_id: string;
  password_hash: string;
  failed_attempts: number;
  locked_until: Date | null;
}

interface RefreshRow {
  id: string;
  person_id: string;
  family_id: string;
  expires_at: Date;
  revoked_at: Date | null;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function signAccessToken(identity: AuthenticatedIdentity): string {
  return jwt.sign(
    { sub: identity.personId, roles: identity.roles, jti: randomUUID() },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: ACCESS_TOKEN_TTL },
  );
}

@Injectable()
export class LocalIdentityProvider implements IdentityProvider, OnModuleInit {
  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    this.dummyHash = await argon2Hash('timing-dummy', ARGON2_OPTIONS);
  }

  async authenticate(email: string, password: string): Promise<AuthenticatedIdentity | null> {
    const { rows } = await pool.query<CredentialRow>(
      `SELECT person_id, password_hash, failed_attempts, locked_until
         FROM core.user_credential
        WHERE email = $1`,
      [email],
    );
    const row = rows[0];
    const hash = row?.password_hash ?? this.dummyHash;
    const passwordOk = await argon2Verify(hash, password).catch(() => false);

    if (!row || !passwordOk) {
      if (row) await this.recordFailure(row);
      return null;
    }

    if (row.locked_until && row.locked_until.getTime() > Date.now()) {
      return null;
    }

    await pool.query(
      `UPDATE core.user_credential
          SET failed_attempts = 0, locked_until = NULL
        WHERE person_id = $1`,
      [row.person_id],
    );

    return { personId: row.person_id, roles: await this.loadRoles(row.person_id) };
  }

  async issue(identity: AuthenticatedIdentity): Promise<TokenPair> {
    const refreshToken = randomBytes(32).toString('base64url');
    await pool.query(
      `INSERT INTO core.refresh_token (person_id, token_hash, family_id, expires_at)
       VALUES ($1, $2, $3, ${REFRESH_TOKEN_TTL_SQL})`,
      [identity.personId, sha256(refreshToken), randomUUID()],
    );
    return { accessToken: signAccessToken(identity), refreshToken };
  }

  async verify(accessToken: string): Promise<AuthenticatedIdentity> {
    try {
      const payload = jwt.verify(accessToken, env.JWT_SECRET, { algorithms: ['HS256'] });
      if (typeof payload !== 'object' || payload === null || typeof payload.sub !== 'string') {
        throw new InvalidTokenError();
      }
      const roles = Array.isArray(payload.roles)
        ? payload.roles.filter((role): role is string => typeof role === 'string')
        : [];
      return { personId: payload.sub, roles };
    } catch {
      throw new InvalidTokenError();
    }
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const tokenHash = sha256(refreshToken);
    const client = await pool.connect();
    let committed = false;
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<RefreshRow>(
        `SELECT id, person_id, family_id, expires_at, revoked_at
           FROM core.refresh_token
          WHERE token_hash = $1
          FOR UPDATE`,
        [tokenHash],
      );
      const row = rows[0];
      if (!row) throw new InvalidTokenError();

      if (row.revoked_at) {
        await client.query(
          `UPDATE core.refresh_token
              SET revoked_at = now()
            WHERE family_id = $1 AND revoked_at IS NULL`,
          [row.family_id],
        );
        await client.query('COMMIT');
        committed = true;
        throw new InvalidTokenError();
      }

      if (row.expires_at.getTime() <= Date.now()) {
        await client.query(`UPDATE core.refresh_token SET revoked_at = now() WHERE id = $1`, [
          row.id,
        ]);
        await client.query('COMMIT');
        committed = true;
        throw new InvalidTokenError();
      }

      const roles = await this.loadRoles(row.person_id);
      const nextRaw = randomBytes(32).toString('base64url');
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO core.refresh_token (person_id, token_hash, family_id, expires_at)
         VALUES ($1, $2, $3, ${REFRESH_TOKEN_TTL_SQL})
         RETURNING id`,
        [row.person_id, sha256(nextRaw), row.family_id],
      );
      const nextId = inserted.rows[0]?.id;
      if (!nextId) throw new InvalidTokenError();
      await client.query(
        `UPDATE core.refresh_token
            SET revoked_at = now(), replaced_by = $2
          WHERE id = $1`,
        [row.id, nextId],
      );
      await client.query('COMMIT');
      committed = true;
      return {
        accessToken: signAccessToken({ personId: row.person_id, roles }),
        refreshToken: nextRaw,
      };
    } catch (err) {
      if (!committed) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // connection already gone
        }
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async revoke(refreshToken: string): Promise<void> {
    await pool.query(
      `UPDATE core.refresh_token
          SET revoked_at = now()
        WHERE family_id = (
                SELECT family_id FROM core.refresh_token WHERE token_hash = $1
              )
          AND revoked_at IS NULL`,
      [sha256(refreshToken)],
    );
  }

  private async recordFailure(row: CredentialRow): Promise<void> {
    await pool.query(
      `UPDATE core.user_credential
          SET failed_attempts = failed_attempts + 1,
              locked_until = CASE
                WHEN failed_attempts + 1 >= $2 THEN now() + interval '15 minutes'
                ELSE locked_until
              END
        WHERE person_id = $1`,
      [row.person_id, LOCK_AFTER_FAILURES],
    );
  }

  private async loadRoles(personId: string): Promise<string[]> {
    const { rows } = await pool.query<{ role_code: string }>(
      `SELECT role_code FROM core.person_role WHERE person_id = $1`,
      [personId],
    );
    return rows.map((r) => r.role_code);
  }
}
