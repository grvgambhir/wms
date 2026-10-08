/**
 * REG-15 / OPS-03: the numbers the OC sees on the Operations dashboard.
 *
 * Until now the dashboard rendered hard-coded figures (14,210 paid of 20,000, 1,420 sessions,
 * 48,912 records). Everything here is counted from the database instead, and anything we cannot
 * honestly measure is returned as `null` so the screen can say so rather than invent a number.
 *
 * Every query is a single aggregate over indexed columns — this is the one place a COUNT is the
 * correct shape, unlike a per-page total in a list.
 */

import { Injectable } from '@nestjs/common';
import type { Queryable } from '../common/idempotency/idempotency.service';
import { pool } from '../db/pool';

export type OperationsCapacity = {
  /** Entries whose fees are fully settled (the honest reading of "paid registrations"). */
  paidEntries: number;
  /** Live entries — cancelled, withdrawn and substituted excluded. */
  liveEntries: number;
  /** Sum of quota capacity configured for the event; null when no pool is configured yet. */
  quotaCapacity: number | null;
  quotaConfirmed: number;
  quotaReserved: number;
  /** People with an athlete profile for this event. */
  registeredPeople: number;
  /**
   * Money the gateway settled (and did not refund) minus money the order lines say was paid.
   * Zero is the only healthy value: anything else means our ledger and the payment records
   * disagree, which is exactly what OPS/PAY reconciliation is meant to catch.
   */
  reconciliationVarianceMinor: number;
  chargedMinor: number;
  settledMinor: number;
  unpaidMinor: number;
  currency: 'EUR';
  /** We do not measure live sessions; the dashboard must say so instead of showing a number. */
  activeSessions: null;
};

export type OperationsFunnelStage = {
  id: 'started' | 'submitted' | 'paid';
  value: number;
};

export type OperationsSnapshot = {
  generatedAt: string;
  eventId: string;
  capacity: OperationsCapacity;
  funnel: OperationsFunnelStage[];
  statusCounts: Record<string, number>;
  evidenceBacklog: number;
  waitlisted: number;
};

const minor = (value: string | null): number => Number(value ?? '0');

@Injectable()
export class OperationsSnapshotService {
  // Named `db`, not `pool`: a parameter called `pool` shadows the imported pool inside its own
  // default value and throws at construction (Nest then aborts on app creation).
  constructor(private readonly db: Queryable = pool) {}

  async snapshot(eventId?: string): Promise<OperationsSnapshot> {
    const event = await this.db.query<{ id: string }>(
      `SELECT COALESCE($1::uuid, core.current_event_id()) AS id`,
      [eventId ?? null],
    );
    const id = event.rows[0]!.id;

    const [statuses, balances, quota, people, money] = await Promise.all([
      this.db.query<{ status: string; count: string; evidence_pending: string }>(
        `SELECT status,
                count(*)::text AS count,
                count(*) FILTER (WHERE evidence_status IN ('required','uploaded','under_review'))::text
                  AS evidence_pending
           FROM core.registration_entry
          WHERE event_id = $1
          GROUP BY status`,
        [id],
      ),
      this.db.query<{ live: string; paid: string }>(
        `SELECT count(*)::text AS live,
                count(*) FILTER (WHERE balance.due_minor > 0 AND balance.settled_minor >= balance.due_minor)::text
                  AS paid
           FROM core.entry_balance balance
           JOIN core.registration_entry entry ON entry.id = balance.entry_id
          WHERE entry.event_id = $1`,
        [id],
      ),
      this.db.query<{ capacity: string | null; confirmed: string; reserved: string }>(
        `SELECT sum(capacity)::text AS capacity,
                COALESCE(sum(confirmed), 0)::text AS confirmed,
                COALESCE(sum(reserved), 0)::text AS reserved
           FROM core.quota_pool
          WHERE event_id = $1`,
        [id],
      ),
      this.db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM core.athlete_profile WHERE event_id = $1`,
        [id],
      ),
      this.db.query<{ gross: string; paid: string; ledger_all: string; gateway: string }>(
        `SELECT COALESCE(sum(line.gross_minor) FILTER (WHERE o.status <> 'cancelled'), 0)::text AS gross,
                COALESCE(sum(line.paid_minor - line.refunded_minor)
                           FILTER (WHERE o.status <> 'cancelled'), 0)::text AS paid,
                -- The variance compares like with like: every order, cancelled ones included,
                -- because a cancelled order's settled payment is still real money.
                COALESCE(sum(line.paid_minor - line.refunded_minor), 0)::text AS ledger_all,
                (
                  SELECT COALESCE(sum(intent.amount_minor) FILTER (WHERE intent.status = 'settled'), 0)
                       - COALESCE((
                           SELECT sum(refund.amount_minor)
                             FROM core.refund refund
                             JOIN core.payment_intent ri ON ri.id = refund.intent_id
                             JOIN core.registration_order ro ON ro.id = ri.order_id
                            WHERE ro.event_id = $1
                         ), 0)
                    FROM core.payment_intent intent
                    JOIN core.registration_order io ON io.id = intent.order_id
                   WHERE io.event_id = $1
                )::text AS gateway
           FROM core.order_line line
           JOIN core.registration_order o ON o.id = line.order_id
          WHERE o.event_id = $1`,
        [id],
      ),
    ]);

    const statusCounts: Record<string, number> = {};
    let evidenceBacklog = 0;
    for (const row of statuses.rows) {
      statusCounts[row.status] = Number(row.count);
      evidenceBacklog += Number(row.evidence_pending);
    }
    const started = Object.values(statusCounts).reduce((sum, value) => sum + value, 0);
    const draft = statusCounts.draft ?? 0;
    const paidEntries = Number(balances.rows[0]?.paid ?? '0');
    const charged = minor(money.rows[0]?.gross ?? '0');
    const captured = minor(money.rows[0]?.paid ?? '0');
    const gateway = minor(money.rows[0]?.gateway ?? '0');
    const ledgerAll = minor(money.rows[0]?.ledger_all ?? '0');

    return {
      generatedAt: new Date().toISOString(),
      eventId: id,
      capacity: {
        paidEntries,
        liveEntries: Number(balances.rows[0]?.live ?? '0'),
        quotaCapacity: quota.rows[0]?.capacity == null ? null : Number(quota.rows[0].capacity),
        quotaConfirmed: Number(quota.rows[0]?.confirmed ?? '0'),
        quotaReserved: Number(quota.rows[0]?.reserved ?? '0'),
        registeredPeople: Number(people.rows[0]?.count ?? '0'),
        reconciliationVarianceMinor: gateway - ledgerAll,
        chargedMinor: charged,
        settledMinor: captured,
        unpaidMinor: charged - captured,
        currency: 'EUR',
        activeSessions: null,
      },
      funnel: [
        { id: 'started', value: started },
        { id: 'submitted', value: started - draft },
        { id: 'paid', value: paidEntries },
      ],
      statusCounts,
      evidenceBacklog,
      waitlisted: statusCounts.waitlisted ?? 0,
    };
  }
}
