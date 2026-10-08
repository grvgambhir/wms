/**
 * DEVELOPMENT ONLY — removes one person's registration entries so their date of birth can be
 * edited again, without resetting anyone else's data.
 *
 *   npm run dev:clear-entries -- <email | person id>          (from the wms root)
 *
 * WHY A SCRIPT AND NOT A SWITCH IN THE APP
 * ----------------------------------------
 * `core.person_dob_locked_after_entry` refuses a DOB change once an entry exists, and that rule is
 * right for production. A toggle in a screen would need a backend path that skips it, reachable
 * from a browser. A script needs shell access to the database, refuses a non-local database, and
 * cannot be flipped by anyone using the app.
 *
 * WHAT IT DELETES — and what it keeps
 * -----------------------------------
 * Deletes: the person's own entries and everything hanging off them — status history, category
 * audit, quota consumption (pool counters are given back first), waitlist, evidence applications
 * and waivers (core and restricted), orders, payments, refunds, invoices, start-list lines,
 * substitutions, exception cases — plus their stored idempotency replies, which would otherwise
 * replay responses describing deleted rows.
 * Keeps: the person, profile, date of birth, consents, roles, login link, teams they captain.
 *
 * Invoices are immutable by trigger and several links cascade by trigger, so the deletes run with
 * `session_replication_role = replica`. That also switches off foreign-key checks — so before
 * committing, every foreign key into the affected tables is checked for orphans and the whole
 * thing rolls back if any are found. A gap in the invoice number series is expected afterwards.
 */

import { Pool } from 'pg';
import { assertNoOrphans, clearEntriesFor } from './lib/clear-entries';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

async function main(): Promise<void> {
  const target = process.argv[2]?.trim();
  if (!target) fail('Usage: npm run dev:clear-entries -- <email | person id>');
  if (process.env.NODE_ENV === 'production') fail('Refusing: NODE_ENV=production.');
  // Needs the owner: it switches off triggers and foreign-key checks to delete money rows.
  const url = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;
  if (!url) fail('DATABASE_OWNER_URL (or DATABASE_URL) is required.');
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) fail(`Refusing: database host "${host}" is not local.`);

  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  try {
    const person = await client.query<{
      id: string;
      email: string | null;
      name: string;
      dob: string;
    }>(
      `SELECT id, email::text, given_name || ' ' || family_name AS name, date_of_birth::text AS dob
         FROM core.person
        WHERE id::text = $1 OR lower(email::text) = lower($1)`,
      [target],
    );
    const who = person.rows[0];
    if (!who) fail(`No person found for "${target}".`);

    await client.query('BEGIN');
    const counts = await clearEntriesFor(client, who.id);
    await assertNoOrphans(client);
    await client.query('COMMIT');

    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    console.log(`${who.name} <${who.email ?? who.id}> — DOB ${who.dob} kept, profile kept.`);
    if (total === 0) {
      console.log('Nothing to clear: this person has no entries.');
    } else {
      for (const [table, n] of Object.entries(counts)) if (n > 0) console.log(`  ${table}: ${n}`);
      console.log('Date of birth can be edited again.');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
