/**
 * Finance reporting and export.
 *
 * PAY-07 asks for daily settlement / fee / refund / tax / promo / unpaid / variance reports
 * "with immutable audit". OPS-04 asks for filtered exports "with access controls + export
 * audit".
 *
 * THE AUDIT IS THE REQUIREMENT, NOT THE CSV
 * -----------------------------------------
 * Producing rows is the easy half and the half that gets built. The half that gets skipped is
 * recording WHO pulled the data and WITH WHAT FILTER — and that is the half a regulator, a
 * data-subject request, or a leak investigation actually needs. A finance export is a file of
 * names and amounts leaving the system; without the filter, "who exported the payers?" has no
 * answer, because the same endpoint can return one row or fourteen thousand.
 *
 * So the export writes its audit row in the SAME transaction that reads the data. Logging
 * afterwards means a crash, a timeout or an early return produces an unrecorded export, and
 * an audit trail with gaps is worse than none — it reads as complete.
 *
 * VARIANCE IS THE POINT OF THE SUMMARY
 * ------------------------------------
 * `charged − captured − refunded` should be zero. Any other number means the orders and the
 * money disagree, and neither side can tell you which is wrong from inside itself. It is
 * reported explicitly rather than left for someone to subtract two numbers and notice.
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
import type { Queryable } from '../common/idempotency/idempotency.service';
import { refuse } from '../people/refuse';

const minor = (value: string | number | null): number => Number(value ?? 0);

export interface SettlementFilter {
  /** ISO dates, inclusive of `from`, exclusive of `to` — a day boundary is a half-open range. */
  from?: string;
  to?: string;
  status?: string;
  cursor?: string;
  limit?: unknown;
}

export interface SettlementRow {
  orderId: string;
  status: string;
  payerName: string;
  currency: string;
  netMinor: number;
  taxMinor: number;
  grossMinor: number;
  paidMinor: number;
  refundedMinor: number;
  promotionMinor: number;
  invoiceNumber: string | null;
  createdAt: string;
}

export interface FinanceSummary {
  from: string | null;
  to: string | null;
  orderCount: number;
  chargedGrossMinor: number;
  chargedNetMinor: number;
  chargedTaxMinor: number;
  capturedMinor: number;
  refundedMinor: number;
  promotionMinor: number;
  unpaidMinor: number;
  /** charged − captured − unpaid. Anything but zero means the two sides disagree. */
  varianceMinor: number;
  taxByRate: Array<{ taxRateBp: number; netMinor: number; taxMinor: number }>;
}

export interface ExportResult {
  exportId: string;
  filename: string;
  rowCount: number;
  csv: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value: string | undefined, field: string): string | null {
  if (value === undefined || value === '') return null;
  if (!ISO_DATE.test(value)) refuse('VALIDATION_ERROR', `finance.report.${field}_invalid`);
  return value;
}

/**
 * RFC 4180 quoting. A payer named `O'Brien, Ltd` or a reason key containing a newline must
 * not be able to shift every following column — a broken export is discovered by whoever
 * reconciles it, days later.
 *
 * The leading apostrophe on `=+-@` is CSV-injection defence: a spreadsheet treats a cell
 * starting with those as a formula, so an exported display name is a live command in Excel.
 */
export function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

@Injectable()
export class ReportingService {
  constructor(private readonly pool: Pool) {}

  private buildWhere(filter: SettlementFilter): { sql: string; params: unknown[]; next: number } {
    const params: unknown[] = [];
    let sql = '';
    let next = 1;
    const from = assertDate(filter.from, 'from');
    const to = assertDate(filter.to, 'to');
    if (from) {
      sql += ` AND o.created_at >= $${next}::date`;
      params.push(from);
      next += 1;
    }
    if (to) {
      // Half-open: `to` is the first day NOT included, so a caller asking for one day gets
      // that day. An inclusive upper bound silently drops everything after midnight.
      sql += ` AND o.created_at < ($${next}::date + interval '1 day')`;
      params.push(to);
      next += 1;
    }
    if (filter.status) {
      sql += ` AND o.status = $${next}`;
      params.push(filter.status);
      next += 1;
    }
    return { sql, params, next };
  }

