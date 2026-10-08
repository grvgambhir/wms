/**
 * Cancelling one entry on a shared (team) order must not cancel the order while teammates on the
 * same order are still live. Found by hand-testing the admin Registrations screen: cancelling one
 * basketball player cancelled the €600 team order the other four confirmed players were on.
 */

import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RegistrationMutations } from '../src/registration/registration-mutations';

let pool: Pool;
let mutations: RegistrationMutations;

const EVENT = randomUUID();
const SPORT = randomUUID();
const RULE_SET = randomUUID();
const RULE_VERSION = randomUUID();
const PRODUCT = randomUUID();
const PAYER = randomUUID();

async function sharedOrder(size: number): Promise<{ orderId: string; entries: string[] }> {
  const orderId = randomUUID();
  await pool.query(
    `INSERT INTO core.registration_order (id, event_id, payer_person_id, kind, status, currency)
     VALUES ($1, $2, $3, 'team', 'awaiting_payment', 'EUR')`,
    [orderId, EVENT, PAYER],
  );
  const entries: string[] = [];
  for (let index = 0; index < size; index += 1) {
    const person = randomUUID();
    const profile = randomUUID();
    const entry = randomUUID();
    await pool.query(
      `INSERT INTO core.person (id, given_name, family_name, date_of_birth, profile_status)
       VALUES ($1, 'Team', $2, '1985-01-01', 'complete')`,
      [person, `Member ${index}`],
    );
    await pool.query(
      `INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1, $2, $3)`,
      [profile, person, EVENT],
    );
    await pool.query(
      `INSERT INTO core.registration_entry
         (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id, status)
       VALUES ($1, $2, $3, $4, 'competitive', $5, 'pending_payment')`,
      [entry, EVENT, profile, PRODUCT, RULE_VERSION],
    );
    await pool.query(
      `INSERT INTO core.order_line
         (order_id, entry_id, kind, description, quantity, unit_net_minor, net_minor, tax_rate_bp, tax_minor, tax_code, gross_minor)
       VALUES ($1, $2, 'entry_fee', 'Entry', 1, 12000, 12000, 0, 0, 'EXEMPT', 12000)`,
      [orderId, entry],
    );
    entries.push(entry);
  }
  return { orderId, entries };
}

const cancel = (entryId: string, reason = 'Withdrawn by the athlete') =>
  mutations.transitionEntryStatus({
    registrationEntryId: entryId,
    toStatus: 'cancelled',
    actor: 'admin',
    reason,
    idempotencyKey: randomUUID(),
    actorId: PAYER,
    scope: PAYER,
    requireOwner: false,
  });

const orderStatus = async (orderId: string) =>
  (
    await pool.query<{ status: string }>(
      `SELECT status FROM core.registration_order WHERE id = $1`,
      [orderId],
    )
  ).rows[0]!.status;

beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL as string, max: 4 });
  mutations = new RegistrationMutations(pool);
  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date, status)
     VALUES ($1, $2, 'Shared order', '2027-09-17', '2027-09-26', '2027-12-31', 'registration_open')`,
    [EVENT, `shared-order-${EVENT.slice(0, 8)}`],
  );
  await pool.query(
    `INSERT INTO core.sport (id, event_id, code, name) VALUES ($1, $2, $3, 'Basket')`,
    [SPORT, EVENT, `so-${EVENT.slice(0, 8)}`],
  );
  await pool.query(`INSERT INTO core.rule_set (id, event_id, sport_code) VALUES ($1, $2, $3)`, [
    RULE_SET,
    EVENT,
    `so-${EVENT.slice(0, 8)}`,
  ]);
  await pool.query(
    `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status)
     VALUES ($1, $2, 1, '2027-12-31', tstzrange('2026-01-01', NULL), 'draft')`,
    [RULE_VERSION, RULE_SET],
  );
  await pool.query(
    `INSERT INTO core.sport_entry_product (id, event_id, sport_id, name, participant_type, rule_set_id)
     VALUES ($1, $2, $3, 'Team', 'team', $4)`,
    [PRODUCT, EVENT, SPORT, RULE_SET],
  );
  await pool.query(
    `INSERT INTO core.person (id, given_name, family_name, date_of_birth, profile_status)
     VALUES ($1, 'Team', 'Payer', '1980-01-01', 'complete')`,
    [PAYER],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('cancelling an entry on a shared order', () => {
  it('leaves the order open while other entries on it are still live', async () => {
    const { orderId, entries } = await sharedOrder(3);
    await cancel(entries[0]!);
    expect(await orderStatus(orderId)).toBe('awaiting_payment');
  });

  it('cancels the order once its last live entry is cancelled', async () => {
    const { orderId, entries } = await sharedOrder(2);
    await cancel(entries[0]!);
    expect(await orderStatus(orderId)).toBe('awaiting_payment');
    await cancel(entries[1]!);
    expect(await orderStatus(orderId)).toBe('cancelled');
  });

  it('still cancels a single-entry order', async () => {
    const { orderId, entries } = await sharedOrder(1);
    await cancel(entries[0]!);
    expect(await orderStatus(orderId)).toBe('cancelled');
  });

  it('refuses an admin cancellation with no reason', async () => {
    const { entries } = await sharedOrder(1);
    // The admin screen asks for a reason; the database is what makes it a guarantee.
    await expect(cancel(entries[0]!, '')).rejects.toMatchObject({ code: '23514' });
  });
});
