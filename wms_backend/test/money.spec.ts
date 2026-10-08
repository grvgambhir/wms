/**
 * F04/F05: whose debt a payment settles, and what a refund does to tax.
 *
 * Observable behaviour against real Postgres. The counters and CHECKs are the
 * product; a service-layer `if` that passed these would be the wrong reason.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

const CONNECTION = process.env.DATABASE_URL as string;

const id = (n: number) => `00000000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;

const EVENT = id(0xf4000);
const SPORT = id(0xf4001);
const RULE_SET = id(0xf4002);
const RULE_VERSION = id(0xf4003);
const PRODUCT = id(0xf4004);
const TAX_22 = id(0xf4005);
const TAX_10 = id(0xf4006);
const CAPTAIN = id(0xf4010);
const APPROVER = id(0xf4011);
const ROSTER = id(0xf4020);
const ORDER_TEAM = id(0xf4030);
const INTENT_PART = id(0xf4031);

const MEMBER_COUNT = 12;
const LINE_GROSS = 10_000; // €100.00
const ORDER_GROSS = LINE_GROSS * MEMBER_COUNT; // €1,200.00
const PART_PAYMENT = 40_000; // €400.00 → four members

let pool: Pool;

async function person(pid: string, email: string, given: string, family: string): Promise<void> {
  await pool.query(
    `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
     VALUES ($1, $2, $3, $4, '1990-01-15')`,
    [pid, email, given, family],
  );
}

async function profile(personId: string, index: number): Promise<string> {
  const profileId = id(0xf4100 + index);
  await pool.query(
    `INSERT INTO core.athlete_profile (id, person_id, event_id)
     VALUES ($1, $2, $3)`,
    [profileId, personId, EVENT],
  );
  return profileId;
}

async function entry(profileId: string, index: number): Promise<string> {
  const entryId = id(0xf4200 + index);
  await pool.query(
    `INSERT INTO core.registration_entry
       (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id, team_roster_id)
     VALUES ($1, $2, $3, $4, 'competitive', $5, $6)`,
    [entryId, EVENT, profileId, PRODUCT, RULE_VERSION, ROSTER],
  );
  return entryId;
}

beforeAll(async () => {
  pool = new Pool({ connectionString: CONNECTION, max: 4 });
  await pool.query('SELECT 1');

  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1, 'como-f04-f05', 'Como Lake 2027', '2027-09-17', '2027-09-26', '2027-12-31')`,
    [EVENT],
  );
  await pool.query(
    `INSERT INTO core.sport (id, event_id, code, name) VALUES ($1, $2, 'tt', 'Table Tennis')`,
    [SPORT, EVENT],
  );
  await pool.query(
    `INSERT INTO core.rule_set (id, event_id, sport_code) VALUES ($1, $2, 'tt')`,
    [RULE_SET, EVENT],
  );
  await pool.query(
    `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status)
     VALUES ($1, $2, 1, '2027-12-31', tstzrange(now(), NULL), 'draft')`,
    [RULE_VERSION, RULE_SET],
  );
  await pool.query(
    `INSERT INTO core.sport_entry_product
       (id, event_id, sport_id, name, participant_type, rule_set_id)
     VALUES ($1, $2, $3, 'TT 40+ team', 'team', $4)`,
    [PRODUCT, EVENT, SPORT, RULE_SET],
  );
  await pool.query(
    `INSERT INTO core.tax_rule (id, event_id, name, rate_bp, rounding, basis, effective)
     VALUES ($1, $2, 'IVA 22 inclusive', 2200, 'half_up', 'inclusive', tstzrange(now(), NULL))`,
    [TAX_22, EVENT],
  );
  await person(CAPTAIN, 'f04.captain@example.com', 'Casey', 'Captain');
  await person(APPROVER, 'f04.finance@example.com', 'Fin', 'Approver');

  await pool.query(`INSERT INTO core.team_roster (id, event_id, captain_profile_id) VALUES ($1, $2, NULL)`, [
    ROSTER,
    EVENT,
  ]);

    for (let i = 0; i < MEMBER_COUNT; i += 1) {
    const pid = id(0xf4300 + i);
    await person(pid, `f04.m${i}@example.com`, 'Member', `M${i}`);
    const profileId = await profile(pid, i);
    await entry(profileId, i);
    await pool.query(
      `INSERT INTO core.roster_member (id, roster_id, person_id, display_name, date_of_birth, position)
       VALUES ($1, $2, $3, $4, '1990-01-15', $5)`,
      [id(0xf4400 + i), ROSTER, pid, `Member M${i}`, i + 1],
    );
  }

  await pool.query(
    `INSERT INTO core.registration_order (id, event_id, payer_person_id, kind, on_behalf_of)
     VALUES ($1, $2, $3, 'team', $4)`,
    [ORDER_TEAM, EVENT, CAPTAIN, ROSTER],
  );

  for (let i = 0; i < MEMBER_COUNT; i += 1) {
    await pool.query(
      `INSERT INTO core.order_line
         (id, order_id, entry_id, kind, description, unit_net_minor, net_minor,
          tax_rate_bp, tax_minor, tax_code, gross_minor)
       VALUES ($1, $2, $3, 'entry_fee', 'Entry fee', $4, $4, 0, 0, 'N1', $4)`,
      [id(0xf4500 + i), ORDER_TEAM, id(0xf4200 + i), LINE_GROSS],
    );
  }

  await pool.query(
    `INSERT INTO core.payment_intent (id, order_id, payer_person_id, amount_minor, status)
     VALUES ($1, $2, $3, $4, 'pending')`,
    [INTENT_PART, ORDER_TEAM, CAPTAIN, PART_PAYMENT],
  );
  await pool.query('SELECT core.allocate_payment_fifo($1)', [INTENT_PART]);
  await pool.query(`UPDATE core.payment_intent SET status = 'settled' WHERE id = $1`, [INTENT_PART]);
});

afterAll(async () => {
  await pool.end();
});

describe('F04 — payment allocation to members', () => {
  it('€1,200 order, €400 paid → exactly four members paid, eight unpaid (one query)', async () => {
    const header = await pool.query<{ gross_minor: string }>(
      'SELECT gross_minor::text FROM core.registration_order WHERE id = $1',
      [ORDER_TEAM],
    );
    expect(Number(header.rows[0]!.gross_minor)).toBe(ORDER_GROSS);

    const { rows } = await pool.query<{ paid: string; unpaid: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE settled_minor >= due_minor AND due_minor > 0)::text AS paid,
         COUNT(*) FILTER (WHERE settled_minor < due_minor)::text AS unpaid
       FROM core.roster_member_balance
      WHERE roster_id = $1`,
      [ROSTER],
    );

    expect(Number(rows[0]!.paid)).toBe(4);
    expect(Number(rows[0]!.unpaid)).toBe(8);
  });
});

describe('F04 — over-refund is a database rejection', () => {
  it('rejects refunding more than the line has been paid, via CHECK not a service if', async () => {
    const orderId = id(0xf4601);
    const lineId = id(0xf4602);
    const intentId = id(0xf4603);
    const refundId = id(0xf4604);
    const payer = id(0xf4605);
    await person(payer, 'f04.overrefund@example.com', 'Over', 'Refund');
    await pool.query(
      `INSERT INTO core.registration_order (id, event_id, payer_person_id)
       VALUES ($1, $2, $3)`,
      [orderId, EVENT, payer],
    );
    await pool.query(
      `INSERT INTO core.order_line
         (id, order_id, kind, description, unit_net_minor, net_minor,
          tax_rate_bp, tax_minor, tax_code, gross_minor)
       VALUES ($1, $2, 'entry_fee', 'One entry', 10000, 10000, 0, 0, 'N1', 10000)`,
      [lineId, orderId],
    );
    await pool.query(
      `INSERT INTO core.payment_intent (id, order_id, amount_minor) VALUES ($1, $2, 10000)`,
      [intentId, orderId],
    );
    await pool.query('SELECT core.allocate_payment($1, $2, 10000)', [intentId, lineId]);
    await pool.query(
      `INSERT INTO core.refund (id, intent_id, order_id, amount_minor, reason, requested_by)
       VALUES ($1, $2, $3, 10000, 'withdrawal', $4)`,
      [refundId, intentId, orderId, payer],
    );

    await expect(
      pool.query('SELECT core.allocate_refund($1, $2, 10001)', [refundId, lineId]),
    ).rejects.toMatchObject({ code: '23514' });

    const still = await pool.query<{ refunded_minor: string }>(
      'SELECT refunded_minor::text FROM core.order_line WHERE id = $1',
      [lineId],
    );
    expect(Number(still.rows[0]!.refunded_minor)).toBe(0);
  });
});

describe('F05 — refund tax split and credit note', () => {
  it('a 22% €90 gross line refunded in full returns €73.77 net + €16.23 VAT, and the credit note agrees', async () => {
    const split = await pool.query<{ net_minor: string; tax_minor: string }>(
      'SELECT net_minor::text, tax_minor::text FROM core.split_inclusive(9000, 2200)',
    );
    expect(Number(split.rows[0]!.net_minor)).toBe(7377);
    expect(Number(split.rows[0]!.tax_minor)).toBe(1623);

    const orderId = id(0xf4701);
    const lineId = id(0xf4702);
    const intentId = id(0xf4703);
    const refundId = id(0xf4704);
    const payer = id(0xf4705);

    await person(payer, 'f04.vat@example.com', 'Iva', 'Payer');
    await pool.query(
      `INSERT INTO core.registration_order (id, event_id, payer_person_id)
       VALUES ($1, $2, $3)`,
      [orderId, EVENT, payer],
    );
    await pool.query(
      `INSERT INTO core.order_line
         (id, order_id, kind, description, unit_net_minor, net_minor,
          tax_rate_bp, tax_minor, tax_rule_id, gross_minor)
       VALUES ($1, $2, 'entry_fee', 'Taxable entry', 7377, 7377, 2200, 1623, $3, 9000)`,
      [lineId, orderId, TAX_22],
    );
    await pool.query(
      `INSERT INTO core.payment_intent (id, order_id, amount_minor) VALUES ($1, $2, 9000)`,
      [intentId, orderId],
    );
    await pool.query('SELECT core.allocate_payment($1, $2, 9000)', [intentId, lineId]);
    await pool.query(`UPDATE core.payment_intent SET status = 'settled' WHERE id = $1`, [intentId]);

    const invoiceId = await pool.query<{ issue_invoice: string }>(
      `SELECT core.issue_invoice(
         $1, 'INV-F05',
         'World Masters Games', 'IT00000000000', 'Como',
         'Iva Payer', NULL, 'Como'
       )::text AS issue_invoice`,
      [orderId],
    );
    expect(invoiceId.rows[0]!.issue_invoice).toBeTruthy();

    await pool.query(
      `INSERT INTO core.refund
         (id, intent_id, order_id, amount_minor, reason, requested_by, approved_by)
       VALUES ($1, $2, $3, 9000, 'withdrawal', $4, $5)`,
      [refundId, intentId, orderId, payer, APPROVER],
    );
    await pool.query('SELECT core.allocate_refund($1, $2, 9000)', [refundId, lineId]);
    await pool.query(`UPDATE core.refund SET status = 'completed' WHERE id = $1`, [refundId]);

    const refund = await pool.query<{ net_minor: string; tax_minor: string; amount_minor: string }>(
      `SELECT net_minor::text, tax_minor::text, amount_minor::text FROM core.refund WHERE id = $1`,
      [refundId],
    );
    expect(Number(refund.rows[0]!.net_minor)).toBe(7377);
    expect(Number(refund.rows[0]!.tax_minor)).toBe(1623);
    expect(Number(refund.rows[0]!.amount_minor)).toBe(9000);
    expect(
      Number(refund.rows[0]!.net_minor) + Number(refund.rows[0]!.tax_minor),
    ).toBe(Number(refund.rows[0]!.amount_minor));

    const cn = await pool.query<{ issue_credit_note: string }>(
      `SELECT core.issue_credit_note($1, 'NC-F05')::text AS issue_credit_note`,
      [refundId],
    );
    const credit = await pool.query<{
      net_minor: string;
      tax_minor: string;
      gross_minor: string;
      type: string;
    }>(
      `SELECT net_minor::text, tax_minor::text, gross_minor::text, type
         FROM core.invoice WHERE id = $1`,
      [cn.rows[0]!.issue_credit_note],
    );
    expect(credit.rows[0]!.type).toBe('credit_note');
    expect(Number(credit.rows[0]!.net_minor)).toBe(7377);
    expect(Number(credit.rows[0]!.tax_minor)).toBe(1623);
    expect(Number(credit.rows[0]!.gross_minor)).toBe(9000);
    expect(
      Number(credit.rows[0]!.net_minor) + Number(credit.rows[0]!.tax_minor),
    ).toBe(Number(credit.rows[0]!.gross_minor));
  });
});

describe('F05 — invoice snapshot survives a tax-rule change', () => {
  it('re-reading the invoice after a new rate is published still shows the original figures', async () => {
    const orderId = id(0xf4801);
    const lineId = id(0xf4802);
    const payer = id(0xf4803);

    await person(payer, 'f04.snapshot@example.com', 'Snap', 'Shot');
    await pool.query(
      `INSERT INTO core.registration_order (id, event_id, payer_person_id)
       VALUES ($1, $2, $3)`,
      [orderId, EVENT, payer],
    );
    await pool.query(
      `INSERT INTO core.order_line
         (id, order_id, kind, description, unit_net_minor, net_minor,
          tax_rate_bp, tax_minor, tax_rule_id, gross_minor)
       VALUES ($1, $2, 'entry_fee', 'Taxable entry', 7377, 7377, 2200, 1623, $3, 9000)`,
      [lineId, orderId, TAX_22],
    );

    const issued = await pool.query<{ issue_invoice: string }>(
      `SELECT core.issue_invoice(
         $1, 'INV-SNAP',
         'World Masters Games', 'IT00000000000', 'Como',
         'Snap Shot', NULL, 'Como'
       )::text AS issue_invoice`,
      [orderId],
    );
    const invoiceId = issued.rows[0]!.issue_invoice;

    await pool.query(
      `INSERT INTO core.tax_rule (id, event_id, name, rate_bp, rounding, basis, effective)
       VALUES ($1, $2, 'IVA 10 inclusive', 1000, 'half_up', 'inclusive', tstzrange(now(), NULL))`,
      [TAX_10, EVENT],
    );
    await pool.query(`UPDATE core.tax_rule SET status = 'superseded' WHERE id = $1`, [TAX_22]);

    await expect(
      pool.query(`UPDATE core.tax_rule SET rate_bp = 1000 WHERE id = $1`, [TAX_22]),
    ).rejects.toMatchObject({ code: 'P0001' });

    const lines = await pool.query<{
      net_minor: string;
      tax_minor: string;
      gross_minor: string;
      tax_rate_bp: number;
    }>(
      `SELECT net_minor::text, tax_minor::text, gross_minor::text, tax_rate_bp
         FROM core.invoice_line WHERE invoice_id = $1`,
      [invoiceId],
    );
    expect(Number(lines.rows[0]!.net_minor)).toBe(7377);
    expect(Number(lines.rows[0]!.tax_minor)).toBe(1623);
    expect(Number(lines.rows[0]!.gross_minor)).toBe(9000);
    expect(lines.rows[0]!.tax_rate_bp).toBe(2200);

    const naive = await pool.query<{ tax_minor: string }>(
      `SELECT (core.split_inclusive(9000, tr.rate_bp)).tax_minor::text
         FROM core.tax_rule tr
        WHERE tr.event_id = $1 AND tr.status = 'active'
        ORDER BY tr.created_at DESC
        LIMIT 1`,
      [EVENT],
    );
    expect(Number(naive.rows[0]!.tax_minor)).not.toBe(1623);

    await expect(
      pool.query(`UPDATE core.invoice SET tax_minor = 818 WHERE id = $1`, [invoiceId]),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

describe('F05 — rounding remainder', () => {
  it('an amount that does not divide evenly still sums to the order total exactly', async () => {
    const parts = await pool.query<{ total: string }>(
      'SELECT SUM(x)::text AS total FROM unnest(core.distribute_minor(10000, 3)) AS x',
    );
    expect(Number(parts.rows[0]!.total)).toBe(10_000);

    const orderId = id(0xf4901);
    const payer = id(0xf4902);
    await person(payer, 'f04.round@example.com', 'Round', 'Ing');
    await pool.query(
      `INSERT INTO core.registration_order (id, event_id, payer_person_id)
       VALUES ($1, $2, $3)`,
      [orderId, EVENT, payer],
    );

    const splitRows = await pool.query<{ net_minor: string; tax_minor: string; gross: string }>(
      `SELECT s.net_minor::text, s.tax_minor::text, g.gross::text
         FROM unnest(core.distribute_minor(10000, 3)) WITH ORDINALITY AS g(gross, n)
         CROSS JOIN LATERAL core.split_inclusive(g.gross, 2200) AS s`,
    );
    expect(splitRows.rows).toHaveLength(3);

    for (let i = 0; i < 3; i += 1) {
      const net = Number(splitRows.rows[i]!.net_minor);
      const tax = Number(splitRows.rows[i]!.tax_minor);
      const gross = Number(splitRows.rows[i]!.gross);
      expect(net + tax).toBe(gross);
      await pool.query(
        `INSERT INTO core.order_line
           (id, order_id, kind, description, unit_net_minor, net_minor,
            tax_rate_bp, tax_minor, tax_rule_id, gross_minor)
         VALUES ($1, $2, 'entry_fee', $3, $4, $4, 2200, $5, $6, $7)`,
        [id(0xf4910 + i), orderId, `Share ${i}`, net, tax, TAX_22, gross],
      );
    }

    const order = await pool.query<{
      net_minor: string;
      tax_minor: string;
      gross_minor: string;
    }>(
      `SELECT net_minor::text, tax_minor::text, gross_minor::text
         FROM core.registration_order WHERE id = $1`,
      [orderId],
    );
    expect(Number(order.rows[0]!.gross_minor)).toBe(10_000);
    expect(
      Number(order.rows[0]!.net_minor) + Number(order.rows[0]!.tax_minor),
    ).toBe(Number(order.rows[0]!.gross_minor));

    const lineSum = await pool.query<{ n: string; t: string; g: string }>(
      `SELECT SUM(net_minor)::text AS n, SUM(tax_minor)::text AS t, SUM(gross_minor)::text AS g
         FROM core.order_line WHERE order_id = $1`,
      [orderId],
    );
    expect(Number(lineSum.rows[0]!.g)).toBe(10_000);
    expect(Number(lineSum.rows[0]!.n) + Number(lineSum.rows[0]!.t)).toBe(10_000);
  });
});