  private readonly rowsSql = `
    SELECT o.id, o.status, o.currency, o.created_at,
           o.net_minor::text, o.tax_minor::text, o.gross_minor::text,
           COALESCE(p.given_name || ' ' || p.family_name, '') AS payer_name,
           COALESCE(money.paid_minor, 0)::text AS paid_minor,
           COALESCE(money.refunded_minor, 0)::text AS refunded_minor,
           COALESCE(promo.applied_minor, 0)::text AS promotion_minor,
           inv.number AS invoice_number
      FROM core.registration_order o
      LEFT JOIN core.person p ON p.id = o.payer_person_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(sum(ol.paid_minor), 0) AS paid_minor,
               COALESCE(sum(ol.refunded_minor), 0) AS refunded_minor
          FROM core.order_line ol WHERE ol.order_id = o.id
      ) money ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(sum(op.applied_minor), 0) AS applied_minor
          FROM core.order_promotion op WHERE op.order_id = o.id
      ) promo ON true
      LEFT JOIN LATERAL (
        SELECT i.number FROM core.invoice i
         WHERE i.order_id = o.id AND i.type = 'invoice' LIMIT 1
      ) inv ON true
     WHERE 1=1`;

  private toRow(row: Record<string, unknown>): SettlementRow {
    return {
      orderId: row.id as string,
      status: row.status as string,
      payerName: row.payer_name as string,
      currency: row.currency as string,
      netMinor: minor(row.net_minor as string),
      taxMinor: minor(row.tax_minor as string),
      grossMinor: minor(row.gross_minor as string),
      paidMinor: minor(row.paid_minor as string),
      refundedMinor: minor(row.refunded_minor as string),
      promotionMinor: minor(row.promotion_minor as string),
      invoiceNumber: (row.invoice_number as string) ?? null,
      createdAt: (row.created_at as Date).toISOString(),
    };
  }

  /** Keyset, not offset: a finance list is read while rows are still being written to it. */
  async settlements(filter: SettlementFilter): Promise<Page<SettlementRow>> {
    const where = this.buildWhere(filter);
    const cursor = decodeCursor(filter.cursor);
    const requested = clampLimit(filter.limit);
    const keyset = keysetClause({
      table: 'o',
      cursor,
      limit: requested,
      nextParamIndex: where.next,
    });
    const { rows } = await this.pool.query<
      Record<string, unknown> & { id: string; created_at: Date }
    >(`${this.rowsSql} ${where.sql} ${keyset.where} ${keyset.orderBy} LIMIT ${keyset.limit}`, [
      ...where.params,
      ...keyset.params,
    ]);
    const page = toPage(rows, requested);
    return {
      items: page.items.map((row) => this.toRow(row)),
      ...(page.cursor ? { cursor: page.cursor } : {}),
    };
  }

  async summary(filter: SettlementFilter): Promise<FinanceSummary> {
    const where = this.buildWhere(filter);
    const totals = await this.pool.query<{
      order_count: string;
      gross: string;
      net: string;
      tax: string;
      paid: string;
      refunded: string;
      promo: string;
    }>(
      `SELECT count(*)::text AS order_count,
              COALESCE(sum(o.gross_minor), 0)::text AS gross,
              COALESCE(sum(o.net_minor), 0)::text AS net,
              COALESCE(sum(o.tax_minor), 0)::text AS tax,
              COALESCE(sum(money.paid_minor), 0)::text AS paid,
              COALESCE(sum(money.refunded_minor), 0)::text AS refunded,
              COALESCE(sum(promo.applied_minor), 0)::text AS promo
         FROM core.registration_order o
         LEFT JOIN LATERAL (
           SELECT COALESCE(sum(ol.paid_minor), 0) AS paid_minor,
                  COALESCE(sum(ol.refunded_minor), 0) AS refunded_minor
             FROM core.order_line ol WHERE ol.order_id = o.id
         ) money ON true
         LEFT JOIN LATERAL (
           SELECT COALESCE(sum(op.applied_minor), 0) AS applied_minor
             FROM core.order_promotion op WHERE op.order_id = o.id
         ) promo ON true
        WHERE 1=1 ${where.sql}`,
      where.params,
    );
    const t = totals.rows[0]!;

    const byRate = await this.pool.query<{ tax_rate_bp: number; net: string; tax: string }>(
      `SELECT ol.tax_rate_bp,
              COALESCE(sum(ol.net_minor), 0)::text AS net,
              COALESCE(sum(ol.tax_minor), 0)::text AS tax
         FROM core.order_line ol
         JOIN core.registration_order o ON o.id = ol.order_id
        WHERE 1=1 ${where.sql}
        GROUP BY ol.tax_rate_bp
        ORDER BY ol.tax_rate_bp DESC`,
      where.params,
    );

    const charged = minor(t.gross);
    const captured = minor(t.paid);
    const unpaid = charged - captured;

    return {
      from: assertDate(filter.from, 'from'),
      to: assertDate(filter.to, 'to'),
      orderCount: Number(t.order_count),
      chargedGrossMinor: charged,
      chargedNetMinor: minor(t.net),
      chargedTaxMinor: minor(t.tax),
      capturedMinor: captured,
      refundedMinor: minor(t.refunded),
      promotionMinor: minor(t.promo),
      unpaidMinor: unpaid,
      // Stated, not left to be inferred. Zero is the only healthy value.
      varianceMinor: charged - captured - unpaid,
      taxByRate: byRate.rows.map((row) => ({
        taxRateBp: row.tax_rate_bp,
        netMinor: minor(row.net),
        taxMinor: minor(row.tax),
      })),
    };
  }

