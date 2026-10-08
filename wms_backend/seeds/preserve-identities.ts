/**
 * Keeps real Cognito sign-ins alive across `npm run seed:reset`.
 *
 * WHY THIS EXISTS
 * ---------------
 * The reset truncates `core.person … CASCADE`. The seed then recreates every FIXTURE person with
 * its fixed id — but nothing puts back the two things a developer actually tested with:
 *
 *   1. the `idp_subject` that links a real Cognito login to a seeded person (Daniel Harper), so
 *      the login lands on a fresh empty person and every demo screen says "no entry";
 *   2. people who exist only because someone signed in (the developer's own OC account) and
 *      their role grants — so the admin portal says "No OC role".
 *
 * Both were rebuilt by hand after every reset. This snapshots them before the truncate and
 * restores them after the seed.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * - It does not restore entries, consents, contacts or anything else a signed-in person created.
 *   A reset is supposed to reset those; keeping them would make it a partial reset nobody can
 *   reason about.
 * - It never GRANTS a role that did not exist before the reset. It only puts back grants it
 *   saw. An OC grant whose original granter no longer exists is re-attributed to an existing
 *   `oc_admin` (the database requires a granter who holds oc_admin) — that is printed, not
 *   hidden.
 * - A row that cannot be restored is reported and skipped; one bad row must not cost the rest.
 *
 * The snapshot is also written to a temp file before the truncate, so a seed that fails halfway
 * does not lose the only copy.
 */

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Pool } from 'pg';

type Row = Record<string, unknown>;

export interface IdentitySnapshot {
  persons: Row[];
  roles: Row[];
}

export async function snapshotIdentities(pool: Pool): Promise<IdentitySnapshot> {
  const persons = await pool.query<{ row: Row }>(
    `SELECT to_jsonb(p) AS row FROM core.person p WHERE p.idp_subject IS NOT NULL`,
  );
  const roles = await pool.query<{ row: Row }>(
    `SELECT to_jsonb(r) AS row
       FROM core.person_role r
       JOIN core.person p ON p.id = r.person_id
      WHERE p.idp_subject IS NOT NULL`,
  );
  const snapshot = { persons: persons.rows.map((r) => r.row), roles: roles.rows.map((r) => r.row) };
  const file = join(tmpdir(), `wms-seed-identities-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(snapshot, null, 2));
  console.log(`Saved ${snapshot.persons.length} Cognito-linked people to ${file}`);
  return snapshot;
}

export async function restoreIdentities(pool: Pool, snapshot: IdentitySnapshot): Promise<void> {
  const client = await pool.connect();
  const skipped: string[] = [];
  let relinked = 0;
  let recreated = 0;
  let rolesBack = 0;
  try {
    await client.query('BEGIN');

    const attempt = async (label: string, work: () => Promise<void>): Promise<boolean> => {
      await client.query('SAVEPOINT restore_row');
      try {
        await work();
        await client.query('RELEASE SAVEPOINT restore_row');
        return true;
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT restore_row');
        skipped.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    };

    for (const person of snapshot.persons) {
      const id = String(person.id);
      const label = `person ${String(person.email ?? id)}`;
      const exists = await client.query(`SELECT 1 FROM core.person WHERE id = $1`, [id]);
      if (exists.rows[0]) {
        // A fixture person: the seed recreated it, only the login link is missing.
        if (
          await attempt(label, async () => {
            await client.query(
              `UPDATE core.person SET idp_subject = $2 WHERE id = $1 AND idp_subject IS NULL`,
              [id, person.idp_subject],
            );
          })
        ) {
          relinked += 1;
        }
      } else if (
        await attempt(label, async () => {
          await client.query(
            `INSERT INTO core.person SELECT * FROM jsonb_populate_record(NULL::core.person, $1::jsonb)`,
            [JSON.stringify(person)],
          );
        })
      ) {
        recreated += 1;
      }
    }

    // Participant first, then oc_admin, then the rest: an OC grant needs an oc_admin to exist
    // before it can name one as granter.
    const order = (code: unknown) => (code === 'participant' ? 0 : code === 'oc_admin' ? 1 : 2);
    const roles = [...snapshot.roles].sort((a, b) => order(a.role_code) - order(b.role_code));

    for (const role of roles) {
      const label = `role ${String(role.role_code)} for ${String(role.person_id)}`;
      const restored = await attempt(label, async () => {
        const person = await client.query(`SELECT 1 FROM core.person WHERE id = $1`, [
          role.person_id,
        ]);
        if (!person.rows[0]) throw new Error('person was not restored');
        if (role.event_id) {
          const event = await client.query(`SELECT 1 FROM core.event WHERE id = $1`, [
            role.event_id,
          ]);
          if (!event.rows[0]) throw new Error('event no longer exists');
        }

        let grantedBy = role.granted_by;
        if (role.role_code === 'participant') {
          grantedBy = role.person_id;
        } else {
          const granter = await client.query(
            `SELECT 1 FROM core.person_role WHERE person_id = $1 AND role_code = 'oc_admin'`,
            [grantedBy],
          );
          if (!granter.rows[0]) {
            const anyAdmin = await client.query<{ person_id: string }>(
              `SELECT person_id FROM core.person_role WHERE role_code = 'oc_admin'
                ORDER BY granted_at LIMIT 1`,
            );
            grantedBy = anyAdmin.rows[0]?.person_id ?? null;
            console.log(`  ${label}: original granter gone, re-attributed to ${String(grantedBy)}`);
          }
        }

        await client.query(
          `INSERT INTO core.person_role (person_id, role_code, event_id, granted_by, granted_at)
           VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()))
           ON CONFLICT ON CONSTRAINT person_role_unique_per_event DO NOTHING`,
          [
            role.person_id,
            role.role_code,
            role.event_id ?? null,
            grantedBy,
            role.granted_at ?? null,
          ],
        );
      });
      if (restored) rolesBack += 1;
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log(
    `Kept Cognito logins: ${relinked} relinked to seeded people, ${recreated} sign-in people recreated, ${rolesBack} role grants restored`,
  );
  for (const line of skipped) console.warn(`  skipped — ${line}`);
}
