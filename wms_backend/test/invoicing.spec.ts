/**
 * Invoice numbering, and why it gets its own spec.
 *
 * Gapless sequential numbering per series is a legal requirement for Italian invoicing, and
 * the two obvious implementations each fail in a way unit tests do not reach: `max(seq)+1`
 * collides only under concurrency, and a Postgres sequence leaves a gap only on rollback.
 * So both are tested against real concurrent transactions rather than asserted.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { IdempotencyService } from '../src/common/idempotency/idempotency.service';
import { runPgTransaction } from '../src/db/pg-transaction';
import { InvoicingService } from '../src/finance/invoicing.service';

let pool: Pool;
let invoicing: InvoicingService;

const EVENT = randomUUID();
const PAYER = randomUUID();
const ACTOR = randomUUID();
const SERIES = `COMO27-${new Date().getUTCFullYear()}`;

const headers = (key: string) => ({ 'idempotency-key': key });

async function makePaidOrder(grossMinor: number, rateBp = 2200): Promise<string> {
  const orderId = randomUUID();
  const net = Math.round((grossMinor * 10000) / (10000 + rateBp));
  const tax = grossMinor - net;
  await pool.query(
    `INSERT INTO core.registration_order
       (id, event_id, payer_person_id, kind, status, currency, net_minor, tax_minor, gross_minor)
     VALUES ($1,$2,$3,'individual','paid','EUR',$4,$5,$6)`,
    [orderId, EVENT, PAYER, net, tax, grossMinor],
  );
  await pool.query(
    `INSERT INTO core.order_line
       (id, order_id, kind, description, quantity, unit_net_minor,
        net_minor, tax_rate_bp, tax_minor, gross_minor)
     VALUES ($1,$2,'entry_fee','Entry fee',1,$3,$3,$4,$5,$6)`,
    [randomUUID(), orderId, net, rateBp, tax, grossMinor],
  );
  return orderId;
}

beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL as string });
  invoicing = new InvoicingService(pool, new IdempotencyService(runPgTransaction, pool));

  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1,$2,'Invoicing','2027-09-17','2027-09-26','2027-12-31')`,
    [EVENT, `invoicing-${EVENT.slice(0, 8)}`],
  );
  for (const [id, name] of [
    [PAYER, 'Payer'],
    [ACTOR, 'Finance'],
  ] as const) {
    await pool.query(
      `INSERT INTO core.person (id, given_name, family_name, date_of_birth, profile_status)
       VALUES ($1,$2,'Invoice','1980-01-01','complete')`,
      [id, name],
    );
  }
});

afterAll(async () => {
  await pool.end();
});

describe('numbering', () => {
  it('refuses to invoice an order that has not been paid', async () => {
    // An invoice states money was received. Issuing one for an unpaid order is a false
    // document, and the number it burned could never be reused.
    const unpaid = randomUUID();
    await pool.query(
      `INSERT INTO core.registration_order
         (id, event_id, payer_person_id, kind, status, currency, net_minor, tax_minor, gross_minor)
       VALUES ($1,$2,$3,'individual','awaiting_payment','EUR',8197,1803,10000)`,
      [unpaid, EVENT, PAYER],
    );
    await expect(
      invoicing.issueForOrder({
        orderId: unpaid,
        actorId: ACTOR,
        scope: ACTOR,
        headers: headers(randomUUID()),
      }),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_PAID' });
  });

  it('issues consecutive numbers with no gap', async () => {
    const first = await invoicing.issueForOrder({
      orderId: await makePaidOrder(10000),
      actorId: ACTOR,
      scope: ACTOR,
      headers: headers(randomUUID()),
    });
    const second = await invoicing.issueForOrder({
      orderId: await makePaidOrder(12000),
      actorId: ACTOR,
      scope: ACTOR,
      headers: headers(randomUUID()),
    });
    expect(second.seq).toBe(first.seq + 1);
    expect(second.number).toBe(
      `${SERIES}/${new Date().getUTCFullYear()}/${String(second.seq).padStart(5, '0')}`,
    );
  });

  it('does not burn a number when the transaction rolls back', async () => {
    // This is what rules out a Postgres sequence: nextval is non-transactional, so a failed
    // invoice would leave a permanent hole in a legally gapless series.
    const before = await pool.query<{ next_seq: string }>(
      `SELECT next_seq::text FROM core.invoice_series WHERE series = $1`,
      [SERIES],
    );
    await expect(
      invoicing.issueForOrder({
        orderId: randomUUID(), // no such order — fails after the series row is read
        actorId: ACTOR,
        scope: ACTOR,
        headers: headers(randomUUID()),
      }),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
    const after = await pool.query<{ next_seq: string }>(
      `SELECT next_seq::text FROM core.invoice_series WHERE series = $1`,
      [SERIES],
    );
    expect(after.rows[0]!.next_seq).toBe(before.rows[0]!.next_seq);
  });

  it('gives two concurrent issuers different numbers, with no gap between them', async () => {
    // The failure this rules out is `max(seq)+1`: correct in every sequential test, and it
    // hands two invoices the same number the first time two people click at once.
    const [a, b] = await Promise.all([
      invoicing.issueForOrder({
        orderId: await makePaidOrder(9000),
        actorId: ACTOR,
        scope: ACTOR,
        headers: headers(randomUUID()),
      }),
      invoicing.issueForOrder({
        orderId: await makePaidOrder(9500),
        actorId: ACTOR,
        scope: ACTOR,
        headers: headers(randomUUID()),
      }),
    ]);
    expect(a.seq).not.toBe(b.seq);
    expect(Math.abs(a.seq - b.seq)).toBe(1);
    expect(a.number).not.toBe(b.number);
  });

  it('returns the same invoice on a repeated idempotency key, without a second number', async () => {
    const orderId = await makePaidOrder(11000);
    const key = randomUUID();
    const first = await invoicing.issueForOrder({
      orderId,
      actorId: ACTOR,
      scope: ACTOR,
      headers: headers(key),
    });
    const again = await invoicing.issueForOrder({
      orderId,
      actorId: ACTOR,
      scope: ACTOR,
      headers: headers(key),
    });
    expect(again.id).toBe(first.id);
    expect(again.number).toBe(first.number);
  });
});

describe('content', () => {
  it('states tax per rate rather than one collapsed total', async () => {
    // VAT at 22% and an exempt line cannot be added together on an invoice.
    const orderId = await makePaidOrder(10000);
    await pool.query(
      `INSERT INTO core.order_line
         (id, order_id, kind, description, quantity, unit_net_minor,
          net_minor, tax_rate_bp, tax_code, tax_minor, gross_minor)
       VALUES ($1,$2,'add_on','Exempt item',1,5000,5000,0,'N4',0,5000)`,
      [randomUUID(), orderId],
    );
    await pool.query(
      `UPDATE core.registration_order
          SET net_minor = net_minor + 5000, gross_minor = gross_minor + 5000 WHERE id = $1`,
      [orderId],
    );
    const invoice = await invoicing.issueForOrder({
      orderId,
      actorId: ACTOR,
      scope: ACTOR,
      headers: headers(randomUUID()),
    });
    const rates = invoice.taxSummary.map((row) => row.taxRateBp).sort((x, y) => x - y);
    expect(rates).toEqual([0, 2200]);
    expect(invoice.grossMinor).toBe(invoice.netMinor + invoice.taxMinor);
  });

  it('refuses to rewrite an issued invoice — twice over', async () => {
    const invoice = await invoicing.issueForOrder({
      orderId: await makePaidOrder(7000),
      actorId: ACTOR,
      scope: ACTOR,
      headers: headers(randomUUID()),
    });

    // Layer 1: the application role has INSERT on core.invoice and no UPDATE at all, so the
    // statement never reaches the trigger. A privilege is a stronger guarantee than a check,
    // because it cannot be bypassed by a code path that forgets to go through the service.
    await expect(
      pool.query(`UPDATE core.invoice SET net_minor = 1 WHERE id = $1`, [invoice.id]),
    ).rejects.toMatchObject({ code: '42501' });

    // Layer 2 is `invoice_no_rewrite`, which refuses the UPDATE even for a connection that
    // HAS the grant — a migration, or a future role change. It cannot be exercised from here:
    // `app_rw` is correctly refused `SET ROLE wms`, which is itself the restricted-boundary
    // guarantee working. Asserting the trigger's existence is the honest test available.
    const trigger = await pool.query<{ tgname: string }>(
      `SELECT tgname FROM pg_trigger
        WHERE tgrelid = 'core.invoice'::regclass AND NOT tgisinternal AND tgname = 'invoice_no_rewrite'`,
    );
    expect(trigger.rows).toHaveLength(1);
  });

  it('corrects by credit note, in the same series, mirroring the invoice', async () => {
    const invoice = await invoicing.issueForOrder({
      orderId: await makePaidOrder(8000),
      actorId: ACTOR,
      scope: ACTOR,
      headers: headers(randomUUID()),
    });
    const credit = await invoicing.issueCreditNote({
      invoiceId: invoice.id,
      actorId: ACTOR,
      scope: ACTOR,
      headers: headers(randomUUID()),
      reasonKey: 'finance.credit_note.reason.withdrawal',
    });
    expect(credit.type).toBe('credit_note');
    expect(credit.correctsId).toBe(invoice.id);
    expect(credit.series).toBe(invoice.series);
    expect(credit.seq).toBeGreaterThan(invoice.seq);
    // Amounts positive, sign carried by `type` — so a sum over core.invoice cannot silently
    // depend on someone remembering to filter.
    expect(credit.grossMinor).toBe(invoice.grossMinor);
    expect(credit.lines).toHaveLength(invoice.lines.length);
  });

  it('refuses a credit note on a credit note', async () => {
    const invoice = await invoicing.issueForOrder({
      orderId: await makePaidOrder(6000),
      actorId: ACTOR,
      scope: ACTOR,
      headers: headers(randomUUID()),
    });
    const credit = await invoicing.issueCreditNote({
      invoiceId: invoice.id,
      actorId: ACTOR,
      scope: ACTOR,
      headers: headers(randomUUID()),
      reasonKey: 'finance.credit_note.reason.error',
    });
    await expect(
      invoicing.issueCreditNote({
        invoiceId: credit.id,
        actorId: ACTOR,
        scope: ACTOR,
        headers: headers(randomUUID()),
        reasonKey: 'finance.credit_note.reason.error',
      }),
    ).rejects.toMatchObject({ code: 'NOT_AN_INVOICE' });
  });
});
