// TEMPORARY AUTH — placeholder until decision D5 selects an identity provider.
// Not production: no MFA (PLT-04 is a mandatory gate item), no password reset,
// passwords stored locally. Replace LocalIdentityProvider, keep the interface.

import { hash as argon2Hash } from 'argon2';
import { env } from '../config/env';
import { pool } from '../db/pool';
import { ARGON2_OPTIONS } from './identity/argon2-options';

interface SeedAccount {
  email: string;
  password: string;
  givenName: string;
  familyName: string;
  role: string;
}

/**
 * Inserts an OC admin and a participant for local login. No-ops in production,
 * and no-ops when the env vars are unset. Existing rows are left alone.
 */
export async function seedDevUsers(): Promise<void> {
  if (env.NODE_ENV === 'production') return;

  const accounts: SeedAccount[] = [];
  if (env.AUTH_SEED_OC_ADMIN_EMAIL && env.AUTH_SEED_OC_ADMIN_PASSWORD) {
    accounts.push({
      email: env.AUTH_SEED_OC_ADMIN_EMAIL,
      password: env.AUTH_SEED_OC_ADMIN_PASSWORD,
      givenName: 'Dev',
      familyName: 'Admin',
      role: 'oc_admin',
    });
  }
  if (env.AUTH_SEED_PARTICIPANT_EMAIL && env.AUTH_SEED_PARTICIPANT_PASSWORD) {
    accounts.push({
      email: env.AUTH_SEED_PARTICIPANT_EMAIL,
      password: env.AUTH_SEED_PARTICIPANT_PASSWORD,
      givenName: 'Dev',
      familyName: 'Athlete',
      role: 'participant',
    });
  }
  if (accounts.length === 0) return;

  try {
    for (const account of accounts) {
      await seedAccount(account);
    }
    console.log('Auth seed:', accounts.map((a) => `${a.role} ${a.email}`).join(', '));
  } catch (err) {
    const code =
      typeof err === 'object' && err !== null ? (err as { code?: string }).code : undefined;
    if (code === '42P01') {
      console.log('Auth seed skipped: auth tables missing — run npm run migrate:up');
      return;
    }
    throw err;
  }
}

async function seedAccount(account: SeedAccount): Promise<void> {
  const existing = await pool.query<{ id: string }>(`SELECT id FROM core.person WHERE email = $1`, [
    account.email,
  ]);
  let personId = existing.rows[0]?.id;
  if (!personId) {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO core.person (email, given_name, family_name, date_of_birth)
       VALUES ($1, $2, $3, '1980-01-01')
       RETURNING id`,
      [account.email, account.givenName, account.familyName],
    );
    personId = inserted.rows[0]?.id;
  }
  if (!personId) return;

  // Seeded people are local rows with idp_subject NULL. They cannot log in through
  // Cognito until a matching user is created there and linked by sub.
  if (env.AUTH_PROVIDER === 'local') {
    const passwordHash = await argon2Hash(account.password, ARGON2_OPTIONS);
    await pool.query(
      `INSERT INTO core.user_credential (person_id, email, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (person_id) DO NOTHING`,
      [personId, account.email, passwordHash],
    );
  }
  await pool.query(
    `INSERT INTO core.person_role (person_id, role_code, granted_by)
     VALUES (
       $1, $2,
       CASE
         WHEN $2 = 'participant' THEN $1
         ELSE COALESCE(
           (SELECT pr.person_id FROM core.person_role pr WHERE pr.role_code = 'oc_admin' LIMIT 1),
           $1
         )
       END
     )
     -- event_id is part of the key now (a role is per-edition; NULL = global grant).
     ON CONFLICT (person_id, role_code, event_id) DO NOTHING`,
    [personId, account.role],
  );
}
