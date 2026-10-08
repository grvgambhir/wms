/**
 * The work behind `npm run dev:clear-entries` — kept separate from the CLI so a test can run it
 * against a real migrated database. See `scripts/dev-clear-entries.ts` for what it deletes, what it
 * keeps, and why this is a script rather than a switch in the app.
 *
 * Both functions expect to run inside a transaction the caller owns, as a superuser (the deletes
 * use `session_replication_role = replica`). `clearEntriesFor` then `assertNoOrphans`, then commit.
 */

import type { PoolClient } from 'pg';

export async function clearEntriesFor(
  client: PoolClient,
  personId: string,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const run = async (label: string, sql: string, params: unknown[]) => {
    const result = await client.query(sql, params);
    counts[label] = (counts[label] ?? 0) + (result.rowCount ?? 0);
  };

  const entries = (
    await client.query<{ id: string }>(
      `SELECT e.id FROM core.registration_entry e
         JOIN core.athlete_profile ap ON ap.id = e.athlete_profile_id
        WHERE ap.person_id = $1`,
      [personId],
    )
  ).rows.map((row) => row.id);

  const orders = (
    await client.query<{ id: string; foreign_lines: number }>(
      `SELECT o.id,
              count(*) FILTER (WHERE ol.entry_id IS NOT NULL AND NOT (ol.entry_id = ANY($1::uuid[])))::int
                AS foreign_lines
         FROM core.registration_order o
         JOIN core.order_line ol ON ol.order_id = o.id
        WHERE o.id IN (SELECT order_id FROM core.order_line WHERE entry_id = ANY($1::uuid[]))
        GROUP BY o.id`,
      [entries],
    )
  ).rows;
  const shared = orders.filter((order) => order.foreign_lines > 0);
  if (shared.length > 0) {
    throw new Error(
      `Refusing: order ${shared[0]!.id} also pays for someone else's entry. Clear that manually.`,
    );
  }
  const orderIds = orders.map((order) => order.id);

  // Give quota places back BEFORE the consumption rows disappear; the counters are maintained by
  // the application, not derived, so deleting the rows alone would leak capacity.
  await client.query(
    `UPDATE core.quota_pool qp
        SET reserved = qp.reserved - c.reserved_units,
            confirmed = qp.confirmed - c.confirmed_units,
            updated_at = now()
       FROM (SELECT quota_pool_id,
                    COALESCE(sum(units) FILTER (WHERE state = 'reserved'), 0)::int AS reserved_units,
                    COALESCE(sum(units) FILTER (WHERE state = 'confirmed'), 0)::int AS confirmed_units
               FROM core.entry_quota_consumption
              WHERE entry_id = ANY($1::uuid[]) AND state <> 'released'
              GROUP BY quota_pool_id) c
      WHERE qp.id = c.quota_pool_id`,
    [entries],
  );

  await client.query(`SET LOCAL session_replication_role = replica`);

  const e = [entries];
  const o = [orderIds];
  // Money, leaves first.
  await run(
    'invoice_tax_summary',
    `DELETE FROM core.invoice_tax_summary WHERE invoice_id IN (SELECT id FROM core.invoice WHERE order_id = ANY($1::uuid[]))`,
    o,
  );
  await run(
    'invoice_line',
    `DELETE FROM core.invoice_line WHERE invoice_id IN (SELECT id FROM core.invoice WHERE order_id = ANY($1::uuid[])) OR order_line_id IN (SELECT id FROM core.order_line WHERE order_id = ANY($1::uuid[]))`,
    o,
  );
  await run(
    'invoice',
    `DELETE FROM core.invoice WHERE order_id = ANY($1::uuid[]) OR refund_id IN (SELECT id FROM core.refund WHERE order_id = ANY($1::uuid[]))`,
    o,
  );
  await run(
    'refund_allocation',
    `DELETE FROM core.refund_allocation WHERE refund_id IN (SELECT id FROM core.refund WHERE order_id = ANY($1::uuid[])) OR order_line_id IN (SELECT id FROM core.order_line WHERE order_id = ANY($1::uuid[]))`,
    o,
  );
  await run('refund', `DELETE FROM core.refund WHERE order_id = ANY($1::uuid[])`, o);
  await run(
    'payment_event',
    `DELETE FROM core.payment_event WHERE intent_id IN (SELECT id FROM core.payment_intent WHERE order_id = ANY($1::uuid[]))`,
    o,
  );
  await run(
    'payment_allocation',
    `DELETE FROM core.payment_allocation WHERE intent_id IN (SELECT id FROM core.payment_intent WHERE order_id = ANY($1::uuid[])) OR order_line_id IN (SELECT id FROM core.order_line WHERE order_id = ANY($1::uuid[]))`,
    o,
  );
  await run(
    'payment_intent',
    `DELETE FROM core.payment_intent WHERE order_id = ANY($1::uuid[])`,
    o,
  );
  await run(
    'order_promotion',
    `DELETE FROM core.order_promotion WHERE order_id = ANY($1::uuid[])`,
    o,
  );
  await run('order_line', `DELETE FROM core.order_line WHERE order_id = ANY($1::uuid[])`, o);
  await run(
    'registration_order',
    `DELETE FROM core.registration_order WHERE id = ANY($1::uuid[])`,
    o,
  );

  // Restricted evidence tied to the entries (no FK from core by design, so listed by hand).
  await run(
    'restricted.evidence_document_application',
    `DELETE FROM restricted.evidence_document_application WHERE entry_id = ANY($1::uuid[])`,
    e,
  );
  await run(
    'restricted.evidence_waiver',
    `DELETE FROM restricted.evidence_waiver WHERE entry_id = ANY($1::uuid[])`,
    e,
  );
  await run(
    'restricted.evidence_document',
    `DELETE FROM restricted.evidence_document WHERE entry_id = ANY($1::uuid[])`,
    e,
  );

  // Everything else that points at an entry.
  await run(
    'exception_signature',
    `DELETE FROM ops.exception_signature WHERE case_id IN (SELECT id FROM ops.exception_case WHERE entry_id = ANY($1::uuid[]))`,
    e,
  );
  await run('exception_case', `DELETE FROM ops.exception_case WHERE entry_id = ANY($1::uuid[])`, e);
  await run(
    'accreditation (unlinked, kept)',
    `UPDATE core.accreditation SET registration_entry_id = NULL WHERE registration_entry_id = ANY($1::uuid[])`,
    e,
  );
  for (const table of [
    'entry_quota_consumption',
    'entry_status_event',
    'category_audit',
    'waitlist_entry',
    'order_line',
    'evidence_obligation_application',
    'evidence_waiver',
    'registration_policy_evaluation',
    'rule_impact_entry',
    'rule_notification',
    'roster_substitution',
  ]) {
    await run(table, `DELETE FROM core.${table} WHERE entry_id = ANY($1::uuid[])`, e);
  }
  await run(
    'start_list_entry',
    `DELETE FROM core.start_list_entry WHERE registration_entry_id = ANY($1::uuid[])`,
    e,
  );
  await run(
    'registration_entry',
    `DELETE FROM core.registration_entry WHERE id = ANY($1::uuid[])`,
    e,
  );
  await run('idempotency_key', `DELETE FROM core.idempotency_key WHERE scope = $1`, [personId]);

  await client.query(`SET LOCAL session_replication_role = origin`);
  return counts;
}

/** With FK checks off, prove nothing now points at a deleted row before committing. */
export async function assertNoOrphans(client: PoolClient): Promise<void> {
  const fks = await client.query<{ child: string; col: string; parent: string; pcol: string }>(
    `SELECT c.conrelid::regclass::text AS child, a.attname AS col,
            c.confrelid::regclass::text AS parent, pa.attname AS pcol
       FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
      WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1
        AND c.confrelid::regclass::text IN (
          'core.registration_entry', 'core.registration_order', 'core.order_line',
          'core.payment_intent', 'core.refund', 'core.invoice', 'ops.exception_case')`,
  );
  for (const fk of fks.rows) {
    const { rows } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${fk.child} c
        WHERE c.${fk.col} IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM ${fk.parent} p WHERE p.${fk.pcol} = c.${fk.col})`,
    );
    if ((rows[0]?.n ?? 0) > 0) {
      throw new Error(
        `Rolled back: ${rows[0]!.n} row(s) in ${fk.child}.${fk.col} would point at a deleted ${fk.parent}.`,
      );
    }
  }
}
