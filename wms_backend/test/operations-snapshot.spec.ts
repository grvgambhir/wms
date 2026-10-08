/**
 * The Operations dashboard used to render hard-coded figures. These tests pin the replacement:
 * every number is counted from the database, sessions are reported as "not measured" rather than
 * invented, and a ledger that disagrees with the payment records shows a non-zero variance.
 */

import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { OperationsSnapshotService } from '../src/ops/operations-snapshot.service';

let pool: Pool;
let owner: Pool;
let operations: OperationsSnapshotService;

const EVENT = randomUUID();
const SPORT = randomUUID();
const RULE_SET = randomUUID();
const RULE_VERSION = randomUUID();
const PRODUCT = randomUUID();
const POOL_ID = randomUUID();
const PAYER = randomUUID();

async function entry(status: string): Promise<string> {
  const person = randomUUID();
  const profile = randomUUID();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO core.person (id, given_name, family_name, date_of_birth, profile_status)
     VALUES ($1, 'Ops', 'Counted', '1984-03-03', 'complete')`,
    [person],
  );
  await pool.query(`INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1,$2,$3)`, [
    profile,
    person,
    EVENT,
  ]);
  await pool.query(
    `INSERT INTO core.registration_entry
       (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id, status, evidence_status)
     VALUES ($1,$2,$3,$4,'competitive',$5,$6,$7)`,
    [
      id,
      EVENT,
      profile,
      PRODUCT,
      RULE_VERSION,
      status,
      status === 'draft' ? 'required' : 'approved',
    ],
  );
  return id;
}

/**
 * An order with one line. When `settled`, a payment intent is allocated against the line — the
 * allocation trigger is what writes `order_line.paid_minor`, so the ledger and the gateway agree
 * by construction. That is the point: a variance can only appear if something breaks that path.
 */
async function order(entryId: string, opts: { settled: boolean }) {
  const orderId = randomUUID();
  const lineId = randomUUID();
  await pool.query(
    `INSERT INTO core.registration_order (id, event_id, payer_person_id, status, currency)
     VALUES ($1,$2,$3,'awaiting_payment','EUR')`,
    [orderId, EVENT, PAYER],
  );
  await pool.query(
    `INSERT INTO core.order_line
       (id, order_id, entry_id, kind, description, quantity, unit_net_minor, net_minor,
        tax_rate_bp, tax_minor, tax_code, gross_minor)
     VALUES ($1,$2,$3,'entry_fee','Entry',1,10000,10000,0,0,'EXEMPT',10000)`,
    [lineId, orderId, entryId],
  );
  if (opts.settled) {
    const intent = randomUUID();
    await pool.query(
      `INSERT INTO core.payment_intent
         (id, order_id, payer_person_id, psp, psp_intent_id, status, amount_minor, allocated_minor)
       VALUES ($1,$2,$3,'stub',$4,'pending',10000,0)`,
      [intent, orderId, PAYER, `pi_${intent}`],
    );
    // `intent_settled_is_fully_allocated`: the intent can only be marked settled once allocated.
    await pool.query(
      `INSERT INTO core.payment_allocation (intent_id, order_line_id, amount_minor, net_minor, tax_minor)
       VALUES ($1,$2,10000,10000,0)`,
      [intent, lineId],
    );
    await pool.query(`UPDATE core.payment_intent SET status = 'settled' WHERE id = $1`, [intent]);
  }
  return { orderId, lineId };
}

beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL as string, max: 4 });
  owner = new Pool({ connectionString: inject('ownerDatabaseUrl'), max: 2 });
  operations = new OperationsSnapshotService(pool);
  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date, status)
     VALUES ($1,$2,'Ops snapshot','2027-09-17','2027-09-26','2027-12-31','registration_open')`,
    [EVENT, `ops-snapshot-${EVENT.slice(0, 8)}`],
  );
  await pool.query(`INSERT INTO core.sport (id,event_id,code,name) VALUES ($1,$2,$3,'Ops Swim')`, [
    SPORT,
    EVENT,
    `ops-${EVENT.slice(0, 8)}`,
  ]);
  await pool.query(`INSERT INTO core.rule_set (id,event_id,sport_code) VALUES ($1,$2,$3)`, [
    RULE_SET,
    EVENT,
    `ops-${EVENT.slice(0, 8)}`,
  ]);
  await pool.query(
    `INSERT INTO core.rule_version (id,rule_set_id,version_no,reference_date,effective,status)
     VALUES ($1,$2,1,'2027-12-31',tstzrange('2026-01-01',NULL),'draft')`,
    [RULE_VERSION, RULE_SET],
  );
  await pool.query(
    `INSERT INTO core.sport_entry_product (id,event_id,sport_id,name,participant_type,rule_set_id)
     VALUES ($1,$2,$3,'100m','individual',$4)`,
    [PRODUCT, EVENT, SPORT, RULE_SET],
  );
  await pool.query(
    `INSERT INTO core.quota_pool (id,event_id,name,scope_kind,scope_ref,capacity,confirmed,reserved)
     VALUES ($1,$2,'100m places','product',$3,40,2,1)`,
    [POOL_ID, EVENT, PRODUCT],
  );
  await pool.query(
    `INSERT INTO core.person (id,given_name,family_name,date_of_birth,profile_status)
     VALUES ($1,'Ops','Payer','1980-01-01','complete')`,
    [PAYER],
  );
});

