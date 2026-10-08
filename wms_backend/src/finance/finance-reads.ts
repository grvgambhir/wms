/**
 * The three list reads the admin Finance screen merges into settlements.
 *
 * WHY THESE PATHS LOOK ODD
 * ------------------------
 * `/live/orders`, `/live/payments`, `/live/entries` are the shim's names, kept verbatim so the
 * `wms_api` cutover stays a base-URL change rather than a rewrite of `ApiFinanceJourneySource`.
 * "Live" meant "the governed record the participant journey actually mutates", as opposed to
 * the seeded settlement fixtures Finance falls back to. The name is inherited, not chosen.
 *
 * The row → domain mapping is deliberately the same shape the single-row readers in
 * `registration-mutations.ts` produce. Two mappings for one type is how a screen ends up
 * disagreeing with the endpoint that feeds it.
 */

import type { JourneyPayment, RegistrationEntry, RegistrationOrder } from '@wms/domain';
import type { Pool } from 'pg';

/**
 * Finance reads the whole set and merges client-side, so there is no cursor to page with.
 * A hard cap is still needed — 14,000 athletes is ~14,000 orders and an unbounded list would
 * become the response that quietly takes the page down.
 *
 * `total` is the real count, so a capped response is visibly capped rather than silently
 * truncated: `items.length < total` means there is more, and the screen can say so.
 */
export const LIVE_READ_CAP = 5_000;

export interface LiveEnvelope<T> {
  items: T[];
  total: number;
}

const minor = (value: string | number | null): number => Number(value ?? 0);
const iso = (value: Date | string): string =>
  (value instanceof Date ? value : new Date(value)).toISOString();

