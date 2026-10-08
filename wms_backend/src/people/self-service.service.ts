/**
 * The rest of PLT-07: "Participant self-service: profile, **entries**, teams, evidence,
 * payments, **invoices/receipts**, comms, accreditation status, downloadable confirmations."
 *
 * Profile, teams, evidence, comms and accreditation status already have homes. Entries,
 * payments and invoices did not, and their absence had a concrete cost: with no way to ask
 * "what are MY entries?", the participant app carried a hardcoded entry id belonging to a
 * seeded demo athlete. It worked only because `wms_api` had no authentication. The moment the
 * real backend scoped reads to the token, every journey screen 404'd — correctly.
 *
 * So the rule for every method here: **the person comes from the token, never from the
 * request.** No path parameter, no query string, no body field. That is the same guarantee
 * `getJourney` enforces, and it is why these live under `/v1/me` rather than taking an id.
 *
 * Invoices are the interesting case. The issuing endpoints are `finance`/`oc_admin` only —
 * issuing an invoice is an OC act. But a participant is entitled to *their own* receipt, and
 * PLT-07 names it. Same rows, different question: "issue this" versus "show me mine".
 */

import { Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import {
  clampLimit,
  decodeCursor,
  keysetClause,
  toPage,
  type Page,
} from '../common/pagination/keyset';
import { refuse } from './refuse';

const minor = (value: string | number | null): number => Number(value ?? 0);
const iso = (value: Date | string): string =>
  (value instanceof Date ? value : new Date(value)).toISOString();

export interface MyEntry {
  id: string;
  eventId: string;
  eventName: string;
  sportId: string;
  sportName: string;
  sportEntryProductId: string;
  productName: string;
  grade: string;
  categoryName: string | null;
  status: string;
  evidenceStatus: string;
  teamRosterId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MyInvoice {
  id: string;
  orderId: string;
  type: 'invoice' | 'credit_note';
  number: string;
  netMinor: number;
  taxMinor: number;
  grossMinor: number;
  currency: string;
  issuedAt: string;
}

export interface MyPayment {
  id: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  method: string;
  status: string;
  createdAt: string;
}

@Injectable()
export class SelfServiceService {
  constructor(private readonly pool: Pool) {}

  /**
   * The signed-in person's entries.
   *
   * An athlete who has not entered anything gets an EMPTY LIST, not a 404. "Nothing yet" is
   * the normal state of every athlete before they register, and the state every real user is
   * in today — a 404 there would make a working app look broken.
   */
  async entries(args: {
    personId: string;
    eventId?: string;
    cursor?: string;
    limit?: unknown;
  }): Promise<Page<MyEntry>> {
    const params: unknown[] = [args.personId];
    let filter = '';
    let next = 2;
    if (args.eventId) {
      filter = ` AND e.event_id = $${next}`;
      params.push(args.eventId);
      next += 1;
    }
    const requested = clampLimit(args.limit);
    const keyset = keysetClause({
      table: 'e',
      cursor: decodeCursor(args.cursor),
      limit: requested,
      nextParamIndex: next,
    });

    const { rows } = await this.pool.query<
      Record<string, unknown> & { id: string; created_at: Date }
    >(
      `SELECT e.id, e.event_id, e.sport_entry_product_id, e.grade, e.status,
              e.evidence_status, e.team_roster_id, e.created_at, e.updated_at,
              COALESCE(e.current_category_name, e.original_category_name) AS category_name,
              ev.name AS event_name,
              sp.id AS sport_id, sp.name AS sport_name,
              pr.name AS product_name
         FROM core.registration_entry e
         JOIN core.athlete_profile ap ON ap.id = e.athlete_profile_id
         JOIN core.event ev ON ev.id = e.event_id
         LEFT JOIN core.sport_entry_product pr ON pr.id = e.sport_entry_product_id
         LEFT JOIN core.sport sp ON sp.id = pr.sport_id
        WHERE ap.person_id = $1 ${filter} ${keyset.where}
        ${keyset.orderBy}
        LIMIT ${keyset.limit}`,
      [...params, ...keyset.params],
    );

    const page = toPage(rows, requested);
    return {
      items: page.items.map((row) => ({
        id: row.id as string,
        eventId: row.event_id as string,
        eventName: (row.event_name as string) ?? '',
        sportId: (row.sport_id as string) ?? '',
        sportName: (row.sport_name as string) ?? '',
        sportEntryProductId: row.sport_entry_product_id as string,
        productName: (row.product_name as string) ?? '',
        grade: row.grade as string,
        categoryName: (row.category_name as string) ?? null,
        status: row.status as string,
        evidenceStatus: row.evidence_status as string,
        teamRosterId: (row.team_roster_id as string) ?? null,
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at as Date),
      })),
      ...(page.cursor ? { cursor: page.cursor } : {}),
    };
  }

  /** Invoices and credit notes for orders this person paid for. */
  async invoices(personId: string): Promise<MyInvoice[]> {
    const { rows } = await this.pool.query<{
      id: string;
      order_id: string;
      type: string;
      number: string;
      net_minor: string;
      tax_minor: string;
      gross_minor: string;
      currency: string;
      issued_at: Date;
    }>(
      `SELECT i.id, i.order_id, i.type, i.number,
              i.net_minor::text, i.tax_minor::text, i.gross_minor::text,
              o.currency, i.issued_at
         FROM core.invoice i
         JOIN core.registration_order o ON o.id = i.order_id
        WHERE o.payer_person_id = $1
        ORDER BY i.issued_at DESC, i.id DESC`,
      [personId],
    );
    return rows.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      type: row.type as MyInvoice['type'],
      number: row.number,
      netMinor: minor(row.net_minor),
      taxMinor: minor(row.tax_minor),
      grossMinor: minor(row.gross_minor),
      currency: row.currency,
      issuedAt: iso(row.issued_at),
    }));
  }

  /**
   * One invoice, scoped in the WHERE clause.
   *
   * The refusal is deliberately identical whether the invoice does not exist or belongs to
   * someone else — distinguishing them turns this into a probe for which invoice ids are real.
   */
  async invoice(personId: string, invoiceId: string): Promise<MyInvoice> {
    const { rows } = await this.pool.query<{
      id: string;
      order_id: string;
      type: string;
      number: string;
      net_minor: string;
      tax_minor: string;
      gross_minor: string;
      currency: string;
      issued_at: Date;
    }>(
      `SELECT i.id, i.order_id, i.type, i.number,
              i.net_minor::text, i.tax_minor::text, i.gross_minor::text,
              o.currency, i.issued_at
         FROM core.invoice i
         JOIN core.registration_order o ON o.id = i.order_id
        WHERE i.id = $1 AND o.payer_person_id = $2`,
      [invoiceId, personId],
    );
    const row = rows[0];
    if (!row) refuse('INVOICE_NOT_FOUND', 'finance.invoice.not_found');
    return {
      id: row.id,
      orderId: row.order_id,
      type: row.type as MyInvoice['type'],
      number: row.number,
      netMinor: minor(row.net_minor),
      taxMinor: minor(row.tax_minor),
      grossMinor: minor(row.gross_minor),
      currency: row.currency,
      issuedAt: iso(row.issued_at),
    };
  }

  /** This person's payment history. Provider references stay out — they are an OC concern. */
  async payments(personId: string): Promise<MyPayment[]> {
    const { rows } = await this.pool.query<{
      id: string;
      order_id: string;
      amount_minor: string;
      currency: string;
      payment_method: string;
      status: string;
      created_at: Date;
    }>(
      `SELECT pi.id, pi.order_id, pi.amount_minor::text, pi.currency,
              pi.payment_method, pi.status, pi.created_at
         FROM core.payment_intent pi
        WHERE pi.payer_person_id = $1
        ORDER BY pi.created_at DESC, pi.id DESC`,
      [personId],
    );
    return rows.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      amountMinor: minor(row.amount_minor),
      currency: row.currency,
      method: row.payment_method,
      // `settled` is storage vocabulary; a participant reads "captured".
      status: row.status === 'settled' ? 'captured' : row.status,
      createdAt: iso(row.created_at),
    }));
  }
}
