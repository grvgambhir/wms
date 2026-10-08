/**
 * Issuing invoices and credit notes.
 *
 * THE PART THAT IS NOT ORDINARY CRUD
 * ----------------------------------
 * Invoice numbers must be **gapless and sequential per series**. That is a legal requirement
 * for Italian invoicing, not a preference, and the two obvious implementations are both wrong:
 *
 *   - `max(seq) + 1` read outside a lock collides the moment two invoices are issued at once.
 *   - A Postgres sequence never collides, but `nextval` is non-transactional — a rolled-back
 *     invoice burns its number and leaves a permanent gap.
 *
 * `core.invoice_series` exists to solve exactly this: one row per series holding `next_seq`.
 * Take a row lock, read it, increment it, and insert the invoice **in the same transaction**.
 * Concurrency serialises on the lock, and a rollback takes the increment with it. The
 * `UNIQUE (series, seq)` constraint is the backstop if this logic is ever got wrong.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 * ---------------------------------------
 * No FatturaPA XML, and no call to the SDI exchange. That needs the OC's tax adviser and a
 * registered intermediary, and D4 is still open. The invoice CAPTURES what FatturaPA needs —
 * the seller/buyer identity columns and `buyer_sdi_code` are already on the table — and stops
 * there. `sdi_status` stays null until something actually transmits.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Queryable } from '../common/idempotency/idempotency.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { refuse } from '../people/refuse';

/** Money is whole cents everywhere. `bigint` arrives from `pg` as a string. */
const minor = (value: string | number | null): number => Number(value ?? 0);

export interface InvoiceLineView {
  id: string;
  description: string;
  netMinor: number;
  taxRateBp: number;
  taxCode: string | null;
  taxMinor: number;
  grossMinor: number;
}

export interface InvoiceTaxRow {
  taxRateBp: number;
  taxCode: string | null;
  netMinor: number;
  taxMinor: number;
}

export interface InvoiceView {
  id: string;
  orderId: string;
  type: 'invoice' | 'credit_note';
  correctsId: string | null;
  series: string;
  seq: number;
  number: string;
  netMinor: number;
  taxMinor: number;
  grossMinor: number;
  sdiStatus: string | null;
  issuedAt: string;
  lines: InvoiceLineView[];
  /** Per rate, because an invoice states tax per rate — not one collapsed total. */
  taxSummary: InvoiceTaxRow[];
}

interface SellerIdentity {
  legalName: string;
  vatId: string | null;
  taxCode: string | null;
  address: string;
}

/**
 * The seller is the organising committee, not per-order data. It belongs in configuration;
 * until the OC's legal entity is confirmed (it is one of the open D4 questions) this is the
 * single place to change it, rather than a literal spread through the SQL.
 */
const SELLER: SellerIdentity = {
  legalName: 'World Masters Sport — Como Lake 2027 Organising Committee',
  vatId: null,
  taxCode: null,
  address: 'Como, Italy',
};

