/**
 * `npm run dev:clear-entries` — a development tool, tested because it deletes money rows with
 * triggers and foreign-key checks switched off. The guarantees: the person's own entries and
 * everything hanging off them go; quota capacity comes back; the person, profile, DOB and
 * consents stay; nobody else's data is touched; and nothing is left pointing at a deleted row.
 */

import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { assertNoOrphans, clearEntriesFor } from '../scripts/lib/clear-entries';
import { IdempotencyService } from '../src/common/idempotency/idempotency.service';
import { runPgTransaction } from '../src/db/pg-transaction';
import { InvoicingService } from '../src/finance/invoicing.service';
import { RegistrationMutations } from '../src/registration/registration-mutations';

let app: Pool;
let owner: Pool;
let mutations: RegistrationMutations;
let invoicing: InvoicingService;

const EVENT = randomUUID();
const SPORT = randomUUID();
const RULE_SET = randomUUID();
const RULE_VERSION = randomUUID();
const PRODUCT = randomUUID();
const POOL_ID = randomUUID();
const TAX = randomUUID();

async function athlete(): Promise<string> {
  const id = randomUUID();
  await app.query(
    `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth, profile_status)
     VALUES ($1, $2, 'Clear', 'Me', '1985-06-01', 'complete')`,
    [id, `${id}@example.com`],
  );
  for (const kind of ['terms_and_conditions', 'privacy_policy', 'eligibility_medical_evidence']) {
    await app.query(
      `INSERT INTO core.consent (person_id, event_id, kind, granted, version, source)
       VALUES ($1, $2, $3, true, 'v1', 'participant')`,
      [id, EVENT, kind],
    );
  }
  return id;
}

/** Entry → submitted (quota reserved, order) → paid → invoiced. The fullest state there is. */
async function paidEntry(person: string): Promise<{ entryId: string; orderId: string }> {
  const entry = await mutations.createEntry({
    sportEntryProductId: PRODUCT,
    grade: 'competitive',
    idempotencyKey: randomUUID(),
    actorId: person,
    scope: person,
  });
  const decision = await mutations.saveEntry({
    registrationEntryId: entry.id,
    sportEntryProductId: PRODUCT,
    grade: 'competitive',
    idempotencyKey: randomUUID(),
    actorId: person,
    scope: person,
  });
  const orderId = decision.order!.id;
  await mutations.payOrder({
    orderId,
    idempotencyKey: randomUUID(),
    method: 'card',
    simulateFirstAttemptTimeout: false,
    actorId: person,
    scope: person,
  });
  await invoicing.issueForOrder({
    orderId,
    actorId: person,
    scope: person,
    headers: { 'idempotency-key': randomUUID() },
  });
  return { entryId: entry.id, orderId };
}