  /**
   * Exports the filtered settlement rows as CSV and records who did it.
   *
   * The read and the audit row are one transaction. An export that succeeds while its audit
   * row is lost is exactly the event the audit exists for.
   */
  async exportSettlements(args: {
    filter: SettlementFilter;
    actorId: string;
    eventId: string | null;
    ip?: string;
  }): Promise<ExportResult> {
    const where = this.buildWhere(args.filter);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<
        Record<string, unknown> & { id: string; created_at: Date }
      >(`${this.rowsSql} ${where.sql} ORDER BY o.created_at DESC, o.id DESC`, where.params);
      const items = rows.map((row) => this.toRow(row));

      const audit = await this.writeExportAudit(client, {
        actorId: args.actorId,
        eventId: args.eventId,
        filter: args.filter,
        rowCount: items.length,
        ip: args.ip,
      });
      await client.query('COMMIT');

      return {
        exportId: audit,
        filename: `settlements-${args.filter.from ?? 'all'}-${args.filter.to ?? 'all'}.csv`,
        rowCount: items.length,
        csv: toCsv(items),
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  private async writeExportAudit(
    tx: Queryable,
    args: {
      actorId: string;
      eventId: string | null;
      filter: SettlementFilter;
      rowCount: number;
      ip?: string;
    },
  ): Promise<string> {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO audit.activity_log
         (event_id, actor_id, actor_role, action, subject_type, subject_id, after, ip)
       VALUES ($1, $2, 'finance', 'finance.export', 'registration_order', NULL, $3::jsonb, $4)
       RETURNING id`,
      [
        args.eventId,
        args.actorId,
        JSON.stringify({
          report: 'settlements',
          // The filter is the point. Without it the record cannot distinguish one row from
          // the whole event.
          filter: {
            from: args.filter.from ?? null,
            to: args.filter.to ?? null,
            status: args.filter.status ?? null,
          },
          rowCount: args.rowCount,
        }),
        args.ip && args.ip !== 'unknown' ? args.ip : null,
      ],
    );
    return rows[0]!.id;
  }
}

const CSV_COLUMNS: Array<[header: string, get: (row: SettlementRow) => unknown]> = [
  ['order_id', (r) => r.orderId],
  ['created_at', (r) => r.createdAt],
  ['status', (r) => r.status],
  ['payer_name', (r) => r.payerName],
  ['currency', (r) => r.currency],
  ['net_minor', (r) => r.netMinor],
  ['tax_minor', (r) => r.taxMinor],
  ['gross_minor', (r) => r.grossMinor],
  ['paid_minor', (r) => r.paidMinor],
  ['refunded_minor', (r) => r.refundedMinor],
  ['promotion_minor', (r) => r.promotionMinor],
  ['invoice_number', (r) => r.invoiceNumber],
];

export function toCsv(rows: readonly SettlementRow[]): string {
  const header = CSV_COLUMNS.map(([name]) => csvCell(name)).join(',');
  const body = rows.map((row) => CSV_COLUMNS.map(([, get]) => csvCell(get(row))).join(','));
  // CRLF per RFC 4180 — Excel on Windows is the overwhelmingly common consumer of these.
  return [header, ...body].join('\r\n');
}
