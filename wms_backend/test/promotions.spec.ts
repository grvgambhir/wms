/**
 * Promotions, and the arithmetic that has to be exact.
 *
 * The interesting cases are not "does a discount reduce the total". They are: does the
 * discount split correctly across tax rates, does it lose a cent to rounding, and can two
 * orders race past `max_uses`.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { IdempotencyService } from '../src/common/idempotency/idempotency.service';
import { runPgTransaction } from '../src/db/pg-transaction';
import { PromotionsService, distributeMinor } from '../src/finance/promotions.service';

let pool: Pool;
let promotions: PromotionsService;

const EVENT = randomUUID();
const PAYER = randomUUID();
const ACTOR = randomUUID();

const headers = (key: string) => ({ 'idempotency-key': key });

/** An order with a 22% entry fee and, optionally, a 0%-exempt add-on. */
async function order(opts: { exemptGross?: number } = {}): Promise<string> {
  const orderId = randomUUID();
  const feeGross = 10000;
  const feeNet = 8197;
  const feeTax = 1803;
  const exempt = opts.exemptGross ?? 0;
  await pool.query(
    `INSERT INTO core.registration_order
       (id, event_id, payer_person_id, kind, status, currency, net_minor, tax_minor, gross_minor)
     VALUES ($1,$2,$3,'individual','awaiting_payment','EUR',$4,$5,$6)`,
    [orderId, EVENT, PAYER, feeNet + exempt, feeTax, feeGross + exempt],
  );
  await pool.query(
    `INSERT INTO core.order_line
       (id, order_id, kind, description, quantity, unit_net_minor,
        net_minor, tax_rate_bp, tax_minor, gross_minor)
     VALUES ($1,$2,'entry_fee','Entry fee',1,$3,$3,2200,$4,$5)`,
    [randomUUID(), orderId, feeNet, feeTax, feeGross],
  );
  if (exempt > 0) {
    await pool.query(
      `INSERT INTO core.order_line
         (id, order_id, kind, description, quantity, unit_net_minor,
          net_minor, tax_rate_bp, tax_code, tax_minor, gross_minor)
       VALUES ($1,$2,'add_on','Exempt add-on',1,$3,$3,0,'N4',0,$3)`,
      [randomUUID(), orderId, exempt],
    );
  }
  return orderId;
}

async function promo(input: {
  code: string;
  kind: 'percentage' | 'fixed' | 'waiver';
  valueBp?: number;
  valueMinor?: number;
  maxUses?: number;
}): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO core.promotion (id, event_id, code, kind, value_bp, value_minor, max_uses, effective)
     VALUES ($1,$2,$3,$4,$5,$6,$7, tstzrange(now() - interval '1 day', now() + interval '1 day'))`,
    [
      id,
      EVENT,
      input.code,
      input.kind,
      input.valueBp ?? null,
      input.valueMinor ?? null,
      input.maxUses ?? null,
    ],
  );
  return id;
}

const total = async (orderId: string): Promise<number> => {
  const { rows } = await pool.query<{ gross_minor: string }>(
    `SELECT gross_minor::text FROM core.registration_order WHERE id = $1`,
    [orderId],
  );
  return Number(rows[0]!.gross_minor);
};

beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL as string });
  promotions = new PromotionsService(pool, new IdempotencyService(runPgTransaction, pool));
  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1,$2,'Promotions','2027-09-17','2027-09-26','2027-12-31')`,
    [EVENT, `promotions-${EVENT.slice(0, 8)}`],
  );
  for (const [id, name] of [
    [PAYER, 'Payer'],
    [ACTOR, 'Finance'],
  ] as const) {
    await pool.query(
      `INSERT INTO core.person (id, given_name, family_name, date_of_birth, profile_status)
       VALUES ($1,$2,'Promo','1980-01-01','complete')`,
      [id, name],
    );
  }
});

afterAll(async () => {
  await pool.end();
});

