import { execFileSync, spawn } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const { Client, Pool } = pg;
const ATHLETE_COUNT = 14_000;
const CLAIMANT_COUNT = 500;
const CLAIM_CAPACITY = 60;
const REPORT_PATH = join(process.cwd(), 'reports', 'load-and-guarantees.md');
const MIGRATE_BIN = join(
  process.cwd(),
  'node_modules',
  'node-pg-migrate',
  'bin',
  'node-pg-migrate.js',
);

if (typeof process.loadEnvFile === 'function') process.loadEnvFile('.env');

const adminUrl = process.env.DATABASE_URL;
if (!adminUrl) throw new Error('DATABASE_URL is required (copy .env.example to .env).');

const databaseName = `wms_load_${process.pid}_${Date.now()}`;
const loadUrl = withDatabase(adminUrl, databaseName);
const ids = {
  event: randomUUID(),
  sport: randomUUID(),
  baseRuleSet: randomUUID(),
  baseRule: randomUUID(),
  temporalRuleSet: randomUUID(),
  ruleV2: randomUUID(),
  ruleV3: randomUUID(),
  claimProduct: randomUUID(),
  performanceProduct: randomUUID(),
  temporalProduct: randomUUID(),
  claimPool: randomUUID(),
  performancePool: randomUUID(),
  temporalPool: randomUUID(),
  restrictedSet: randomUUID(),
  restrictedVersion: randomUUID(),
};

let pool;
let server;
const serverErrors = [];
const guarantees = [];
const measurements = [];

function withDatabase(url, name) {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

function asRoleUrl(url, user, password) {
  const parsed = new URL(url);
  parsed.username = user;
  parsed.password = password;
  return parsed.toString();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function token(personId, roles = ['participant']) {
  return `load.${Buffer.from(JSON.stringify({ personId, roles }), 'utf8').toString('base64url')}`;
}

function p95(values) {
  assert(values.length > 0, 'Cannot calculate p95 of an empty sample.');
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.ceil(ordered.length * 0.95) - 1];
}

function round(value) {
  return Math.round(value * 10) / 10;
}

async function createDatabase() {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.end();
  }
  execFileSync(process.execPath, [MIGRATE_BIN, 'up', '-m', 'migrations'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: loadUrl },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

async function dropDatabase() {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}

async function startServer() {
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/load-server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: loadUrl,
      RESTRICTED_DATABASE_URL: asRoleUrl(loadUrl, 'restricted_rw', 'wms_restricted'),
      DATABASE_POOL_MAX: '50',
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      AUTH_PROVIDER: 'local',
      JWT_SECRET: 'load-test-jwt-secret-not-for-production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const record = { child, url: '', errors: [], output: [] };
  serverErrors.push(record.errors);

  return await new Promise((resolve, reject) => {
    let stdout = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Load server did not become ready within 30 seconds.'));
    }, 30_000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const lines = stdout.split('\n');
      stdout = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('LOAD_SERVER_READY ')) {
          record.url = line.slice('LOAD_SERVER_READY '.length).trim();
          clearTimeout(timer);
          resolve(record);
        } else if (line) {
          record.output.push(line);
        }
      }
    });
    child.stderr.on('data', (chunk) => {
      for (const line of chunk.split('\n').filter(Boolean)) record.errors.push(line);
    });
    child.once('exit', (code, signal) => {
      if (!record.url) {
        clearTimeout(timer);
        reject(
          new Error(
            `Load server exited before ready (code=${String(code)}, signal=${String(signal)}): ${record.errors.join('\n')}`,
          ),
        );
      }
    });
  });
}

async function stopServer(signal = 'SIGTERM') {
  if (!server || server.child.exitCode !== null || server.child.signalCode !== null) return;
  const exited = new Promise((resolve) => server.child.once('exit', resolve));
  server.child.kill(signal);
  await exited;
  server = undefined;
}

async function restartServerAbruptly() {
  await stopServer('SIGKILL');
  server = await startServer();
}

