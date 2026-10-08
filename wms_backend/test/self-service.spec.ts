/**
 * PLT-07's missing thirds: entries, invoices and payments under `/v1/me`.
 *
 * The test that matters is not "does it return rows". It is that a second athlete's rows are
 * absent — and that the check lives in the SQL, because that is where the guarantee is. A
 * service-layer filter would pass this test while the query stayed open to any other caller.
 *
 * This is the gap that produced the 404 after the wms_api cutover: with no way to ask "what
 * are MY entries?", the participant app carried a hardcoded id belonging to someone else.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { SelfServiceService } from '../src/people/self-service.service';

let pool: Pool;
let selfService: SelfServiceService;

const EVENT = randomUUID();
const SPORT = randomUUID();
const RULE_SET = randomUUID();
const RULE_VERSION = randomUUID();
const PRODUCT = randomUUID();
const ALICE = randomUUID();
const BOB = randomUUID();
const NEWCOMER = randomUUID();
const ALICE_PROFILE = randomUUID();
const BOB_PROFILE = randomUUID();
const ALICE_ENTRY = randomUUID();
const BOB_ENTRY = randomUUID();
const ALICE_ORDER = randomUUID();
const ALICE_INVOICE = randomUUID();
const BOB_ORDER = randomUUID();
const BOB_INVOICE = randomUUID();
const ALICE_INTENT = randomUUID();

beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL as string });
  selfService = new SelfServiceService(pool);

  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1,$2,'Self Service','2027-09-17','2027-09-26','2027-12-31')`,
    [EVENT, `self-service-${EVENT.slice(0, 8)}`],
  );
  await pool.query(
    `INSERT INTO core.sport (id, event_id, code, name) VALUES ($1,$2,$3,'Selfserve Swimming')`,
    [SPORT, EVENT, `ss-${EVENT.slice(0, 8)}`],
  );
  await pool.query(`INSERT INTO core.rule_set (id, event_id, sport_code) VALUES ($1,$2,$3)`, [
    RULE_SET,
    EVENT,
    `ss-${EVENT.slice(0, 8)}`,
  ]);
  await pool.query(
    `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status)
     VALUES ($1,$2,1,'2027-12-31', tstzrange(now(), NULL), 'draft')`,
    [RULE_VERSION, RULE_SET],
  );
  await pool.query(
    `INSERT INTO core.sport_entry_product (id, event_id, sport_id, name, participant_type, rule_set_id)
     VALUES ($1,$2,$3,'50m Freestyle','individual',$4)`,
    [PRODUCT, EVENT, SPORT, RULE_SET],
  );

  for (const [person, name] of [
    [ALICE, 'Alice'],
    [BOB, 'Bob'],
    [NEWCOMER, 'Newcomer'],
  ] as const) {
    await pool.query(
      `INSERT INTO core.person (id, given_name, family_name, date_of_birth, profile_status)
       VALUES ($1,$2,'Self','1985-04-02','complete')`,
      [person, name],
    );
  }
  for (const [profile, person] of [
    [ALICE_PROFILE, ALICE],
    [BOB_PROFILE, BOB],
  ] as const) {
    await pool.query(
      `INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1,$2,$3)`,
      [profile, person, EVENT],
    );
  }
  for (const [entry, profile] of [
    [ALICE_ENTRY, ALICE_PROFILE],
    [BOB_ENTRY, BOB_PROFILE],
  ] as const) {
    await pool.query(
      `INSERT INTO core.registration_entry
         (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id,
          status, original_category_name)
       VALUES ($1,$2,$3,$4,'competitive',$5,'confirmed','40–44')`,
      [entry, EVENT, profile, PRODUCT, RULE_VERSION],
    );
  }

  for (const [orderId, invoiceId, person, seq] of [
    [ALICE_ORDER, ALICE_INVOICE, ALICE, 9001],
    [BOB_ORDER, BOB_INVOICE, BOB, 9002],
  ] as const) {
    await pool.query(
      `INSERT INTO core.registration_order
         (id, event_id, payer_person_id, kind, status, currency, net_minor, tax_minor, gross_minor)
       VALUES ($1,$2,$3,'individual','paid','EUR',8197,1803,10000)`,
      [orderId, EVENT, person],
    );
    await pool.query(
      `INSERT INTO core.invoice
         (id, order_id, type, series, seq, number, net_minor, tax_minor, gross_minor,
          seller_legal_name, seller_address, buyer_legal_name, buyer_address)
       VALUES ($1,$2,'invoice','SELFTEST',$3,$4,8197,1803,10000,'OC','Como','Buyer','Somewhere')`,
      [invoiceId, orderId, seq, `SELFTEST/${seq}`],
    );
  }
  await pool.query(
    `INSERT INTO core.payment_intent
       (id, order_id, payer_person_id, psp, status, amount_minor, allocated_minor, currency,
        payment_method, idempotency_scope, idempotency_key, attempt_count, charge_count)
     VALUES ($1,$2,$3,'stub','pending',10000,0,'EUR','card',$4,$5,1,1)`,
    [ALICE_INTENT, ALICE_ORDER, ALICE, ALICE, `ss-${ALICE_INTENT}`],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('GET /v1/me/entries', () => {
  it("returns only the caller's own entries", async () => {
    const mine = await selfService.entries({ personId: ALICE });
    const ids = mine.items.map((row) => row.id);
    expect(ids).toContain(ALICE_ENTRY);
    expect(ids).not.toContain(BOB_ENTRY);
  });

  it('hydrates enough for the app to route without a second call', async () => {
    // The app needs to pick an entry and go. Returning ids alone would force it to fetch the
    // journey for each just to render a list.
    const mine = await selfService.entries({ personId: ALICE });
    const entry = mine.items.find((row) => row.id === ALICE_ENTRY)!;
    expect(entry).toMatchObject({
      eventId: EVENT,
      sportId: SPORT,
      sportName: 'Selfserve Swimming',
      productName: '50m Freestyle',
      status: 'confirmed',
      categoryName: '40–44',
    });
  });

  it('gives an athlete with no entries an empty list, not a 404', async () => {
    // Every athlete is in this state before they register — and every real user is in it
    // today. A 404 here makes a working app look broken.
    const none = await selfService.entries({ personId: NEWCOMER });
    expect(none.items).toEqual([]);
    expect(none.cursor).toBeUndefined();
  });

  it('filters by event without widening past the caller', async () => {
    const other = await selfService.entries({ personId: ALICE, eventId: randomUUID() });
    expect(other.items).toEqual([]);
  });
});

describe('GET /v1/me/invoices', () => {
  it("returns the caller's receipts and not another payer's", async () => {
    const mine = await selfService.invoices(ALICE);
    const numbers = mine.map((row) => row.number);
    expect(numbers).toContain('SELFTEST/9001');
    expect(numbers).not.toContain('SELFTEST/9002');
  });

  it("refuses another payer's invoice with the same answer as a missing one", async () => {
    // Distinguishing the two turns this endpoint into a probe for which invoice ids exist.
    const stranger = await selfService.invoice(ALICE, BOB_INVOICE).catch((e) => e);
    const missing = await selfService.invoice(ALICE, randomUUID()).catch((e) => e);
    expect(stranger.code).toBe(missing.code);
    expect(stranger.message).toBe(missing.message);
  });

  it("returns the caller's own invoice", async () => {
    const invoice = await selfService.invoice(ALICE, ALICE_INVOICE);
    expect(invoice.number).toBe('SELFTEST/9001');
    expect(invoice.grossMinor).toBe(invoice.netMinor + invoice.taxMinor);
  });
});

describe('GET /v1/me/payments', () => {
  it("returns only the caller's payments, in participant vocabulary", async () => {
    const mine = await selfService.payments(ALICE);
    expect(mine.some((row) => row.id === ALICE_INTENT)).toBe(true);
    expect(await selfService.payments(BOB)).not.toContainEqual(
      expect.objectContaining({ id: ALICE_INTENT }),
    );
  });

  it('does not leak the provider reference to the participant', async () => {
    // The PSP's own id is an OC reconciliation concern; it has no place on a receipt screen.
    const mine = await selfService.payments(ALICE);
    expect(Object.keys(mine[0] ?? {})).not.toContain('providerReference');
  });
});