describe('distributeMinor', () => {
  it('never loses or invents a cent', () => {
    // Rounding each share independently turns 100 into 33+33+33 and drops a cent from an
    // invoice that has to balance. Largest-remainder gives it to whoever lost the most.
    expect(distributeMinor(100, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(distributeMinor(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(distributeMinor(10000, [8197, 1803]).reduce((a, b) => a + b, 0)).toBe(10000);
    expect(distributeMinor(7, [1, 1, 1, 1, 1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(7);
  });
});

describe('applying a code', () => {
  it('takes a percentage off and rolls the order total up from the lines', async () => {
    const orderId = await order();
    await promo({ code: 'PCT10', kind: 'percentage', valueBp: 1000 });
    const applied = await promotions.apply({
      orderId,
      code: 'PCT10',
      actorId: ACTOR,
      scope: ACTOR,
      headers: headers(randomUUID()),
    });
    expect(applied.appliedMinor).toBe(1000);
    expect(await total(orderId)).toBe(9000);
    expect(applied.orderTotalMinor).toBe(9000);
  });

  it('splits across tax rates instead of inventing or forgiving VAT', async () => {
    // 10000 at 22% plus 5000 exempt. A single discount line would carry one rate and be
    // wrong on both halves — and invoice_tax_summary would show it.
    const orderId = await order({ exemptGross: 5000 });
    await promo({ code: 'SPLIT30', kind: 'percentage', valueBp: 3000 });
    const applied = await promotions.apply({
      orderId,
      code: 'SPLIT30',
      actorId: ACTOR,
      scope: ACTOR,
      headers: headers(randomUUID()),
    });

    expect(applied.appliedMinor).toBe(4500); // 30% of 15000
    const rates = applied.lines.map((line) => line.taxRateBp).sort((a, b) => a - b);
    expect(rates).toEqual([0, 2200]);
    // Proportional to each rate's share: 10000/15000 and 5000/15000
    const byRate = Object.fromEntries(applied.lines.map((l) => [l.taxRateBp, l.grossMinor]));
    expect(byRate[2200]).toBe(-3000);
    expect(byRate[0]).toBe(-1500);
    expect(await total(orderId)).toBe(10500);

    // Every line still satisfies gross = net + tax, including the negative ones
    const { rows } = await pool.query<{ ok: boolean }>(
      `SELECT bool_and(gross_minor = net_minor + tax_minor) AS ok
         FROM core.order_line WHERE order_id = $1`,
      [orderId],
    );
    expect(rows[0]!.ok).toBe(true);
  });

  it('caps at the order total rather than taking it negative', async () => {
    // The OC does not owe money because someone issued a generous code.
    const orderId = await order();
    await promo({ code: 'BIGFIX', kind: 'fixed', valueMinor: 999999 });
    const applied = await promotions.apply({
      orderId,
      code: 'BIGFIX',
      actorId: ACTOR,
      scope: ACTOR,
      headers: headers(randomUUID()),
    });
    expect(applied.appliedMinor).toBe(10000);
    expect(await total(orderId)).toBe(0);
  });

  it('waives the whole order', async () => {
    const orderId = await order();
    await promo({ code: 'WAIVE', kind: 'waiver' });
    await promotions.apply({
      orderId,
      code: 'WAIVE',
      actorId: ACTOR,
      scope: ACTOR,
      headers: headers(randomUUID()),
    });
    expect(await total(orderId)).toBe(0);
  });

  it('does not let a second promotion discount the first one', async () => {
    // Discount lines are excluded from what is discountable. Without that, stacking two 50%
    // codes would compound rather than add, and the second would be computed on a total the
    // first already reduced.
    const orderId = await order();
    await promo({ code: 'HALF_A', kind: 'percentage', valueBp: 5000 });
    await promo({ code: 'HALF_B', kind: 'percentage', valueBp: 5000 });
    await promotions.apply({
      orderId,
      code: 'HALF_A',
      actorId: ACTOR,
      scope: ACTOR,
      headers: headers(randomUUID()),
    });
    const second = await promotions.apply({
      orderId,
      code: 'HALF_B',
      actorId: ACTOR,
      scope: ACTOR,
      headers: headers(randomUUID()),
    });
    expect(second.appliedMinor).toBe(5000); // 50% of 10000, not of the remaining 5000
    expect(await total(orderId)).toBe(0);
  });
});

describe('refusals', () => {
  it('refuses the same promotion twice on one order', async () => {
    const orderId = await order();
    await promo({ code: 'ONCE', kind: 'percentage', valueBp: 1000 });
    await promotions.apply({
      orderId,
      code: 'ONCE',
      actorId: ACTOR,
      scope: ACTOR,
      headers: headers(randomUUID()),
    });
    await expect(
      promotions.apply({
        orderId,
        code: 'ONCE',
        actorId: ACTOR,
        scope: ACTOR,
        headers: headers(randomUUID()),
      }),
    ).rejects.toMatchObject({ code: 'PROMOTION_ALREADY_APPLIED' });
  });

  it('refuses a code past its max uses', async () => {
    await promo({ code: 'ONEUSE', kind: 'fixed', valueMinor: 500, maxUses: 1 });
    await promotions.apply({
      orderId: await order(),
      code: 'ONEUSE',
      actorId: ACTOR,
      scope: ACTOR,
      headers: headers(randomUUID()),
    });
    await expect(
      promotions.apply({
        orderId: await order(),
        code: 'ONEUSE',
        actorId: ACTOR,
        scope: ACTOR,
        headers: headers(randomUUID()),
      }),
    ).rejects.toMatchObject({ code: 'PROMOTION_EXHAUSTED' });
  });

  it('lets only one of two concurrent orders take the last use', async () => {
    // max_uses is a race between different orders, so the lock has to be on the promotion
    // row rather than the order. `promo_not_overused` is the backstop if it is not.
    await promo({ code: 'RACE1', kind: 'fixed', valueMinor: 500, maxUses: 1 });
    const [a, b] = await Promise.allSettled([
      promotions.apply({
        orderId: await order(),
        code: 'RACE1',
        actorId: ACTOR,
        scope: ACTOR,
        headers: headers(randomUUID()),
      }),
      promotions.apply({
        orderId: await order(),
        code: 'RACE1',
        actorId: ACTOR,
        scope: ACTOR,
        headers: headers(randomUUID()),
      }),
    ]);
    const fulfilled = [a, b].filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
    const { rows } = await pool.query<{ used_count: number }>(
      `SELECT used_count FROM core.promotion WHERE event_id = $1 AND code = 'RACE1'`,
      [EVENT],
    );
    expect(rows[0]!.used_count).toBe(1);
  });

  it('refuses an expired code', async () => {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO core.promotion (id, event_id, code, kind, value_bp, effective)
       VALUES ($1,$2,'EXPIRED','percentage',1000,
               tstzrange(now() - interval '10 days', now() - interval '1 day'))`,
      [id, EVENT],
    );
    await expect(
      promotions.apply({
        orderId: await order(),
        code: 'EXPIRED',
        actorId: ACTOR,
        scope: ACTOR,
        headers: headers(randomUUID()),
      }),
    ).rejects.toMatchObject({ code: 'PROMOTION_NOT_EFFECTIVE' });
  });

  it('refuses to discount an order that is already paid', async () => {
    // Money already received cannot be discounted — that is a refund, and a refund is a
    // two-person decision.
    const orderId = await order();
    await pool.query(`UPDATE core.registration_order SET status = 'paid' WHERE id = $1`, [orderId]);
    await promo({ code: 'TOOLATE', kind: 'percentage', valueBp: 1000 });
    await expect(
      promotions.apply({
        orderId,
        code: 'TOOLATE',
        actorId: ACTOR,
        scope: ACTOR,
        headers: headers(randomUUID()),
      }),
    ).rejects.toMatchObject({ code: 'ORDER_ALREADY_PAID' });
  });
});