async function clear(person: string): Promise<Record<string, number>> {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    const counts = await clearEntriesFor(client, person);
    await assertNoOrphans(client);
    await client.query('COMMIT');
    return counts;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const quota = async () =>
  (
    await app.query<{ reserved: number; confirmed: number }>(
      `SELECT reserved, confirmed FROM core.quota_pool WHERE id = $1`,
      [POOL_ID],
    )
  ).rows[0]!;

beforeAll(async () => {
  app = new Pool({ connectionString: process.env.DATABASE_URL as string, max: 4 });
  owner = new Pool({ connectionString: inject('ownerDatabaseUrl'), max: 2 });
  const idempotency = new IdempotencyService(runPgTransaction, app);
  mutations = new RegistrationMutations(app);
  invoicing = new InvoicingService(app, idempotency);

  await app.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date, status)
     VALUES ($1, $2, 'Clear Entries', '2027-09-17', '2027-09-26', '2027-12-31', 'registration_open')`,
    [EVENT, `clear-${EVENT}`],
  );
  await app.query(
    `INSERT INTO core.sport (id, event_id, code, name) VALUES ($1, $2, $3, 'Clear Swim')`,
    [SPORT, EVENT, `clr-${EVENT.slice(0, 8)}`],
  );
  await app.query(`INSERT INTO core.rule_set (id, event_id, sport_code) VALUES ($1, $2, $3)`, [
    RULE_SET,
    EVENT,
    `clr-${EVENT.slice(0, 8)}`,
  ]);
  await app.query(
    `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status)
     VALUES ($1, $2, 1, '2027-12-31', tstzrange('2026-01-01', NULL), 'draft')`,
    [RULE_VERSION, RULE_SET],
  );
  await app.query(
    `INSERT INTO core.rule_dimension
       (rule_version_id, ordinal, attribute, aggregation, exclude_roles, rounding, value_scale, band_kind, bands)
     VALUES ($1, 1, 'age', 'self', '{}', 'floor', 0, 'range', '[{"id":"b40","name":"40–44","min":40,"max":44}]'::jsonb)`,
    [RULE_VERSION],
  );
  await app.query(
    `INSERT INTO core.tax_rule (id, event_id, name, rate_bp, rounding, basis, effective, status)
     VALUES ($1, $2, 'IVA 22', 2200, 'half_up', 'inclusive', tstzrange('2026-01-01', NULL), 'active')`,
    [TAX, EVENT],
  );
  await app.query(
    `INSERT INTO core.sport_entry_product (id, event_id, sport_id, name, participant_type, rule_set_id)
     VALUES ($1, $2, $3, '100m', 'individual', $4)`,
    [PRODUCT, EVENT, SPORT, RULE_SET],
  );
  await app.query(
    `INSERT INTO core.fee (event_id, sport_entry_product_id, grade, currency, base_amount_minor, effective)
     VALUES ($1, $2, 'competitive', 'EUR', 6500, tstzrange('2026-01-01', NULL))`,
    [EVENT, PRODUCT],
  );
  await app.query(
    `INSERT INTO core.quota_pool (id, event_id, name, scope_kind, scope_ref, capacity)
     VALUES ($1, $2, '100m places', 'product', $3, 50)`,
    [POOL_ID, EVENT, PRODUCT],
  );
});

afterAll(async () => {
  await owner.end();
  await app.end();
});

describe('dev:clear-entries', () => {
  it('removes a paid, invoiced entry and gives the quota place back', async () => {
    const before = await quota();
    const person = await athlete();
    const { entryId, orderId } = await paidEntry(person);
    const during = await quota();
    expect(during.reserved + during.confirmed).toBe(before.reserved + before.confirmed + 1);

    const counts = await clear(person);
    expect(counts.registration_entry).toBe(1);
    expect(counts.invoice).toBeGreaterThanOrEqual(1);
    expect(counts.payment_intent).toBeGreaterThanOrEqual(1);

    expect(await quota()).toEqual(before);
    for (const [table, column, id] of [
      ['core.registration_entry', 'id', entryId],
      ['core.registration_order', 'id', orderId],
      ['core.invoice', 'order_id', orderId],
      ['core.payment_intent', 'order_id', orderId],
      ['core.entry_status_event', 'entry_id', entryId],
    ] as const) {
      const { rows } = await app.query(`SELECT 1 FROM ${table} WHERE ${column} = $1`, [id]);
      expect(rows, table).toHaveLength(0);
    }
  });

  it('keeps the person, profile, DOB and consents — and the DOB can be changed again', async () => {
    const person = await athlete();
    await paidEntry(person);

    await expect(
      app.query(`UPDATE core.person SET date_of_birth = '1983-01-01' WHERE id = $1`, [person]),
    ).rejects.toMatchObject({ code: '23514' });

    await clear(person);

    const kept = await app.query<{ dob: string; status: string; consents: number }>(
      `SELECT date_of_birth::text AS dob, profile_status AS status,
              (SELECT count(*)::int FROM core.consent WHERE person_id = p.id) AS consents
         FROM core.person p WHERE id = $1`,
      [person],
    );
    expect(kept.rows[0]).toEqual({ dob: '1985-06-01', status: 'complete', consents: 3 });

    await app.query(`UPDATE core.person SET date_of_birth = '1983-01-01' WHERE id = $1`, [person]);
  });

  it('does not touch anybody else', async () => {
    const mine = await athlete();
    const theirs = await athlete();
    await paidEntry(mine);
    const other = await paidEntry(theirs);

    await clear(mine);

    const { rows } = await app.query<{ status: string }>(
      `SELECT status FROM core.registration_entry WHERE id = $1`,
      [other.entryId],
    );
    expect(rows[0]?.status).toBe('confirmed');
  });

  it('lets the person register again straight away', async () => {
    const person = await athlete();
    await paidEntry(person);
    await clear(person);
    const again = await mutations.createEntry({
      sportEntryProductId: PRODUCT,
      grade: 'competitive',
      idempotencyKey: randomUUID(),
      actorId: person,
      scope: person,
    });
    expect(again.status).toBe('draft');
  });

  it('is a no-op for someone with no entries', async () => {
    const person = await athlete();
    const counts = await clear(person);
    expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(0);
  });
});