async function http(path, options = {}) {
  assert(server?.url, 'Load server is not running.');
  const headers = new Headers(options.headers);
  if (options.identity) headers.set('authorization', `Bearer ${options.identity}`);
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  const started = performance.now();
  const response = await fetch(`${server.url}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, text, body, ms: performance.now() - started };
}

async function runWithConcurrency(items, concurrency, work) {
  const durations = [];
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const index = next;
        next += 1;
        if (index >= items.length) return;
        const started = performance.now();
        results[index] = await work(items[index], index);
        durations.push(performance.now() - started);
      }
    }),
  );
  return { durations, results };
}

async function seed() {
  await pool.query(
    `INSERT INTO core.event
       (id, slug, name, starts_on, ends_on, age_reference_date, status)
     VALUES ($1, $2, 'Load Games 2027', '2027-09-17', '2027-09-26',
             '2027-12-31', 'registration_open')`,
    [ids.event, `load-games-${process.pid}-${Date.now()}`],
  );
  await pool.query(
    `INSERT INTO core.sport (id, event_id, code, name)
     VALUES ($1, $2, 'load-sport', 'Load Sport')`,
    [ids.sport, ids.event],
  );
  await pool.query(
    `INSERT INTO core.rule_set (id, event_id, sport_code)
     VALUES ($1, $2, 'load-sport')`,
    [ids.baseRuleSet, ids.event],
  );
  await pool.query(
    `INSERT INTO core.rule_set (id, event_id, sport_code, discipline)
     VALUES ($1, $2, 'load-sport', 'temporal')`,
    [ids.temporalRuleSet, ids.event],
  );
  await pool.query(
    `INSERT INTO core.rule_version
       (id, rule_set_id, version_no, reference_date, effective, status)
     VALUES ($1, $2, 1, '2027-12-31', tstzrange('2026-01-01', NULL), 'draft'),
            ($3, $4, 2, '2027-12-31', tstzrange('2026-01-01', NULL), 'draft'),
            ($5, $4, 3, '2027-12-31', tstzrange('2026-01-01', NULL), 'draft')`,
    [ids.baseRule, ids.baseRuleSet, ids.ruleV2, ids.temporalRuleSet, ids.ruleV3],
  );
  await pool.query(
    `INSERT INTO core.rule_dimension
       (rule_version_id, ordinal, attribute, aggregation, rounding, value_scale, band_kind, bands)
     VALUES
       ($1, 1, 'age', 'self', 'floor', 0, 'range',
        '[{"id":"masters-40","name":"Masters 40-49","min":40,"max":49}]'::jsonb),
       ($2, 1, 'age', 'self', 'floor', 0, 'range',
        '[{"id":"open-40","name":"Open 40+","min":40,"max":null}]'::jsonb)`,
    [ids.ruleV2, ids.ruleV3],
  );
  await pool.query(
    `INSERT INTO core.sport_entry_product
       (id, event_id, sport_id, name, participant_type, rule_set_id)
     VALUES ($1, $2, $3, 'Sixty-place claim', 'individual', $4),
            ($5, $2, $3, 'Performance entry', 'individual', $4),
            ($6, $2, $3, 'Temporal entry', 'individual', $7)`,
    [
      ids.claimProduct,
      ids.event,
      ids.sport,
      ids.baseRuleSet,
      ids.performanceProduct,
      ids.temporalProduct,
      ids.temporalRuleSet,
    ],
  );
  await pool.query(
    `INSERT INTO core.fee
       (event_id, sport_entry_product_id, grade, currency,
        base_amount_minor, service_amount_minor, effective)
     VALUES ($1, $2, 'competitive', 'EUR', 9000, 1000, tstzrange('2026-01-01', NULL)),
            ($1, $3, 'competitive', 'EUR', 9000, 1000, tstzrange('2026-01-01', NULL)),
            ($1, $4, 'competitive', 'EUR', 9000, 1000, tstzrange('2026-01-01', NULL))`,
    [ids.event, ids.claimProduct, ids.performanceProduct, ids.temporalProduct],
  );
  await pool.query(
    `INSERT INTO core.tax_rule
       (event_id, name, rate_bp, rounding, basis, effective, status)
     VALUES ($1, 'Load IVA 22', 2200, 'half_up', 'inclusive',
             tstzrange('2026-01-01', NULL), 'active')`,
    [ids.event],
  );
  await pool.query(
    `INSERT INTO core.quota_pool
       (id, event_id, name, scope_kind, scope_ref, capacity)
     VALUES ($1, $2, 'Claim capacity 60', 'product', $3, $4),
            ($5, $2, 'Performance capacity', 'product', $6, 20000),
            ($7, $2, 'Temporal capacity', 'product', $8, 100)`,
    [
      ids.claimPool,
      ids.event,
      ids.claimProduct,
      CLAIM_CAPACITY,
      ids.performancePool,
      ids.performanceProduct,
      ids.temporalPool,
      ids.temporalProduct,
    ],
  );

  await pool.query(
    `INSERT INTO core.person
       (idp_subject, email, given_name, family_name, date_of_birth, nationality)
     SELECT 'load-' || n,
            'load.' || n || '@example.invalid',
            'Athlete', lpad(n::text, 5, '0'), '1985-01-01', 'IT'
       FROM generate_series(1, $1::int) AS n`,
    [ATHLETE_COUNT],
  );
  await pool.query(
    `INSERT INTO core.athlete_profile (person_id, event_id)
     SELECT id, $1 FROM core.person WHERE idp_subject LIKE 'load-%'`,
    [ids.event],
  );
  await pool.query(
    `INSERT INTO core.registration_entry
       (event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id)
     SELECT $1,
            ap.id,
            CASE
              WHEN substring(p.idp_subject from 6)::int <= 500 THEN $2::uuid
              WHEN substring(p.idp_subject from 6)::int >= 13999 THEN $3::uuid
              ELSE $4::uuid
            END,
            'competitive',
            CASE
              WHEN substring(p.idp_subject from 6)::int = 13999 THEN $5::uuid
              WHEN substring(p.idp_subject from 6)::int = 14000 THEN $6::uuid
              ELSE $7::uuid
            END
       FROM core.athlete_profile ap
       JOIN core.person p ON p.id = ap.person_id
      WHERE ap.event_id = $1 AND p.idp_subject LIKE 'load-%'`,
    [
      ids.event,
      ids.claimProduct,
      ids.temporalProduct,
      ids.performanceProduct,
      ids.ruleV2,
      ids.ruleV3,
      ids.baseRule,
    ],
  );
  await pool.query(
    `SELECT core.publish_rule_version($1, p.id) FROM core.person p WHERE p.idp_subject = 'load-1'`,
    [ids.ruleV2],
  );

  await pool.query(
    `INSERT INTO core.evidence_requirement_set
       (id, event_id, code, document_kind, classification)
     VALUES ($1, $2, 'load-medical', 'medical_certificate', 'restricted')`,
    [ids.restrictedSet, ids.event],
  );
  await pool.query(
    `INSERT INTO core.evidence_requirement_version
       (id, requirement_set_id, version_no, status, effective, requiredness,
        valid_through, accepted_mime_types, message_key)
     VALUES ($1, $2, 1, 'active', tstzrange('2026-01-01', NULL), 'required',
             'none', '{application/pdf}', 'evidence.load.medical')`,
    [ids.restrictedVersion, ids.restrictedSet],
  );
  await pool.query(
    `INSERT INTO restricted.evidence_document
       (event_id, person_id, entry_id, kind, requirement_set_id, classification,
        lawful_basis, retain_until)
     SELECT $1, p.id, re.id, 'medical_certificate', $2, 'restricted', 'contract', '2028-12-31'
       FROM core.person p
       JOIN core.athlete_profile ap ON ap.person_id = p.id AND ap.event_id = $1
       JOIN core.registration_entry re ON re.athlete_profile_id = ap.id
      WHERE p.idp_subject = 'load-2'`,
    [ids.event, ids.restrictedSet],
  );
  await pool.query(
    `INSERT INTO restricted.evidence_document_application (document_id, entry_id)
     SELECT id, entry_id FROM restricted.evidence_document WHERE event_id = $1`,
    [ids.event],
  );
  await pool.query(
    `INSERT INTO restricted.evidence_upload
       (document_id, version_no, s3_key, mime_type, scan_status, original_file_name)
     SELECT id, 1, 's3://restricted/load-medical.pdf', 'application/pdf', 'clean',
            'load-medical.pdf'
       FROM restricted.evidence_document WHERE event_id = $1`,
    [ids.event],
  );

  const loaded = await pool.query(
    `SELECT substring(p.idp_subject from 6)::int AS n,
            p.id AS person_id,
            re.id AS entry_id
       FROM core.person p
       JOIN core.athlete_profile ap ON ap.person_id = p.id AND ap.event_id = $1
       JOIN core.registration_entry re ON re.athlete_profile_id = ap.id
      WHERE p.idp_subject LIKE 'load-%'
      ORDER BY substring(p.idp_subject from 6)::int`,
    [ids.event],
  );
  assert(
    loaded.rows.length === ATHLETE_COUNT,
    `Seeded ${loaded.rows.length}, expected ${ATHLETE_COUNT}.`,
  );
  return new Map(loaded.rows.map((row) => [Number(row.n), row]));
}

async function saveEntry(athlete, productId, key = randomUUID()) {
  return await http(`/v1/registration-entries/${athlete.entry_id}`, {
    method: 'PUT',
    identity: token(athlete.person_id),
    headers: { 'idempotency-key': key },
    body: { sportEntryProductId: productId, grade: 'competitive' },
  });
}

async function payOrder(athlete, orderId, key) {
  return await http(`/v1/orders/${orderId}/payments`, {
    method: 'POST',
    identity: token(athlete.person_id),
    headers: { 'idempotency-key': key },
    body: { method: 'card' },
  });
}

async function proveOverselling(athletes) {
  const beforeErrors = server.errors.length;
  const claimants = Array.from({ length: CLAIMANT_COUNT }, (_, index) => athletes.get(index + 1));
  assert(claimants.every(Boolean), 'Claim fixtures are incomplete.');
  const attempts = await Promise.all(
    claimants.map((athlete) => saveEntry(athlete, ids.claimProduct)),
  );
  const accepted = attempts
    .map((result, index) => ({ result, athlete: claimants[index] }))
    .filter(({ result }) => result.status === 200);
  const refused = attempts.filter((result) => result.status === 409);
  assert(
    accepted.length === CLAIM_CAPACITY,
    `Expected 60 accepted claims, got ${accepted.length}.`,
  );
  assert(
    refused.length === CLAIMANT_COUNT - CLAIM_CAPACITY,
    `Expected 440 HTTP 409s, got ${refused.length}.`,
  );
  assert(
    refused.every((result) => result.body?.code === 'QUOTA_FULL'),
    'At least one refusal was not 409 QUOTA_FULL.',
  );

  const payments = await Promise.all(
    accepted.map(({ result, athlete }) => payOrder(athlete, result.body.order.id, randomUUID())),
  );
  assert(
    payments.every((result) => result.status === 200),
    'An accepted claimant failed to pay.',
  );
  const state = await pool.query(
    `SELECT q.capacity, q.confirmed, q.reserved,
            count(*) FILTER (WHERE re.status = 'confirmed')::int AS confirmed_entries
       FROM core.quota_pool q
       LEFT JOIN core.entry_quota_consumption c ON c.quota_pool_id = q.id
       LEFT JOIN core.registration_entry re ON re.id = c.entry_id
      WHERE q.id = $1
      GROUP BY q.id`,
    [ids.claimPool],
  );
  const row = state.rows[0];
  assert(
    row?.confirmed === CLAIM_CAPACITY,
    `Quota confirmed=${String(row?.confirmed)}, expected 60.`,
  );
  assert(
    row?.reserved === 0,
    `Quota retained ${String(row?.reserved)} reservations after payment.`,
  );
  assert(
    row?.confirmed_entries === CLAIM_CAPACITY,
    `Confirmed entries=${String(row?.confirmed_entries)}, expected 60.`,
  );
  const newErrors = server.errors.slice(beforeErrors);
  assert(
    !newErrors.some((line) => /quota_not_exceeded|QUOTA_FULL|23514/i.test(line)),
    `A quota refusal was logged as an error: ${newErrors.join('\n')}`,
  );

  guarantees.push({
    claim: 'Overselling is impossible',
    status: 'PASS',
    detail:
      '500 concurrent HTTP claims: 60 confirmed, 440 refused 409 QUOTA_FULL, zero quota constraint errors logged.',
  });
  return attempts.map((attempt) => attempt.ms);
}

async function proveRetries(athletes) {
  const athlete = athletes.get(602);
  const saved = await saveEntry(athlete, ids.performanceProduct);
  assert(saved.status === 200, `Retry fixture save returned ${saved.status}.`);
  const key = randomUUID();
  const first = await payOrder(athlete, saved.body.order.id, key);
  assert(first.status === 200, `First payment returned ${first.status}.`);
  const replays = await Promise.all(
    Array.from({ length: 99 }, () => payOrder(athlete, saved.body.order.id, key)),
  );
  const all = [first, ...replays];
  assert(
    all.every((result) => result.status === 200),
    'A completed payment replay was not HTTP 200.',
  );
  assert(
    all.every((result) => isDeepStrictEqual(result.body, first.body)),
    'Payment replay response bodies were not identical.',
  );
  const payment = await pool.query(
    `SELECT count(*)::int AS intents, max(charge_count)::int AS charges
       FROM core.payment_intent
      WHERE idempotency_scope = $1 AND idempotency_key = $2`,
    [athlete.person_id, key],
  );
  const entry = await pool.query(
    `SELECT count(*)::int AS entries
       FROM core.registration_entry re
       JOIN core.athlete_profile ap ON ap.id = re.athlete_profile_id
      WHERE ap.person_id = $1 AND re.sport_entry_product_id = $2`,
    [athlete.person_id, ids.performanceProduct],
  );
  assert(payment.rows[0]?.intents === 1, 'Payment replay created more than one intent.');
  assert(payment.rows[0]?.charges === 1, 'Payment replay recorded more than one charge.');
  assert(entry.rows[0]?.entries === 1, 'Payment replay created more than one entry.');
  guarantees.push({
    claim: 'Retries are free',
    status: 'PASS',
    detail:
      'One payment plus 99 replays produced one intent, one charge, one entry, and 100 deeply identical response bodies.',
  });
}

async function proveHistory(athletes) {
  const athlete = athletes.get(501);
  const saved = await saveEntry(athlete, ids.performanceProduct);
  assert(saved.status === 200, `History fixture save returned ${saved.status}.`);
  await restartServerAbruptly();
  const afterFirstRestart = await http(
    `/v1/registration-journeys/${athlete.entry_id}?eventId=${ids.event}`,
    { identity: token(athlete.person_id) },
  );
  assert(
    afterFirstRestart.status === 200,
    'Journey was unavailable after the first SIGKILL restart.',
  );
  assert(
    afterFirstRestart.body.statusHistory.length === 1,
    'Committed save history was lost after restart.',
  );

  const paid = await payOrder(athlete, saved.body.order.id, randomUUID());
  assert(paid.status === 200, `History payment returned ${paid.status}.`);
  const withdrew = await http(`/v1/registration-entries/${athlete.entry_id}/status/withdraw`, {
    method: 'POST',
    identity: token(athlete.person_id),
    headers: { 'idempotency-key': randomUUID() },
    body: { reason: 'load.history.withdrawal' },
  });
  assert(withdrew.status === 200, `History withdrawal returned ${withdrew.status}.`);
  await restartServerAbruptly();

  const journey = await http(`/v1/registration-journeys/${athlete.entry_id}?eventId=${ids.event}`, {
    identity: token(athlete.person_id),
  });
  assert(journey.status === 200, 'Journey was unavailable after the second SIGKILL restart.');
  const rows = await pool.query(
    `SELECT from_status, to_status, actor_kind, actor_id, reason
       FROM core.entry_status_event WHERE entry_id = $1 ORDER BY occurred_at, id`,
    [athlete.entry_id],
  );
  assert(rows.rows.length === 3, `Expected three status events, got ${rows.rows.length}.`);
  assert(
    rows.rows.every((row) => row.actor_kind && row.reason),
    'A status event omitted actor kind or reason.',
  );
  assert(
    rows.rows.every((row) => row.actor_kind === 'system' || row.actor_id === athlete.person_id),
    'A human status event omitted or misnamed its actor.',
  );
  assert(
    journey.body.statusHistory.length === rows.rows.length,
    'Journey history is incomplete after restart.',
  );
  guarantees.push({
    claim: 'History is complete',
    status: 'PASS',
    detail:
      'Save, payment, and withdrawal produced three actor/reason rows; two SIGKILL restarts retained the complete journey.',
  });
}

async function provePastIsFixed(athletes) {
  const oldAthlete = athletes.get(13_999);
  const newAthlete = athletes.get(14_000);
  const oldSaved = await saveEntry(oldAthlete, ids.temporalProduct);
  assert(oldSaved.status === 200, `v2 entry save returned ${oldSaved.status}.`);
  assert(
    oldSaved.body.entry.currentCategoryName === 'Masters 40-49',
    'v2 category was not derived.',
  );

  await pool.query(
    `UPDATE core.rule_version
        SET status = 'superseded', effective = tstzrange(lower(effective), now(), '[)')
      WHERE id = $1`,
    [ids.ruleV2],
  );
  await pool.query(`SELECT core.publish_rule_version($1, $2)`, [ids.ruleV3, oldAthlete.person_id]);
  const newSaved = await saveEntry(newAthlete, ids.temporalProduct);
  assert(newSaved.status === 200, `v3 entry save returned ${newSaved.status}.`);

  const categories = await pool.query(
    `SELECT id, rule_version_id, original_category_id, original_category_name,
            current_category_id, current_category_name
       FROM core.registration_entry WHERE id = ANY($1::uuid[]) ORDER BY id`,
    [[oldAthlete.entry_id, newAthlete.entry_id]],
  );
  const old = categories.rows.find((row) => row.id === oldAthlete.entry_id);
  const newer = categories.rows.find((row) => row.id === newAthlete.entry_id);
  assert(old?.rule_version_id === ids.ruleV2, 'The old entry was repointed away from rule v2.');
  assert(
    old?.original_category_name === 'Masters 40-49',
    'The old entry lost its v2 category snapshot.',
  );
  assert(
    old?.current_category_name === 'Masters 40-49',
    'Publishing v3 changed the old entry category.',
  );
  assert(newer?.rule_version_id === ids.ruleV3, 'The new entry did not use rule v3.');
  assert(
    newer?.current_category_name === 'Open 40+',
    'The new entry did not derive the v3 category.',
  );
  guarantees.push({
    claim: 'The past is fixed',
    status: 'PASS',
    detail:
      'After v3 publication, the v2 entry retained rule id/category Masters 40-49; a new v3 entry derived Open 40+.',
  });
}

async function proveRestrictedBoundary(athletes) {
  const client = await pool.connect();
  let permissionCode;
  let role;
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE app_rw');
    role = (await client.query('SELECT current_user')).rows[0]?.current_user;
    try {
      await client.query('SELECT 1 FROM restricted.evidence_document LIMIT 1');
    } catch (error) {
      permissionCode = error.code;
    }
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
  assert(role === 'app_rw', `SET LOCAL ROLE did not take effect (current_user=${String(role)}).`);
  assert(
    permissionCode === '42501',
    `app_rw restricted read returned ${String(permissionCode)}, expected 42501.`,
  );

  const athlete = athletes.get(2);
  const before = await pool.query(
    `SELECT count(*)::int AS n FROM restricted.access_log WHERE actor_id = $1`,
    [athlete.person_id],
  );
  const viewed = await http(
    `/v1/restricted-evidence?registrationEntryId=${athlete.entry_id}&sportEntryProductId=${ids.claimProduct}`,
    { identity: token(athlete.person_id) },
  );
  assert(viewed.status === 200, `Privileged restricted service path returned ${viewed.status}.`);
  assert(
    viewed.body.items.length === 1,
    `Expected one restricted document, got ${viewed.body.items.length}.`,
  );
  const logs = await pool.query(
    `SELECT document_id, actor_id, action, upload_id, purpose
       FROM restricted.access_log WHERE actor_id = $1 ORDER BY occurred_at`,
    [athlete.person_id],
  );
  assert(
    logs.rows.length === before.rows[0].n + viewed.body.items.length,
    'The privileged view did not write one access-log row per returned document.',
  );
  assert(
    viewed.body.items.every((item) =>
      logs.rows.some(
        (row) =>
          row.document_id === item.id &&
          row.actor_id === athlete.person_id &&
          row.action === 'view' &&
          row.purpose === 'GET /v1/restricted-evidence',
      ),
    ),
    'A returned restricted document has no matching access log.',
  );
  guarantees.push({
    claim: 'Restricted data is unreachable',
    status: 'PASS',
    detail:
      'BEGIN/SET LOCAL ROLE app_rw proved current_user=app_rw and SELECT failed 42501; the privileged view logged every returned document.',
  });
}

async function proveDualControl(athletes) {
  const caseId = randomUUID();
  const signer = athletes.get(1).person_id;
  await pool.query(
    `INSERT INTO ops.exception_case (id, event_id, kind, impact, summary)
     VALUES ($1, $2, 'load_dual_control', 'high', 'Load dual-control proof')`,
    [caseId, ids.event],
  );
  const sign = () =>
    pool.query(
      `INSERT INTO ops.exception_signature (case_id, signer_id, decision)
       VALUES ($1, $2, 'approve')`,
      [caseId, signer],
    );
  await sign();
  let duplicateCode;
  try {
    await sign();
  } catch (error) {
    duplicateCode = error.code;
  }
  const state = await pool.query(
    `SELECT c.status, count(s.id)::int AS signatures
       FROM ops.exception_case c
       LEFT JOIN ops.exception_signature s ON s.case_id = c.id
      WHERE c.id = $1 GROUP BY c.id`,
    [caseId],
  );
  assert(
    duplicateCode === '23505',
    `Second signature returned ${String(duplicateCode)}, expected 23505.`,
  );
  assert(state.rows[0]?.status === 'pending', 'One reviewer moved the case out of pending.');
  assert(state.rows[0]?.signatures === 1, 'The duplicate reviewer was counted twice.');
  guarantees.push({
    claim: 'Dual control is real',
    status: 'PASS',
    detail:
      'The same reviewer’s second signature failed 23505; one signature remained and the case stayed pending.',
  });
}

function addMeasurement(path, targetMs, values, scope, dominatedBy) {
  const measured = round(p95(values));
  measurements.push({
    path,
    targetMs,
    p95: measured,
    outcome: measured < targetMs ? 'PASS' : 'MISS',
    scope,
    dominatedBy: measured < targetMs ? 'Within budget' : dominatedBy,
  });
}

async function measureBudgets(athletes, quotaDurations) {
  const catalogueSql = `
    SELECT jsonb_build_object(
      'sports', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM core.sport s WHERE s.event_id = $1), '[]'::jsonb),
      'products', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM core.sport_entry_product p WHERE p.event_id = $1), '[]'::jsonb),
      'rules', COALESCE((SELECT jsonb_agg(to_jsonb(rv)) FROM core.rule_version rv
                         JOIN core.rule_set rs ON rs.id = rv.rule_set_id WHERE rs.event_id = $1), '[]'::jsonb)
    ) AS catalogue`;
  for (let i = 0; i < 5; i += 1) await pool.query(catalogueSql, [ids.event]);
  const catalogue = await runWithConcurrency(
    Array.from({ length: 200 }, (_, index) => index),
    20,
    () => pool.query(catalogueSql, [ids.event]),
  );
  addMeasurement(
    'Catalogue read',
    50,
    catalogue.durations,
    'Direct catalogue SQL proxy; no catalogue HTTP endpoint exists yet (200 samples, concurrency 20).',
    'Database round-trip and JSON aggregation',
  );

  const journeyAthlete = athletes.get(501);
  const journeyPath = `/v1/registration-journeys/${journeyAthlete.entry_id}?eventId=${ids.event}`;
  for (let i = 0; i < 5; i += 1) {
    const warm = await http(journeyPath, { identity: token(journeyAthlete.person_id) });
    assert(warm.status === 200, 'Journey warmup failed.');
  }
  const journey = await runWithConcurrency(
    Array.from({ length: 200 }, (_, index) => index),
    20,
    async () => {
      const result = await http(journeyPath, { identity: token(journeyAthlete.person_id) });
      assert(result.status === 200, `Journey measurement returned ${result.status}.`);
      return result;
    },
  );
  addMeasurement(
    'Journey read',
    150,
    journey.durations,
    'GET registration journey (200 samples, concurrency 20).',
    'Single PostgreSQL JSON-aggregation query plus HTTP queueing',
  );

  const adminToken = token(athletes.get(1).person_id, ['oc_admin']);
  for (let i = 0; i < 5; i += 1) {
    const warm = await http('/v1/admin/people?limit=50', { identity: adminToken });
    assert(warm.status === 200, 'Admin queue warmup failed.');
  }
  const admin = await runWithConcurrency(
    Array.from({ length: 100 }, (_, index) => index),
    10,
    async () => {
      const result = await http('/v1/admin/people?limit=50', { identity: adminToken });
      assert(result.status === 200, `Admin queue measurement returned ${result.status}.`);
      return result;
    },
  );
  addMeasurement(
    'Admin queue page (50 rows)',
    200,
    admin.durations,
    'GET /v1/admin/people, the implemented keyset-paged admin list (100 samples, concurrency 10).',
    'Batched purge-blocker and role lookups after the keyset page query',
  );

  const saveAthletes = Array.from({ length: 100 }, (_, index) => athletes.get(502 + index));
  const saves = await runWithConcurrency(saveAthletes, 10, async (athlete) => {
    const result = await saveEntry(athlete, ids.performanceProduct);
    assert(result.status === 200, `Entry save measurement returned ${result.status}.`);
    return result;
  });
  addMeasurement(
    'Entry save',
    300,
    saves.durations,
    'PUT distinct entries (100 samples, concurrency 10).',
    'Multi-statement transaction: category, quota lock, order lines, and status history',
  );

  addMeasurement(
    'Quota claim under contention',
    800,
    quotaDurations,
    'The 500 simultaneous PUT claims used by guarantee 1.',
    'Serialized lock queue on the single 60-place quota row',
  );

  const paymentAthletes = Array.from({ length: 50 }, (_, index) => athletes.get(603 + index));
  const prepared = await runWithConcurrency(paymentAthletes, 10, async (athlete) => {
    const result = await saveEntry(athlete, ids.performanceProduct);
    assert(result.status === 200, `Payment fixture save returned ${result.status}.`);
    return result.body.order.id;
  });
  const payments = await runWithConcurrency(paymentAthletes, 10, async (athlete, index) => {
    const result = await payOrder(athlete, prepared.results[index], randomUUID());
    assert(result.status === 200, `Payment measurement returned ${result.status}.`);
    return result;
  });
  addMeasurement(
    'Payment capture',
    1_500,
    payments.durations,
    'POST distinct payments through the deterministic local stub (50 samples, concurrency 10).',
    'Database allocation/confirmation transactions; no real PSP network latency is present',
  );
}

function renderReport(postgresVersion) {
  const lines = [
    '# Load guarantees and §6 performance budget',
    '',
    `Measured: ${new Date().toISOString()}`,
    '',
    `Fixture: ${ATHLETE_COUNT.toLocaleString('en-US')} athletes, one Games-scale event, PostgreSQL ${postgresVersion}.`,
    '',
    'These are local Docker PostgreSQL measurements on a laptop, not production results. The useful result is the shape: which paths are near their budget and which are orders of magnitude away. The payment path uses the deterministic stub because no PSP has been selected, and the catalogue value is a direct SQL proxy because that HTTP endpoint is not built.',
    '',
    '## Six guarantees',
    '',
    '| Claim | Result | Evidence |',
    '|---|---:|---|',
    ...guarantees.map((row) => `| ${row.claim} | ${row.status} | ${row.detail} |`),
    '',
    '## §6 measured budget',
    '',
    '| Path | Target p95 | Measured p95 | Result | Measurement scope | Dominated by when missed |',
    '|---|---:|---:|---:|---|---|',
    ...measurements.map(
      (row) =>
        `| ${row.path} | < ${row.targetMs} ms | ${row.p95.toFixed(1)} ms | ${row.outcome} | ${row.scope} | ${row.dominatedBy} |`,
    ),
    '',
    'No product behavior was changed to improve a timing, and no index migration was added speculatively. Long-running work is isolated behind `npm run test:load`; the normal backend suite retains only the small mechanism tests and fixed-query-count assertions.',
    '',
  ];
  return lines.join('\n');
}

async function main() {
  process.stdout.write(`Creating isolated load database ${databaseName}...\n`);
  await createDatabase();
  pool = new Pool({ connectionString: loadUrl, max: 30 });
  const athletes = await seed();
  process.stdout.write(
    `Seeded ${ATHLETE_COUNT.toLocaleString('en-US')} athletes. Starting load server...\n`,
  );
  server = await startServer();

  const quotaDurations = await proveOverselling(athletes);
  process.stdout.write('PASS  Overselling is impossible\n');
  await proveRetries(athletes);
  process.stdout.write('PASS  Retries are free\n');
  await proveHistory(athletes);
  process.stdout.write('PASS  History is complete\n');
  await provePastIsFixed(athletes);
  process.stdout.write('PASS  The past is fixed\n');
  await proveRestrictedBoundary(athletes);
  process.stdout.write('PASS  Restricted data is unreachable\n');
  await proveDualControl(athletes);
  process.stdout.write('PASS  Dual control is real\n');

  await measureBudgets(athletes, quotaDurations);
  const version = await pool.query(`SHOW server_version`);
  const report = renderReport(version.rows[0]?.server_version ?? 'unknown');
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, report, 'utf8');
  process.stdout.write(`\n${report}\nReport written to ${REPORT_PATH}\n`);
}

try {
  await main();
} finally {
  await stopServer().catch(() => undefined);
  if (pool) await pool.end().catch(() => undefined);
  await dropDatabase().catch((error) => {
    process.stderr.write(`Could not drop ${databaseName}: ${String(error)}\n`);
  });
}
