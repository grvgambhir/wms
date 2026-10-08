/**
 * Refunds, and the two things that must not be got wrong.
 *
 * Dual control is `core.refund_needs_two_people`. The service does NOT pre-check it — it
 * writes the approval and lets Postgres refuse. So the test has to prove the *constraint*
 * fires, not that a TypeScript branch ran: a service check would pass this test while the
 * database stayed open to any other code path.
 *
 * And a refund must not be sent twice. That is worse than a double charge — the money is
 * gone and there is no second capture to reconcile it against.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { IdempotencyService } from '../src/common/idempotency/idempotency.service';
import { runPgTransaction } from '../src/db/pg-transaction';
import { RefundsService } from '../src/finance/refunds.service';
import { StubPaymentProvider } from '../src/registration/payment-provider';

let pool: Pool;
let refunds: RefundsService;
let psp: StubPaymentProvider;

const EVENT = randomUUID();
const PAYER = randomUUID();
const REQUESTER = randomUUID();
const APPROVER = randomUUID();

const headers = (key: string) => ({ 'idempotency-key': key });

/** A paid order with one €100 entry-fee line at 22%. */
async function paidOrder(): Promise<{ orderId: string; lineId: string }> {
  const orderId = randomUUID();
  const lineId = randomUUID();
  const intentId = randomUUID();
  await pool.query(
    `INSERT INTO core.registration_order
       (id, event_id, payer_person_id, kind, status, currency, net_minor, tax_minor, gross_minor)
     VALUES ($1,$2,$3,'individual','paid','EUR',8197,1803,10000)`,
    [orderId, EVENT, PAYER],
  );
  await pool.query(
    `INSERT INTO core.order_line
       (id, order_id, kind, description, quantity, unit_net_minor,
        net_minor, tax_rate_bp, tax_minor, gross_minor)
     VALUES ($1,$2,'entry_fee','Entry fee',1,8197,8197,2200,1803,10000)`,
    [lineId, orderId],
  );
  // `allocated_minor` is a rolled-up total maintained by `payment_allocation_apply`, and
  // `intent_settled_is_fully_allocated` requires it to equal the amount before an intent may
  // be settled. So: insert pending, allocate, then settle — the order a real capture follows.
  await pool.query(
    `INSERT INTO core.payment_intent
       (id, order_id, payer_person_id, psp, status, amount_minor, allocated_minor, currency,
        payment_method, idempotency_scope, idempotency_key, attempt_count, charge_count, psp_intent_id)
     VALUES ($1,$2,$3,'stub','pending',10000,0,'EUR','card',$4,$5,1,1,$6)`,
    [intentId, orderId, PAYER, PAYER, `cap-${intentId}`, `stub_pi_${intentId}`],
  );
  // The line must actually be PAID before it can be refunded — `line_not_over_refunded`
  // is `refunded_minor <= paid_minor`, so a fixture that inserts a settled intent without
  // allocating it to the line would be refunded money that was never received.
  await pool.query(
    `INSERT INTO core.payment_allocation (id, intent_id, order_line_id, amount_minor, net_minor, tax_minor)
     VALUES ($1,$2,$3,10000,8197,1803)`,
    [randomUUID(), intentId, lineId],
  );
  await pool.query(`UPDATE core.payment_intent SET status = 'settled' WHERE id = $1`, [intentId]);
  return { orderId, lineId };
}

beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL as string });
  psp = new StubPaymentProvider();
  refunds = new RefundsService(pool, new IdempotencyService(runPgTransaction, pool), psp);

  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1,$2,'Refunds','2027-09-17','2027-09-26','2027-12-31')`,
    [EVENT, `refunds-${EVENT.slice(0, 8)}`],
  );
  for (const [id, name] of [
    [PAYER, 'Payer'],
    [REQUESTER, 'Requester'],
    [APPROVER, 'Approver'],
  ] as const) {
    await pool.query(
      `INSERT INTO core.person (id, given_name, family_name, date_of_birth, profile_status)
       VALUES ($1,$2,'Refund','1980-01-01','complete')`,
      [id, name],
    );
  }
});

afterAll(async () => {
  await pool.end();
});

describe('dual control', () => {
  it('refuses an approval by the person who requested it — from the database', async () => {
    const { orderId, lineId } = await paidOrder();
    const refund = await refunds.request({
      orderId,
      amountMinor: 10000,
      reasonKey: 'finance.refund.reason.withdrawal',
      requestedBy: REQUESTER,
      scope: REQUESTER,
      headers: headers(randomUUID()),
    });

    await expect(
      refunds.approve({
        refundId: refund.id,
        approvedBy: REQUESTER, // the same person
        allocations: [{ orderLineId: lineId, amountMinor: 10000 }],
        scope: REQUESTER,
        headers: headers(randomUUID()),
      }),
    ).rejects.toMatchObject({ code: '23514' }); // refund_needs_two_people, not a service branch

    const after = await refunds.get(refund.id);
    expect(after.status).toBe('pending');
    expect(after.approvedBy).toBeNull();
  });

  it('completes when a second person approves', async () => {
    const { orderId, lineId } = await paidOrder();
    const refund = await refunds.request({
      orderId,
      amountMinor: 10000,
      reasonKey: 'finance.refund.reason.withdrawal',
      requestedBy: REQUESTER,
      scope: REQUESTER,
      headers: headers(randomUUID()),
    });
    const approved = await refunds.approve({
      refundId: refund.id,
      approvedBy: APPROVER,
      allocations: [{ orderLineId: lineId, amountMinor: 10000 }],
      scope: APPROVER,
      headers: headers(randomUUID()),
    });

    expect(approved.status).toBe('completed');
    expect(approved.approvedBy).toBe(APPROVER);
    expect(approved.allocatedMinor).toBe(10000);
    expect(approved.providerRefundReference).toBeTruthy();
    // gross = net + tax holds on the allocation too, split proportionally by SQL
    const line = approved.allocations[0]!;
    expect(line.amountMinor).toBe(line.netMinor + line.taxMinor);
  });

  it('needs a second person to reject, too', async () => {
    // A rejection is a decision about someone else's request. One person deciding alone
    // in either direction is the thing dual control exists to stop.
    const { orderId } = await paidOrder();
    const refund = await refunds.request({
      orderId,
      amountMinor: 5000,
      reasonKey: 'finance.refund.reason.duplicate',
      requestedBy: REQUESTER,
      scope: REQUESTER,
      headers: headers(randomUUID()),
    });
    await expect(
      refunds.reject({
        refundId: refund.id,
        rejectedBy: REQUESTER,
        reasonKey: 'finance.refund.reason.not_eligible',
        scope: REQUESTER,
        headers: headers(randomUUID()),
      }),
    ).rejects.toMatchObject({ code: 'SAME_PERSON' });
  });
});

describe('money cannot leave twice', () => {
  it('charges the PSP once when the same approval key is replayed', async () => {
    const { orderId, lineId } = await paidOrder();
    const refund = await refunds.request({
      orderId,
      amountMinor: 10000,
      reasonKey: 'finance.refund.reason.withdrawal',
      requestedBy: REQUESTER,
      scope: REQUESTER,
      headers: headers(randomUUID()),
    });
    const key = randomUUID();
    const before = psp.refundCallCount;

    const first = await refunds.approve({
      refundId: refund.id,
      approvedBy: APPROVER,
      allocations: [{ orderLineId: lineId, amountMinor: 10000 }],
      scope: APPROVER,
      headers: headers(key),
    });
    const again = await refunds.approve({
      refundId: refund.id,
      approvedBy: APPROVER,
      allocations: [{ orderLineId: lineId, amountMinor: 10000 }],
      scope: APPROVER,
      headers: headers(key),
    });

    expect(again.id).toBe(first.id);
    expect(again.providerRefundReference).toBe(first.providerRefundReference);
    expect(psp.refundCallCount).toBe(before + 1);
  });

  it('refuses a refund larger than what was captured', async () => {
    const { orderId } = await paidOrder();
    await expect(
      refunds.request({
        orderId,
        amountMinor: 10001,
        reasonKey: 'finance.refund.reason.withdrawal',
        requestedBy: REQUESTER,
        scope: REQUESTER,
        headers: headers(randomUUID()),
      }),
    ).rejects.toMatchObject({ code: 'REFUND_EXCEEDS_CAPTURE' });
  });

  it('refuses a second refund that would exceed the capture in total', async () => {
    // Each request is under the captured amount; together they are not. Checking only the
    // single request is the bug — it lets an order be refunded twice over in instalments.
    const { orderId, lineId } = await paidOrder();
    const first = await refunds.request({
      orderId,
      amountMinor: 6000,
      reasonKey: 'finance.refund.reason.partial',
      requestedBy: REQUESTER,
      scope: REQUESTER,
      headers: headers(randomUUID()),
    });
    await refunds.approve({
      refundId: first.id,
      approvedBy: APPROVER,
      allocations: [{ orderLineId: lineId, amountMinor: 6000 }],
      scope: APPROVER,
      headers: headers(randomUUID()),
    });

    await expect(
      refunds.request({
        orderId,
        amountMinor: 5000,
        reasonKey: 'finance.refund.reason.partial',
        requestedBy: REQUESTER,
        scope: REQUESTER,
        headers: headers(randomUUID()),
      }),
    ).rejects.toMatchObject({ code: 'REFUND_EXCEEDS_CAPTURE' });
  });

  it('refuses allocations that do not add up to the refund', async () => {
    const { orderId, lineId } = await paidOrder();
    const refund = await refunds.request({
      orderId,
      amountMinor: 10000,
      reasonKey: 'finance.refund.reason.withdrawal',
      requestedBy: REQUESTER,
      scope: REQUESTER,
      headers: headers(randomUUID()),
    });
    await expect(
      refunds.approve({
        refundId: refund.id,
        approvedBy: APPROVER,
        allocations: [{ orderLineId: lineId, amountMinor: 9000 }],
        scope: APPROVER,
        headers: headers(randomUUID()),
      }),
    ).rejects.toMatchObject({ code: 'ALLOCATION_MISMATCH' });
  });

  it('refuses to approve a refund that is no longer pending', async () => {
    const { orderId, lineId } = await paidOrder();
    const refund = await refunds.request({
      orderId,
      amountMinor: 10000,
      reasonKey: 'finance.refund.reason.withdrawal',
      requestedBy: REQUESTER,
      scope: REQUESTER,
      headers: headers(randomUUID()),
    });
    await refunds.approve({
      refundId: refund.id,
      approvedBy: APPROVER,
      allocations: [{ orderLineId: lineId, amountMinor: 10000 }],
      scope: APPROVER,
      headers: headers(randomUUID()),
    });
    await expect(
      refunds.approve({
        refundId: refund.id,
        approvedBy: APPROVER,
        allocations: [{ orderLineId: lineId, amountMinor: 10000 }],
        scope: APPROVER,
        headers: headers(randomUUID()), // a NEW key, so idempotency does not mask it
      }),
    ).rejects.toMatchObject({ code: 'REFUND_NOT_PENDING' });
  });
});
