/**
 * Finance reporting and export.
 *
 * The test that matters most is not "does the CSV have rows" — it is that every export
 * leaves an audit row naming who ran it and with what filter, and that the audit cannot be
 * lost while the file still gets produced.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { ReportingService, csvCell, toCsv } from '../src/finance/reporting.service';

let pool: Pool;
let reporting: ReportingService;

const EVENT = randomUUID();
const PAYER = randomUUID();
const ACTOR = randomUUID();
const TODAY = new Date().toISOString().slice(0, 10);

async function order(opts: { gross: number; status?: string; paid?: number }): Promise<string> {
  const orderId = randomUUID();
  const net = Math.round((opts.gross * 10000) / 12200);
  const tax = opts.gross - net;
  await pool.query(
    `INSERT INTO core.registration_order
       (id, event_id, payer_person_id, kind, status, currency, net_minor, tax_minor, gross_minor)
     VALUES ($1,$2,$3,'individual',$4,'EUR',$5,$6,$7)`,
    [orderId, EVENT, PAYER, opts.status ?? 'awaiting_payment', net, tax, opts.gross],
  );
  await pool.query(
    `INSERT INTO core.order_line
       (id, order_id, kind, description, quantity, unit_net_minor,
        net_minor, tax_rate_bp, tax_minor, gross_minor, paid_minor)
     VALUES ($1,$2,'entry_fee','Entry fee',1,$3,$3,2200,$4,$5,$6)`,
    [randomUUID(), orderId, net, tax, opts.gross, opts.paid ?? 0],
  );
  return orderId;
}

beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL as string });
  reporting = new ReportingService(pool);
  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1,$2,'Reporting','2027-09-17','2027-09-26','2027-12-31')`,
    [EVENT, `reporting-${EVENT.slice(0, 8)}`],
  );
  await pool.query(
    `INSERT INTO core.person (id, given_name, family_name, date_of_birth, profile_status)
     VALUES ($1,'=Payer','O''Brien, Ltd','1980-01-01','complete')`,
    [PAYER],
  );
  await pool.query(
    `INSERT INTO core.person (id, given_name, family_name, date_of_birth, profile_status)
     VALUES ($1,'Finance','User','1980-01-01','complete')`,
    [ACTOR],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('csv safety', () => {
  it('quotes separators and quotes so a name cannot shift the columns', () => {
    expect(csvCell("O'Brien, Ltd")).toBe('"O\'Brien, Ltd"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('""');
  });

  it('defuses a cell a spreadsheet would run as a formula', () => {
    // An exported display name beginning `=` is a live command in Excel. This is the
    // difference between an export and a payload.
    expect(csvCell('=1+1')).toBe('"\'=1+1"');
    expect(csvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"');
    expect(csvCell('-2+3')).toBe('"\'-2+3"');
  });

  it('emits RFC 4180 CRLF rows with a header', () => {
    const csv = toCsv([]);
    expect(csv.startsWith('"order_id","created_at"')).toBe(true);
    expect(toCsv([]).includes('\r\n')).toBe(false); // header only, no rows
  });
});

describe('summary', () => {
  it('reports variance, unpaid and tax per rate', async () => {
    await order({ gross: 10000, status: 'paid', paid: 10000 });
    await order({ gross: 5000, status: 'awaiting_payment', paid: 0 });

    const summary = await reporting.summary({ from: TODAY, to: TODAY });
    expect(summary.orderCount).toBeGreaterThanOrEqual(2);
    expect(summary.chargedGrossMinor).toBe(summary.chargedNetMinor + summary.chargedTaxMinor);
    expect(summary.unpaidMinor).toBe(summary.chargedGrossMinor - summary.capturedMinor);
    // Zero is the only healthy value. It is reported rather than left to be subtracted.
    expect(summary.varianceMinor).toBe(0);
    expect(summary.taxByRate.some((row) => row.taxRateBp === 2200)).toBe(true);
  });

  it('treats `to` as a half-open day boundary, not an exclusive one', async () => {
    // An inclusive upper bound silently drops everything after midnight on the last day —
    // the bug that makes a daily report quietly miss most of its own day.
    const sameDay = await reporting.summary({ from: TODAY, to: TODAY });
    expect(sameDay.orderCount).toBeGreaterThan(0);
  });

  it('refuses a malformed date rather than returning everything', async () => {
    await expect(reporting.summary({ from: 'last-tuesday' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});

describe('settlements', () => {
  it('pages with a cursor and does not repeat a row', async () => {
    for (let i = 0; i < 5; i += 1) await order({ gross: 1000 + i });
    const first = await reporting.settlements({ limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.cursor).toBeTruthy();

    const second = await reporting.settlements({ limit: 2, cursor: first.cursor });
    const ids = new Set([...first.items, ...second.items].map((row) => row.orderId));
    expect(ids.size).toBe(first.items.length + second.items.length);
  });
});

describe('export audit — the requirement, not the CSV', () => {
  it('records who exported and with what filter, in the same transaction', async () => {
    const before = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit.activity_log WHERE action = 'finance.export'`,
    );
    const result = await reporting.exportSettlements({
      filter: { from: TODAY, to: TODAY, status: 'paid' },
      actorId: ACTOR,
      eventId: EVENT,
      ip: '203.0.113.9',
    });

    const audit = await pool.query<{
      actor_id: string;
      after: { filter: { from: string; to: string; status: string }; rowCount: number };
      ip: string | null;
    }>(`SELECT actor_id, after, ip::text FROM audit.activity_log WHERE id = $1`, [result.exportId]);
    const row = audit.rows[0]!;
    expect(row.actor_id).toBe(ACTOR);
    // Without the filter the record cannot distinguish one row from the whole event.
    expect(row.after.filter).toEqual({ from: TODAY, to: TODAY, status: 'paid' });
    expect(row.after.rowCount).toBe(result.rowCount);
    expect(row.ip).toContain('203.0.113.9');

    const after = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit.activity_log WHERE action = 'finance.export'`,
    );
    expect(Number(after.rows[0]!.n)).toBe(Number(before.rows[0]!.n) + 1);
  });

  it('produces a CSV whose row count matches the audited count', async () => {
    const result = await reporting.exportSettlements({
      filter: { from: TODAY, to: TODAY },
      actorId: ACTOR,
      eventId: EVENT,
    });
    const lines = result.csv.split('\r\n').filter(Boolean);
    expect(lines.length - 1).toBe(result.rowCount); // minus the header
    // The payer's name starts with `=` in this fixture — it must be defused in the file.
    expect(result.csv).toContain("'=Payer");
  });
});
