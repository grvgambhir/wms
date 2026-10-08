/**
 * Testing logins as configuration, so every seed — including one on an empty database — gives
 * the same working accounts.
 *
 * `preserve-identities.ts` keeps what already exists across a reset. That is not enough on its
 * own: a deleted Docker volume, a new laptop or a fresh CI database has nothing to preserve. The
 * accounts a developer tests with are not data, they are setup, so they live in `.env`:
 *
 *   SEED_OC_ADMINS=<cognito sub>:<email>[,<sub>:<email>…]
 *     A real Cognito login that must hold oc_admin. Its person is found by sub, or created the
 *     same way the first sign-in would create it.
 *
 *   SEED_LOGIN_LINKS=daniel:<cognito sub>[,elena:<sub>,luca:<sub>,marco:<sub>]
 *     A real Cognito login that should land on a seeded demo athlete, so the demo entries,
 *     evidence and payments are reachable from the apps.
 *
 * Subs, never emails, identify a login — the same rule `CognitoIdentityProvider.linkPerson`
 * follows, because email is mutable in Cognito and absent from access tokens. These values
 * belong in `.env` only; they are never committed.
 *
 * Idempotent: running it twice changes nothing the second time.
 */

import type { PoolClient, Pool } from 'pg';
import { ELENA_ID, HARPER_ID, LUCA_ID, MARCO_TENNIS_ID } from './ids';

const SEEDED_PEOPLE: Record<string, string> = {
  daniel: HARPER_ID,
  elena: ELENA_ID,
  luca: LUCA_ID,
  marco: MARCO_TENNIS_ID,
};

const SUB_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pairs(raw: string | undefined, name: string): Array<[string, string]> {
  if (!raw?.trim()) return [];
  return raw.split(',').map((item) => {
    const index = item.indexOf(':');
    if (index < 0) throw new Error(`${name}: expected "a:b", got "${item.trim()}"`);
    return [item.slice(0, index).trim(), item.slice(index + 1).trim()];
  });
}

/**
 * Moves a sub onto `personId`. A login that signed in after a reset will already have created
 * its own empty placeholder person holding that sub; that stray is removed if it holds nothing,
 * otherwise just unlinked so no data is destroyed.
 */
async function moveSub(client: PoolClient, sub: string, personId: string): Promise<void> {
  const holder = await client.query<{ id: string }>(
    `SELECT id FROM core.person WHERE idp_subject = $1`,
    [sub],
  );
  const current = holder.rows[0]?.id;
  if (current === personId) return;
  if (current) {
    await client.query('SAVEPOINT stray');
    try {
      await client.query(`DELETE FROM core.person_role WHERE person_id = $1`, [current]);
      await client.query(`DELETE FROM core.person WHERE id = $1`, [current]);
      await client.query('RELEASE SAVEPOINT stray');
    } catch {
      // It holds something (an entry, a consent). Keep the row, drop only the login link.
      await client.query('ROLLBACK TO SAVEPOINT stray');
      await client.query(`UPDATE core.person SET idp_subject = NULL WHERE id = $1`, [current]);
    }
  }
  await client.query(`UPDATE core.person SET idp_subject = $2 WHERE id = $1`, [personId, sub]);
}

export async function applySeedLogins(pool: Pool): Promise<void> {
  const admins = pairs(process.env.SEED_OC_ADMINS, 'SEED_OC_ADMINS');
  const links = pairs(process.env.SEED_LOGIN_LINKS, 'SEED_LOGIN_LINKS');
  if (admins.length === 0 && links.length === 0) return;

  for (const [sub] of admins) {
    if (!SUB_RE.test(sub)) throw new Error(`SEED_OC_ADMINS: "${sub}" is not a Cognito sub`);
  }
  for (const [key, sub] of links) {
    if (!SEEDED_PEOPLE[key.toLowerCase()]) {
      throw new Error(
        `SEED_LOGIN_LINKS: unknown person "${key}" (use ${Object.keys(SEEDED_PEOPLE).join(', ')})`,
      );
    }
    if (!SUB_RE.test(sub)) throw new Error(`SEED_LOGIN_LINKS: "${sub}" is not a Cognito sub`);
  }

  const client = await pool.connect();
  const done: string[] = [];
  try {
    await client.query('BEGIN');

    for (const [key, sub] of links) {
      const personId = SEEDED_PEOPLE[key.toLowerCase()]!;
      const exists = await client.query(`SELECT 1 FROM core.person WHERE id = $1`, [personId]);
      if (!exists.rows[0]) throw new Error(`SEED_LOGIN_LINKS: seeded person "${key}" is missing`);
      await moveSub(client, sub, personId);
      done.push(`${key} linked`);
    }

    for (const [sub, email] of admins) {
      let personId = (
        await client.query<{ id: string }>(`SELECT id FROM core.person WHERE idp_subject = $1`, [
          sub,
        ])
      ).rows[0]?.id;
      if (!personId) {
        // Exactly what the first sign-in would insert — a placeholder the admin completes later.
        personId = (
          await client.query<{ id: string }>(
            `INSERT INTO core.person (idp_subject, given_name, family_name, date_of_birth, profile_status)
             VALUES ($1, 'Pending', 'User', '1900-01-01', 'placeholder')
             RETURNING id`,
            [sub],
          )
        ).rows[0]!.id;
      }
      if (email) {
        await client.query(
          `UPDATE core.person SET email = $2
            WHERE id = $1 AND email IS NULL
              AND NOT EXISTS (SELECT 1 FROM core.person WHERE email = $2)`,
          [personId, email],
        );
      }

      const already = await client.query(
        `SELECT 1 FROM core.person_role WHERE person_id = $1 AND role_code = 'oc_admin'`,
        [personId],
      );
      if (!already.rows[0]) {
        // The database requires the granter to hold oc_admin. The seeded dev admin does; on a
        // database with no admin at all, the bootstrap rule lets the first one name itself.
        const granter = (
          await client.query<{ person_id: string }>(
            `SELECT person_id FROM core.person_role WHERE role_code = 'oc_admin'
              ORDER BY granted_at LIMIT 1`,
          )
        ).rows[0]?.person_id;
        await client.query(
          `INSERT INTO core.person_role (person_id, role_code, event_id, granted_by)
           VALUES ($1, 'oc_admin', NULL, $2)`,
          [personId, granter ?? personId],
        );
      }
      done.push(`${email || sub} is oc_admin`);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  console.log(`Testing logins from .env: ${done.join(' · ')}`);
}