@Injectable()
export class InvoicingService {
  constructor(
    private readonly pool: Pool,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  /**
   * Allocates the next number in a series.
   *
   * `FOR UPDATE` is the whole mechanism. Two concurrent issuers queue here rather than both
   * reading the same `next_seq`; whichever rolls back returns its number to the series.
   */
  private async allocateNumber(
    tx: Queryable,
    series: string,
    year: number,
  ): Promise<{ seq: number; number: string }> {
    const locked = await tx.query<{ seq: string; year: number }>(
      `SELECT next_seq::text AS seq, year FROM core.invoice_series WHERE series = $1 FOR UPDATE`,
      [series],
    );
    let seq: number;
    if (!locked.rows[0]) {
      // First invoice in a new series. ON CONFLICT re-reads under the lock rather than
      // failing, so two processes opening the same series concurrently still serialise.
      const created = await tx.query<{ seq: string }>(
        `INSERT INTO core.invoice_series (series, year, next_seq) VALUES ($1, $2, 2)
         ON CONFLICT (series) DO UPDATE SET next_seq = core.invoice_series.next_seq + 1
         RETURNING (next_seq - 1)::text AS seq`,
        [series, year],
      );
      seq = Number(created.rows[0]!.seq);
    } else {
      seq = Number(locked.rows[0].seq);
      await tx.query(`UPDATE core.invoice_series SET next_seq = next_seq + 1 WHERE series = $1`, [
        series,
      ]);
    }
    return { seq, number: `${series}/${year}/${String(seq).padStart(5, '0')}` };
  }

  /** Rebuilds the per-rate tax summary from the lines it was actually built from. */
  private async writeTaxSummary(tx: Queryable, invoiceId: string): Promise<void> {
    await tx.query(
      `INSERT INTO core.invoice_tax_summary (invoice_id, tax_rate_bp, tax_code, net_minor, tax_minor)
       SELECT il.invoice_id, il.tax_rate_bp, il.tax_code,
              sum(il.net_minor), sum(il.tax_minor)
         FROM core.invoice_line il
        WHERE il.invoice_id = $1
        GROUP BY il.invoice_id, il.tax_rate_bp, il.tax_code`,
      [invoiceId],
    );
  }

  /**
   * Issues the invoice for a paid order.
   *
   * Idempotency is `local` mode: everything here is one database transaction and there is no
   * external call to protect against. A repeated key returns the invoice that was already
   * issued rather than burning a second number.
   */
  async issueForOrder(args: {
    orderId: string;
    actorId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
  }): Promise<InvoiceView> {
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/orders/${args.orderId}/invoice`,
        body: { orderId: args.orderId },
        mode: 'local',
      },
      async (tx) => {
        const order = await tx.query<{
          id: string;
          status: string;
          event_id: string;
          payer_person_id: string;
          net_minor: string;
          tax_minor: string;
          gross_minor: string;
        }>(
          `SELECT id, status, event_id, payer_person_id,
                  net_minor::text, tax_minor::text, gross_minor::text
             FROM core.registration_order WHERE id = $1 FOR UPDATE`,
          [args.orderId],
        );
        const row = order.rows[0];
        if (!row) refuse('ORDER_NOT_FOUND', 'finance.order.not_found');

        // An invoice states that money was received. Issuing one for an unpaid order would be
        // a false document, and the number it burned could never be reused.
        if (row.status !== 'paid') {
          refuse('ORDER_NOT_PAID', 'finance.invoice.order_not_paid');
        }

        const existing = await tx.query<{ id: string }>(
          `SELECT id FROM core.invoice WHERE order_id = $1 AND type = 'invoice'`,
          [args.orderId],
        );
        if (existing.rows[0]) {
          return { status: 200, body: await this.read(tx, existing.rows[0].id) };
        }

        // Every buyer column FatturaPA needs is captured here, including the SDI code —
        // transmission is out of scope (D4), but an invoice issued without the identity it
        // requires cannot be transmitted later either.
        const buyer = await tx.query<{
          name: string;
          vat_id: string | null;
          tax_code: string | null;
          address: string;
          sdi_code: string | null;
        }>(
          `SELECT COALESCE(bp.legal_name, p.given_name || ' ' || p.family_name) AS name,
                  bp.vat_id, bp.tax_code, bp.sdi_code,
                  COALESCE(NULLIF(concat_ws(', ', bp.address_line, bp.city, bp.country), ''), '') AS address
             FROM core.person p
             LEFT JOIN core.billing_profile bp ON bp.person_id = p.id AND bp.event_id = $2
            WHERE p.id = $1`,
          [row.payer_person_id, row.event_id],
        );
        const who = buyer.rows[0];

        const year = new Date().getUTCFullYear();
        const series = `COMO27-${year}`;
        const { seq, number } = await this.allocateNumber(tx, series, year);

        const inserted = await tx.query<{ id: string }>(
          `INSERT INTO core.invoice
             (order_id, type, series, seq, number, net_minor, tax_minor, gross_minor,
              seller_legal_name, seller_vat_id, seller_tax_code, seller_address,
              buyer_legal_name, buyer_vat_id, buyer_tax_code, buyer_address, buyer_sdi_code)
           VALUES ($1,'invoice',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           RETURNING id`,
          [
            args.orderId,
            series,
            seq,
            number,
            minor(row.net_minor),
            minor(row.tax_minor),
            minor(row.gross_minor),
            SELLER.legalName,
            SELLER.vatId,
            SELLER.taxCode,
            SELLER.address,
            who?.name ?? 'Unknown',
            who?.vat_id ?? null,
            who?.tax_code ?? null,
            who?.address ?? '',
            who?.sdi_code ?? null,
          ],
        );
        const invoiceId = inserted.rows[0]!.id;

        // Lines are copied, not referenced: an invoice is a statement of what was charged on
        // the day it was issued, and must not change when an order line later does.
        await tx.query(
          `INSERT INTO core.invoice_line
             (invoice_id, order_line_id, description, net_minor, tax_rate_bp, tax_code,
              tax_minor, gross_minor, tax_rule_id)
           SELECT $1, ol.id, ol.description, ol.net_minor, ol.tax_rate_bp, ol.tax_code,
                  ol.tax_minor, ol.gross_minor, ol.tax_rule_id
             FROM core.order_line ol WHERE ol.order_id = $2`,
          [invoiceId, args.orderId],
        );
        await this.writeTaxSummary(tx, invoiceId);

        await tx.query(
          `INSERT INTO audit.activity_log
             (event_id, actor_id, actor_role, action, subject_type, subject_id, after)
           VALUES ($1, $2, 'finance', 'invoice.issue', 'invoice', $3, $4::jsonb)`,
          [
            row.event_id,
            args.actorId,
            invoiceId,
            JSON.stringify({ number, orderId: args.orderId }),
          ],
        );

        return { status: 201, body: await this.read(tx, invoiceId) };
      },
    );
    return result.body as InvoiceView;
  }

  /**
   * Issues a credit note against an invoice.
   *
   * A correction is never an edit. `invoice_no_rewrite` refuses an UPDATE on an issued
   * invoice, and `credit_note_corrects_something` refuses a credit note that names nothing —
   * so the only legal way to change what was stated is to state the opposite, with its own
   * number in the same gapless series.
   *
   * Amounts are stored positive and the `type` carries the sign. Storing negatives would make
   * every sum over `invoice` silently depend on remembering to filter by type.
   */
  async issueCreditNote(args: {
    invoiceId: string;
    actorId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    reasonKey: string;
  }): Promise<InvoiceView> {
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/invoices/${args.invoiceId}/credit-note`,
        body: { invoiceId: args.invoiceId, reasonKey: args.reasonKey },
        mode: 'local',
      },
      async (tx) => {
        const source = await tx.query<{
          id: string;
          order_id: string;
          type: string;
          net_minor: string;
          tax_minor: string;
          gross_minor: string;
          seller_legal_name: string;
          seller_vat_id: string | null;
          seller_tax_code: string | null;
          seller_address: string;
          buyer_legal_name: string;
          buyer_vat_id: string | null;
          buyer_tax_code: string | null;
          buyer_address: string;
          buyer_sdi_code: string | null;
          event_id: string;
        }>(
          `SELECT i.*, o.event_id
             FROM core.invoice i
             JOIN core.registration_order o ON o.id = i.order_id
            WHERE i.id = $1`,
          [args.invoiceId],
        );
        const row = source.rows[0];
        if (!row) refuse('INVOICE_NOT_FOUND', 'finance.invoice.not_found');
        if (row.type !== 'invoice') {
          refuse('NOT_AN_INVOICE', 'finance.credit_note.source_must_be_invoice');
        }

        const existing = await tx.query<{ id: string }>(
          `SELECT id FROM core.invoice WHERE corrects_id = $1`,
          [args.invoiceId],
        );
        if (existing.rows[0]) {
          return { status: 200, body: await this.read(tx, existing.rows[0].id) };
        }

        const year = new Date().getUTCFullYear();
        const series = `COMO27-${year}`;
        const { seq, number } = await this.allocateNumber(tx, series, year);

        const inserted = await tx.query<{ id: string }>(
          `INSERT INTO core.invoice
             (order_id, type, corrects_id, series, seq, number,
              net_minor, tax_minor, gross_minor,
              seller_legal_name, seller_vat_id, seller_tax_code, seller_address,
              buyer_legal_name, buyer_vat_id, buyer_tax_code, buyer_address, buyer_sdi_code)
           VALUES ($1,'credit_note',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           RETURNING id`,
          [
            row.order_id,
            args.invoiceId,
            series,
            seq,
            number,
            minor(row.net_minor),
            minor(row.tax_minor),
            minor(row.gross_minor),
            row.seller_legal_name,
            row.seller_vat_id,
            row.seller_tax_code,
            row.seller_address,
            row.buyer_legal_name,
            row.buyer_vat_id,
            row.buyer_tax_code,
            row.buyer_address,
            row.buyer_sdi_code,
          ],
        );
        const creditId = inserted.rows[0]!.id;

        // The credit note mirrors the invoice's own lines, not the order's — the order may
        // have moved on, and a credit note has to reverse what was actually stated.
        await tx.query(
          `INSERT INTO core.invoice_line
             (invoice_id, order_line_id, description, net_minor, tax_rate_bp, tax_code,
              tax_minor, gross_minor, tax_rule_id)
           SELECT $1, il.order_line_id, il.description, il.net_minor, il.tax_rate_bp,
                  il.tax_code, il.tax_minor, il.gross_minor, il.tax_rule_id
             FROM core.invoice_line il WHERE il.invoice_id = $2`,
          [creditId, args.invoiceId],
        );
        await this.writeTaxSummary(tx, creditId);

        await tx.query(
          `INSERT INTO audit.activity_log
             (event_id, actor_id, actor_role, action, subject_type, subject_id, before, after)
           VALUES ($1, $2, 'finance', 'invoice.credit_note', 'invoice', $3, $4::jsonb, $5::jsonb)`,
          [
            row.event_id,
            args.actorId,
            creditId,
            JSON.stringify({ correctsId: args.invoiceId }),
            JSON.stringify({ number, reasonKey: args.reasonKey }),
          ],
        );

        return { status: 201, body: await this.read(tx, creditId) };
      },
    );
    return result.body as InvoiceView;
  }

