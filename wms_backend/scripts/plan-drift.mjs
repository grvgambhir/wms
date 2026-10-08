/**
 * Does every table the plan describes actually exist in the database?
 *
 * Written after nine planned tables — the whole of findings F01 and F02, plus REG-13's
 * pre-registration and PLT-06's proxy consent — turned out to exist only in
 * BACKEND_DB_PLAN.md. They were reviewed twice, written up in REVISIONS, and never
 * migrated. Nobody noticed until a seed script went looking for them.
 *
 * A plan section is not done when it is written. It is done when a migration applies it.
 */
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const PLAN =
  '/Users/gauravgambhir/Desktop/Code_Life/wms/wms_participant/context_docs/docs/BACKEND_DB_PLAN.md';

const planned = new Set(
  [...readFileSync(PLAN, 'utf8').matchAll(/^CREATE TABLE (?:IF NOT EXISTS )?([\w.]+)/gm)]
    .map((m) => m[1])
    .filter((t) => !/activity_log_\d/.test(t)),
);

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query(
  `SELECT table_schema || '.' || table_name AS name
     FROM information_schema.tables
    WHERE table_schema IN ('core','ops','audit','restricted')`,
);
await client.end();

const live = new Set(rows.map((r) => r.name));
const missing = [...planned].filter((t) => !live.has(t)).sort();

console.log(`planned: ${planned.size}   live: ${live.size}   missing: ${missing.length}`);
if (missing.length) {
  console.log('\nIn the plan, not in the database:');
  for (const t of missing) console.log(`  ${t}`);
  process.exit(1);
}
console.log('No drift.');