afterAll(async () => {
  await owner.end();
  await pool.end();
});

describe('operations snapshot', () => {
  it('counts entries, quota and the funnel from the database', async () => {
    const draft = await entry('draft');
    const pending = await entry('pending_payment');
    const confirmed = await entry('confirmed');
    await order(pending, { settled: false });
    await order(confirmed, { settled: true });
    void draft;

    const snapshot = await operations.snapshot(EVENT);

    expect(snapshot.eventId).toBe(EVENT);
    expect(snapshot.statusCounts).toMatchObject({ draft: 1, pending_payment: 1, confirmed: 1 });
    expect(snapshot.capacity.liveEntries).toBe(3);
    expect(snapshot.capacity.paidEntries).toBe(1);
    expect(snapshot.capacity.registeredPeople).toBe(3);
    expect(snapshot.capacity.quotaCapacity).toBe(40);
    expect(snapshot.capacity.quotaConfirmed).toBe(2);
    expect(snapshot.capacity.quotaReserved).toBe(1);
    expect(snapshot.funnel).toEqual([
      { id: 'started', value: 3 },
      { id: 'submitted', value: 2 },
      { id: 'paid', value: 1 },
    ]);
    expect(snapshot.evidenceBacklog).toBe(1);
    expect(snapshot.capacity.chargedMinor).toBe(20000);
    expect(snapshot.capacity.settledMinor).toBe(10000);
    expect(snapshot.capacity.unpaidMinor).toBe(10000);
    expect(snapshot.capacity.reconciliationVarianceMinor).toBe(0);
  });

  it('never invents a session count', async () => {
    const snapshot = await operations.snapshot(EVENT);
    expect(snapshot.capacity.activeSessions).toBeNull();
  });

  it('shows a non-zero variance when the gateway and the ledger disagree', async () => {
    const drifted = await entry('confirmed');
    const { lineId } = await order(drifted, { settled: true });
    // A settled payment whose amount never reached the order line: exactly the state
    // reconciliation exists to surface. Zero must not be hard-coded on the dashboard.
    // The database refuses this through the application role — the counters are trigger-owned.
    // Forcing it as the owner is the only way to simulate the drift the dashboard must reveal.
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL session_replication_role = replica`);
      await client.query(`UPDATE core.order_line SET paid_minor = 0 WHERE id = $1`, [lineId]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const snapshot = await operations.snapshot(EVENT);
    expect(snapshot.capacity.reconciliationVarianceMinor).toBe(10000);
  });
});
