/**
 * Refunds: request → approve by a second person → reverse at the PSP → allocate to lines.
 *
 * WHY THIS IS FOUR STEPS AND NOT ONE
 * ----------------------------------
 * Money leaving the OC is the one operation where a single mistaken click cannot be undone,
 * so `core.refund_needs_two_people` refuses a row whose approver is its requester. That is
 * dual control for money, and it lives in the database because it is the rule someone under
 * time pressure would most like to route around.
 *
 * This service does not re-check it. It inserts the approval and lets Postgres refuse — the
 * same reasoning as the exception queue's `UNIQUE (case_id, signer_id)`. A service-layer
 * check is a second copy of the rule that can disagree with the first.
 *
 * THE PSP CALL IS THE DANGEROUS PART
 * ----------------------------------
 * `external` idempotency mode, without exception. A refund sent twice is worse than a charge
 * sent twice: the money is gone and there is no second capture to reconcile it against. The
 * key is committed as `in_progress` BEFORE the call leaves, so a retry after a timeout finds
 * it rather than reversing the same capture again.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Queryable } from '../common/idempotency/idempotency.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { refuse } from '../people/refuse';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../registration/payment-provider';

const minor = (value: string | number | null): number => Number(value ?? 0);

export interface RefundAllocationView {
  orderLineId: string;
  amountMinor: number;
  netMinor: number;
  taxMinor: number;
}

export interface RefundView {
  id: string;
  orderId: string;
  intentId: string;
  amountMinor: number;
  allocatedMinor: number;
  status: 'pending' | 'approved' | 'completed' | 'rejected';
  reason: string;
  requestedBy: string;
  approvedBy: string | null;
  providerRefundReference: string | null;
  createdAt: string;
  allocations: RefundAllocationView[];
}

export interface RequestedAllocation {
  orderLineId: string;
  amountMinor: number;
}

function headerKey(headers: { [key: string]: string | string[] | undefined }): string {
  const raw = headers['idempotency-key'];
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0].trim();
  return '';
}

@Injectable()
export class RefundsService {
  constructor(
    private readonly pool: Pool,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
  ) {}

  /**
   * Records a refund request. Nothing moves yet — this is one half of a two-person decision,
   * and the PSP is not called until the second half arrives.
   */
  async request(args: {
    orderId: string;
    amountMinor: number;
    reasonKey: string;
    requestedBy: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
  }): Promise<RefundView> {
    if (!Number.isInteger(args.amountMinor) || args.amountMinor <= 0) {
      refuse('VALIDATION_ERROR', 'finance.refund.amount_invalid');
    }

    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/orders/${args.orderId}/refunds`,
        body: { amountMinor: args.amountMinor, reasonKey: args.reasonKey },
        mode: 'local',
      },
      async (tx) => {
        const intent = await tx.query<{ id: string; amount_minor: string; event_id: string }>(
          `SELECT pi.id, pi.amount_minor::text, o.event_id
             FROM core.payment_intent pi
             JOIN core.registration_order o ON o.id = pi.order_id
            WHERE pi.order_id = $1 AND pi.status = 'settled'
            ORDER BY pi.created_at DESC LIMIT 1`,
          [args.orderId],
        );
        const captured = intent.rows[0];
        // You cannot refund what was never captured. Without this the request would sit
        // pending until an approver discovered there was nothing to reverse.
        if (!captured) refuse('NO_CAPTURED_PAYMENT', 'finance.refund.nothing_captured');

        const already = await tx.query<{ total: string }>(
          `SELECT COALESCE(sum(amount_minor), 0)::text AS total
             FROM core.refund WHERE order_id = $1 AND status <> 'rejected'`,
          [args.orderId],
        );
        const headroom = minor(captured.amount_minor) - minor(already.rows[0]?.total ?? '0');
        if (args.amountMinor > headroom) {
          refuse('REFUND_EXCEEDS_CAPTURE', 'finance.refund.exceeds_capture');
        }

        // `net_minor` / `tax_minor` on core.refund are the ALLOCATED running totals, not the
        // requested split — `refund_alloc_tax_agrees` ties them to `allocated_minor`, and
        // `apply_refund_allocation` rolls all three up as each allocation lands. They start at
        // zero; splitting the tax here would put the row in violation the moment it existed.
        const inserted = await tx.query<{ id: string }>(
          `INSERT INTO core.refund
             (intent_id, order_id, amount_minor, net_minor, tax_minor, allocated_minor,
              reason, requested_by, status)
           VALUES ($1, $2, $3, 0, 0, 0, $4, $5, 'pending')
           RETURNING id`,
          [captured.id, args.orderId, args.amountMinor, args.reasonKey, args.requestedBy],
        );

        await this.audit(
          tx,
          captured.event_id,
          args.requestedBy,
          'refund.request',
          inserted.rows[0]!.id,
          {
            amountMinor: args.amountMinor,
            reasonKey: args.reasonKey,
          },
        );

        return { status: 201, body: await this.read(tx, inserted.rows[0]!.id) };
      },
    );
    return result.body as RefundView;
  }

  /**
   * The second person approves, the PSP reverses the capture, and the money is allocated to
   * the lines it came from — all in one operation, because a refund approved but not sent is
   * a state nobody monitors.
   */
  async approve(args: {
    refundId: string;
    approvedBy: string;
    allocations: RequestedAllocation[];
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
  }): Promise<RefundView> {
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/refunds/${args.refundId}/approve`,
        body: { refundId: args.refundId, allocations: args.allocations },
        // External: the PSP call cannot be rolled back by a transaction.
        mode: 'external',
      },
      async (db) => {
        const found = await db.query<{
          id: string;
          status: string;
          amount_minor: string;
          requested_by: string;
          order_id: string;
          event_id: string;
          psp_intent_id: string | null;
          currency: string;
        }>(
          `SELECT r.id, r.status, r.amount_minor::text, r.requested_by, r.order_id,
                  o.event_id, pi.psp_intent_id, o.currency
             FROM core.refund r
             JOIN core.registration_order o ON o.id = r.order_id
             JOIN core.payment_intent pi ON pi.id = r.intent_id
            WHERE r.id = $1
            FOR UPDATE OF r`,
          [args.refundId],
        );
        const refund = found.rows[0];
        if (!refund) refuse('REFUND_NOT_FOUND', 'finance.refund.not_found');
        if (refund.status !== 'pending') {
          refuse('REFUND_NOT_PENDING', 'finance.refund.not_pending');
        }

        // Deliberately NOT checked here: approvedBy !== requestedBy. The UPDATE below carries
        // it to `refund_needs_two_people`, which is the single copy of that rule.
        const allocated = args.allocations.reduce((sum, row) => sum + row.amountMinor, 0);
        if (allocated !== minor(refund.amount_minor)) {
          refuse('ALLOCATION_MISMATCH', 'finance.refund.allocation_mismatch');
        }

        await db.query(
          `UPDATE core.refund SET approved_by = $2, status = 'approved' WHERE id = $1`,
          [args.refundId, args.approvedBy],
        );

        const reversal = await this.payments.refund({
          providerReference: refund.psp_intent_id ?? '',
          amountMinor: BigInt(minor(refund.amount_minor)),
          currency: refund.currency,
          idempotencyKey: `refund:${args.refundId}`,
        });

        // `core.allocate_refund` owns the per-line arithmetic and the over-refund guard.
        // Reimplementing either here would be a second copy that can disagree.
        for (const row of args.allocations) {
          await db.query(`SELECT core.allocate_refund($1, $2, $3)`, [
            args.refundId,
            row.orderLineId,
            row.amountMinor,
          ]);
        }

        await db.query(
          `UPDATE core.refund SET status = 'completed', psp_refund_id = $2 WHERE id = $1`,
          [args.refundId, reversal.providerRefundReference],
        );

        await this.audit(db, refund.event_id, args.approvedBy, 'refund.approve', args.refundId, {
          amountMinor: minor(refund.amount_minor),
          providerRefundReference: reversal.providerRefundReference,
          duplicateRefundPrevented: reversal.duplicateRefundPrevented,
        });

        return { status: 200, body: await this.read(db, args.refundId) };
      },
    );
    return result.body as RefundView;
  }

  async reject(args: {
    refundId: string;
    rejectedBy: string;
    reasonKey: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
  }): Promise<RefundView> {
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/refunds/${args.refundId}/reject`,
        body: { refundId: args.refundId, reasonKey: args.reasonKey },
        mode: 'local',
      },
      async (tx) => {
        const found = await tx.query<{ status: string; requested_by: string; order_id: string }>(
          `SELECT status, requested_by, order_id FROM core.refund WHERE id = $1 FOR UPDATE`,
          [args.refundId],
        );
        const refund = found.rows[0];
        if (!refund) refuse('REFUND_NOT_FOUND', 'finance.refund.not_found');
        if (refund.status !== 'pending') refuse('REFUND_NOT_PENDING', 'finance.refund.not_pending');
        // A rejection is a decision about someone else's request, so it needs the second
        // person too — the same rule as approval, for the same reason.
        if (refund.requested_by === args.rejectedBy) {
          refuse('SAME_PERSON', 'finance.refund.needs_two_people');
        }

        await tx.query(`UPDATE core.refund SET status = 'rejected' WHERE id = $1`, [args.refundId]);
        const event = await tx.query<{ event_id: string }>(
          `SELECT event_id FROM core.registration_order WHERE id = $1`,
          [refund.order_id],
        );
        await this.audit(
          tx,
          event.rows[0]!.event_id,
          args.rejectedBy,
          'refund.reject',
          args.refundId,
          {
            reasonKey: args.reasonKey,
          },
        );
        return { status: 200, body: await this.read(tx, args.refundId) };
      },
    );
    return result.body as RefundView;
  }

  async get(refundId: string): Promise<RefundView> {
    return this.read(this.pool, refundId);
  }

  private async audit(
    tx: Queryable,
    eventId: string,
    actorId: string,
    action: string,
    subjectId: string,
    after: Record<string, unknown>,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO audit.activity_log
         (event_id, actor_id, actor_role, action, subject_type, subject_id, after)
       VALUES ($1, $2, 'finance', $3, 'refund', $4, $5::jsonb)`,
      [eventId, actorId, action, subjectId, JSON.stringify(after)],
    );
  }

  private async read(tx: Queryable, refundId: string): Promise<RefundView> {
    const head = await tx.query<{
      id: string;
      order_id: string;
      intent_id: string;
      amount_minor: string;
      allocated_minor: string;
      status: string;
      reason: string;
      requested_by: string;
      approved_by: string | null;
      psp_refund_id: string | null;
      created_at: Date;
    }>(
      `SELECT id, order_id, intent_id, amount_minor::text, allocated_minor::text, status,
              reason, requested_by, approved_by, psp_refund_id, created_at
         FROM core.refund WHERE id = $1`,
      [refundId],
    );
    const row = head.rows[0];
    if (!row) refuse('REFUND_NOT_FOUND', 'finance.refund.not_found');

    const allocations = await tx.query<{
      order_line_id: string;
      amount_minor: string;
      net_minor: string;
      tax_minor: string;
    }>(
      `SELECT order_line_id, amount_minor::text, net_minor::text, tax_minor::text
         FROM core.refund_allocation WHERE refund_id = $1 ORDER BY allocated_at, id`,
      [refundId],
    );

    return {
      id: row.id,
      orderId: row.order_id,
      intentId: row.intent_id,
      amountMinor: minor(row.amount_minor),
      allocatedMinor: minor(row.allocated_minor),
      status: row.status as RefundView['status'],
      reason: row.reason,
      requestedBy: row.requested_by,
      approvedBy: row.approved_by,
      providerRefundReference: row.psp_refund_id,
      createdAt: row.created_at.toISOString(),
      allocations: allocations.rows.map((alloc) => ({
        orderLineId: alloc.order_line_id,
        amountMinor: minor(alloc.amount_minor),
        netMinor: minor(alloc.net_minor),
        taxMinor: minor(alloc.tax_minor),
      })),
    };
  }
}