interface OrderRow {
  id: string;
  entry_id: string | null;
  currency: string;
  subtotal_minor: string;
  service_minor: string;
  gross_minor: string;
  status: string;
  payment_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface PaymentRow {
  id: string;
  order_id: string;
  entry_id: string | null;
  amount_minor: string;
  currency: string;
  payment_method: string;
  status: string;
  psp_intent_id: string | null;
  idempotency_key: string | null;
  attempt_count: number;
  charge_count: number;
  created_at: Date;
  updated_at: Date;
}

/** `settled` is the storage word; the participant-facing vocabulary is `captured`. */
function paymentStatus(status: string): JourneyPayment['status'] {
  if (status === 'settled') return 'captured';
  if (status === 'failed') return 'failed';
  if (status === 'refunded') return 'refunded';
  if (status === 'in_progress') return 'processing';
  return 'pending';
}

export function toLiveOrder(row: OrderRow): RegistrationOrder {
  return {
    id: row.id,
    registrationEntryId: row.entry_id ?? '',
    currency: row.currency as 'EUR',
    subtotalAmountMinor: minor(row.subtotal_minor),
    serviceAmountMinor: minor(row.service_minor),
    totalAmountMinor: minor(row.gross_minor),
    status: row.status as RegistrationOrder['status'],
    ...(row.payment_id ? { paymentId: row.payment_id } : {}),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function toLivePayment(row: PaymentRow): JourneyPayment {
  return {
    id: row.id,
    orderId: row.order_id,
    registrationEntryId: row.entry_id ?? '',
    amountMinor: minor(row.amount_minor),
    currency: row.currency as 'EUR',
    method: row.payment_method as 'card',
    status: paymentStatus(row.status),
    ...(row.psp_intent_id ? { providerReference: row.psp_intent_id } : {}),
    idempotencyKey: row.idempotency_key ?? '',
    attemptCount: row.attempt_count,
    chargeCount: row.charge_count,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export class FinanceReads {
  constructor(private readonly pool: Pool) {}

  async listOrders(): Promise<LiveEnvelope<RegistrationOrder>> {
    const { rows } = await this.pool.query<OrderRow & { total: string }>(
      `SELECT o.id,
              lines.entry_id,
              o.currency,
              lines.subtotal_minor,
              lines.service_minor,
              o.gross_minor::text,
              o.status,
              settled.id AS payment_id,
              o.created_at,
              COALESCE(latest.updated_at, o.created_at) AS updated_at,
              count(*) OVER () ::text AS total
         FROM core.registration_order o
         LEFT JOIN LATERAL (
           SELECT COALESCE(sum(ol.gross_minor) FILTER (WHERE ol.kind = 'entry_fee'), 0)::text AS subtotal_minor,
                  COALESCE(sum(ol.gross_minor) FILTER (WHERE ol.kind = 'add_on'), 0)::text AS service_minor,
                  min(ol.entry_id::text)::uuid AS entry_id
             FROM core.order_line ol WHERE ol.order_id = o.id
         ) lines ON true
         LEFT JOIN LATERAL (
           SELECT pi.updated_at FROM core.payment_intent pi
            WHERE pi.order_id = o.id ORDER BY pi.updated_at DESC LIMIT 1
         ) latest ON true
         LEFT JOIN LATERAL (
           SELECT pi.id FROM core.payment_intent pi
            WHERE pi.order_id = o.id AND pi.status = 'settled'
            ORDER BY pi.created_at DESC LIMIT 1
         ) settled ON true
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT $1`,
      [LIVE_READ_CAP],
    );
    return { items: rows.map(toLiveOrder), total: Number(rows[0]?.total ?? 0) };
  }

  async listPayments(): Promise<LiveEnvelope<JourneyPayment>> {
    const { rows } = await this.pool.query<PaymentRow & { total: string }>(
      `SELECT pi.id, pi.order_id, lines.entry_id,
              pi.amount_minor::text, pi.currency, pi.payment_method, pi.status,
              pi.psp_intent_id, pi.idempotency_key, pi.attempt_count, pi.charge_count,
              pi.created_at, pi.updated_at,
              count(*) OVER () ::text AS total
         FROM core.payment_intent pi
         LEFT JOIN LATERAL (
           SELECT min(ol.entry_id::text)::uuid AS entry_id
             FROM core.order_line ol WHERE ol.order_id = pi.order_id
         ) lines ON true
        ORDER BY pi.created_at DESC, pi.id DESC
        LIMIT $1`,
      [LIVE_READ_CAP],
    );
    return { items: rows.map(toLivePayment), total: Number(rows[0]?.total ?? 0) };
  }

  /**
   * Entries carry no status history here. Finance merges these rows for their status and
   * money, and hydrating a trail per entry would be the N+1 §6 forbids on a list endpoint.
   */
  async listEntries(): Promise<LiveEnvelope<RegistrationEntry>> {
    const { rows } = await this.pool.query<Record<string, unknown> & { total: string }>(
      `SELECT e.id, e.event_id, e.athlete_profile_id, e.sport_entry_product_id,
              e.partner_profile_id, e.grade, e.rule_version_id,
              e.original_category_id, e.original_category_name,
              e.current_category_id, e.current_category_name, e.category_change_reason,
              e.team_roster_id, e.evidence_status, e.status, e.created_at, e.updated_at,
              p.sport_id,
              count(*) OVER () ::text AS total
         FROM core.registration_entry e
         LEFT JOIN core.sport_entry_product p ON p.id = e.sport_entry_product_id
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT $1`,
      [LIVE_READ_CAP],
    );
    const items = rows.map((row) => ({
      id: row.id as string,
      athleteId: row.athlete_profile_id as string,
      eventId: row.event_id as string,
      sportId: (row.sport_id as string) ?? '',
      sportEntryProductId: row.sport_entry_product_id as string,
      partnerAthleteId: (row.partner_profile_id as string) ?? undefined,
      grade: row.grade as RegistrationEntry['grade'],
      ruleId: row.rule_version_id as string,
      ruleVersion: row.rule_version_id as string,
      originalCategoryId: (row.original_category_id as string) ?? undefined,
      originalCategoryName: (row.original_category_name as string) ?? undefined,
      currentCategoryId: (row.current_category_id as string) ?? undefined,
      currentCategoryName: (row.current_category_name as string) ?? undefined,
      categoryChangeReason: (row.category_change_reason as string) ?? undefined,
      teamRosterId: (row.team_roster_id as string) ?? undefined,
      evidenceStatus: row.evidence_status as RegistrationEntry['evidenceStatus'],
      status: row.status as RegistrationEntry['status'],
      createdAt: iso(row.created_at as Date),
      updatedAt: iso(row.updated_at as Date),
    })) as RegistrationEntry[];
    return { items, total: Number(rows[0]?.total ?? 0) };
  }
}