  async get(invoiceId: string): Promise<InvoiceView> {
    return this.read(this.pool, invoiceId);
  }

  private async read(tx: Queryable, invoiceId: string): Promise<InvoiceView> {
    const head = await tx.query<{
      id: string;
      order_id: string;
      type: string;
      corrects_id: string | null;
      series: string;
      seq: number;
      number: string;
      net_minor: string;
      tax_minor: string;
      gross_minor: string;
      sdi_status: string | null;
      issued_at: Date;
    }>(
      `SELECT id, order_id, type, corrects_id, series, seq, number,
              net_minor::text, tax_minor::text, gross_minor::text, sdi_status, issued_at
         FROM core.invoice WHERE id = $1`,
      [invoiceId],
    );
    const row = head.rows[0];
    if (!row) refuse('INVOICE_NOT_FOUND', 'finance.invoice.not_found');

    const lines = await tx.query<{
      id: string;
      description: string;
      net_minor: string;
      tax_rate_bp: number;
      tax_code: string | null;
      tax_minor: string;
      gross_minor: string;
    }>(
      `SELECT id, description, net_minor::text, tax_rate_bp, tax_code,
              tax_minor::text, gross_minor::text
         FROM core.invoice_line WHERE invoice_id = $1 ORDER BY description, id`,
      [invoiceId],
    );
    const taxes = await tx.query<{
      tax_rate_bp: number;
      tax_code: string | null;
      net_minor: string;
      tax_minor: string;
    }>(
      `SELECT tax_rate_bp, tax_code, net_minor::text, tax_minor::text
         FROM core.invoice_tax_summary WHERE invoice_id = $1 ORDER BY tax_rate_bp`,
      [invoiceId],
    );

    return {
      id: row.id,
      orderId: row.order_id,
      type: row.type as 'invoice' | 'credit_note',
      correctsId: row.corrects_id,
      series: row.series,
      seq: row.seq,
      number: row.number,
      netMinor: minor(row.net_minor),
      taxMinor: minor(row.tax_minor),
      grossMinor: minor(row.gross_minor),
      sdiStatus: row.sdi_status,
      issuedAt: row.issued_at.toISOString(),
      lines: lines.rows.map((line) => ({
        id: line.id,
        description: line.description,
        netMinor: minor(line.net_minor),
        taxRateBp: line.tax_rate_bp,
        taxCode: line.tax_code,
        taxMinor: minor(line.tax_minor),
        grossMinor: minor(line.gross_minor),
      })),
      taxSummary: taxes.rows.map((tax) => ({
        taxRateBp: tax.tax_rate_bp,
        taxCode: tax.tax_code,
        netMinor: minor(tax.net_minor),
        taxMinor: minor(tax.tax_minor),
      })),
    };
  }
}

function headerKey(headers: { [key: string]: string | string[] | undefined }): string {
  const raw = headers['idempotency-key'];
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0].trim();
  return '';
}
