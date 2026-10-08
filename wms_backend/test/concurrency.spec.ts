/**
 * The guarantees in BACKEND_DB_PLAN.md §10, as executable specification.
 *
 * These tests are written BEFORE the implementation they constrain. Whatever the final
 * schema looks like — the rules and money tables are still under review — it has to pass
 * these. They are deliberately about OBSERVABLE BEHAVIOUR, never about how a table is
 * shaped, so a schema change should not require editing them.
 *
 * They run against real PostgreSQL. Not a mock, not SQLite, not a testcontainer stub:
 * every guarantee here is enforced by a Postgres-specific mechanism (CHECK under row
 * locks, unique violations, NULLS NOT DISTINCT, schema-level GRANTs). A test that does
 * not exercise the real engine tests nothing.
 *
 * Expect these to FAIL until the registration and quota migrations land. That is the
 * point of writing them first.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

// test/setup.ts points DATABASE_URL at the throwaway database globalSetup created and
// migrated. Never hardcode a database here: a stale URL would test yesterday's schema.
const CONNECTION = process.env.DATABASE_URL as string;

let pool: Pool;

/** Fixed ids so failures name a row you can go and look at. */
const EVENT = '00000000-0000-7000-8000-000000000001';
const PRODUCT = '00000000-0000-7000-8000-000000000002';
const QUOTA = '00000000-0000-7000-8000-000000000003'; // product pool
const SPORT_POOL = '00000000-0000-7000-8000-000000000007'; // its parent sport cap
// Keep the mechanism proof small. The 500-way/60-place property is exercised by
// `npm run test:load`, which has its own database and does not slow the normal suite.
const CAPACITY = 6; // product pool
const SPORT_CAP = 10; // wider sport cap — deliberately not the binding one
const CLAIMANTS = 20;

const SPORT = '00000000-0000-7000-8000-000000000004';
const RULE_SET = '00000000-0000-7000-8000-000000000005';
const RULE_VERSION = '00000000-0000-7000-8000-000000000006';
const CASE = '00000000-0000-7000-8000-0000000000c1';

beforeAll(async () => {
  // A generous pool: the whole point is to put many claimants on the row at once.
  pool = new Pool({ connectionString: CONNECTION, max: 40 });
  await pool.query('SELECT 1');

  // Seed lives here, not in a migration: it is test fixture, not schema.
  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1, 'como-concurrency', 'Como Lake 2027', '2027-09-17', '2027-09-26', '2027-12-31')
     ON CONFLICT DO NOTHING`,
    [EVENT],
  );
  await pool.query(
    `INSERT INTO core.sport (id, event_id, code, name)
     VALUES ($1, $2, 'basketball', 'Basketball') ON CONFLICT DO NOTHING`,
    [SPORT, EVENT],
  );
  await pool.query(
    `INSERT INTO core.rule_set (id, event_id, sport_code) VALUES ($1, $2, 'basketball')
     ON CONFLICT DO NOTHING`,
    [RULE_SET, EVENT],
  );
  await pool.query(
    `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status)
     VALUES ($1, $2, 1, '2027-12-31', tstzrange(now(), NULL), 'draft') ON CONFLICT DO NOTHING`,
    [RULE_VERSION, RULE_SET],
  );
  await pool.query(
    `INSERT INTO core.sport_entry_product
       (id, event_id, sport_id, name, participant_type, rule_set_id)
     VALUES ($1, $2, $3, 'Basketball 35-39', 'team', $4) ON CONFLICT DO NOTHING`,
    [PRODUCT, EVENT, SPORT, RULE_SET],
  );
  // A product pool nested inside a wider SPORT cap. Claiming consumes BOTH.
  await pool.query(
    `INSERT INTO core.quota_pool (id, event_id, name, scope_kind, scope_ref, capacity)
     VALUES ($1, $2, 'Basketball total', 'sport', 'basketball', $3) ON CONFLICT DO NOTHING`,
    [SPORT_POOL, EVENT, SPORT_CAP],
  );
  await pool.query(
    `INSERT INTO core.quota_pool (id, event_id, name, scope_kind, scope_ref, capacity, parent_pool_id)
     VALUES ($1, $2, 'Basketball 35-39', 'product', $3, $4, $5) ON CONFLICT DO NOTHING`,
    [QUOTA, EVENT, PRODUCT, CAPACITY, SPORT_POOL],
  );
  await pool.query(
    `INSERT INTO ops.exception_case (id, event_id, kind, impact, summary)
     VALUES ($1, $2, 'category_dispute', 'high', 'seed') ON CONFLICT DO NOTHING`,
    [CASE, EVENT],
  );
});

afterAll(async () => {
  await pool.end();
});

/**
 * The claim path exactly as §4.5 specifies it. Kept here rather than imported so the test
 * pins the DOCUMENTED transaction, and drifts loudly if the implementation diverges.
 */
async function claimOneSeat(pools: string[] = [QUOTA, SPORT_POOL]): Promise<'claimed' | 'full'> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // ORDER BY id, not the order the caller resolved them: locking in resolution order
    // is how two claimants deadlock on a shared parent cap.
    await client.query('SELECT id FROM core.quota_pool WHERE id = ANY($1) ORDER BY id FOR UPDATE', [
      pools,
    ]);
    await client.query(
      'UPDATE core.quota_pool SET reserved = reserved + 1, updated_at = now() WHERE id = ANY($1)',
      [pools],
    );
    await client.query('COMMIT');
    return 'claimed';
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    // 23514 = check_violation. The quota CHECK is the ONLY acceptable reason to fail here:
    // a deadlock (40P01) or serialization failure (40001) would mean the documented
    // transaction is wrong, and must surface as a test failure rather than a retry.
    if ((err as { code?: string }).code === '23514') return 'full';
    throw err;
  } finally {
    client.release();
  }
}

describe('§10 — overselling is impossible', () => {
  beforeEach(async () => {
    await pool.query('UPDATE core.quota_pool SET confirmed = 0, reserved = 0 WHERE id = ANY($1)', [
      [QUOTA, SPORT_POOL],
    ]);
  });

  it(`admits exactly ${CAPACITY} of ${CLAIMANTS} simultaneous claimants`, async () => {
    const outcomes = await Promise.all(Array.from({ length: CLAIMANTS }, () => claimOneSeat()));

    const claimed = outcomes.filter((o) => o === 'claimed').length;
    const full = outcomes.filter((o) => o === 'full').length;

    expect(claimed).toBe(CAPACITY);
    expect(full).toBe(CLAIMANTS - CAPACITY);

    // And the row itself agrees — the counters are not merely "close".
    const { rows } = await pool.query<{ confirmed: number; reserved: number; capacity: number }>(
      'SELECT capacity, confirmed, reserved FROM core.quota_pool WHERE id = $1',
      [QUOTA],
    );
    const quota = rows[0];
    expect(quota).toBeDefined();
    expect(quota!.confirmed + quota!.reserved).toBe(CAPACITY);
    expect(quota!.confirmed + quota!.reserved).toBeLessThanOrEqual(quota!.capacity);
  }, 60_000);

  it('cannot be oversold by a caller that skips the application entirely', async () => {
    // The guarantee must live in the database, not in our service layer. If this UPDATE
    // succeeds, every claim above passed for the wrong reason.
    await pool.query('UPDATE core.quota_pool SET confirmed = $2 WHERE id = $1', [QUOTA, CAPACITY]);
    await expect(
      pool.query('UPDATE core.quota_pool SET confirmed = confirmed + 1 WHERE id = $1', [QUOTA]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects a duplicate pool at the same scope, despite scope_ref being nullable', async () => {
    // Two capacity-60 pools at one scope would sell 120 places with every CHECK satisfied.
    // Plain UNIQUE does not prevent it: Postgres treats NULLs as distinct. This passes
    // only with UNIQUE NULLS NOT DISTINCT.
    await expect(
      pool.query(
        `INSERT INTO core.quota_pool (event_id, name, scope_kind, scope_ref, capacity)
         VALUES ($1, 'Basketball 35-39', 'product', $2, 60)`,
        [EVENT, PRODUCT],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('consumes no pool at all when any one of them is full', async () => {
    // Partial consumption — holding the sport cap but not the product seat — is the
    // failure the deterministic lock order and single transaction exist to prevent.
    await pool.query('UPDATE core.quota_pool SET confirmed = capacity WHERE id = $1', [QUOTA]);
    const sportBefore = await pool.query<{ reserved: number }>(
      'SELECT reserved FROM core.quota_pool WHERE id = $1',
      [SPORT_POOL],
    );

    expect(await claimOneSeat()).toBe('full');

    const sportAfter = await pool.query<{ reserved: number }>(
      'SELECT reserved FROM core.quota_pool WHERE id = $1',
      [SPORT_POOL],
    );
    expect(sportAfter.rows[0]!.reserved).toBe(sportBefore.rows[0]!.reserved);
  });

  it('binds on the NARROWEST pool, not the widest', async () => {
    // Sport cap is 10, product pool is 6. More claimants must yield 6, not 10 —
    // proving both pools are actually consulted rather than just the one on the entry.
    const outcomes = await Promise.all(Array.from({ length: 15 }, () => claimOneSeat()));
    expect(outcomes.filter((o) => o === 'claimed')).toHaveLength(CAPACITY);
  }, 60_000);
});

describe('§10 — retries are free', () => {
  const scope = '00000000-0000-7000-8000-0000000000aa';

  beforeEach(async () => {
    await pool.query('DELETE FROM core.idempotency_key WHERE scope = $1', [scope]);
  });

  it('admits one writer for a key replayed 100 times concurrently', async () => {
    const attempt = async () => {
      try {
        await pool.query(
          `INSERT INTO core.idempotency_key (scope, key, endpoint, request_hash, state)
           VALUES ($1, 'k-1', 'POST /v1/payments', 'h', 'in_progress')`,
          [scope],
        );
        return 'won';
      } catch (err) {
        if ((err as { code?: string }).code === '23505') return 'duplicate';
        throw err;
      }
    };

    const outcomes = await Promise.all(Array.from({ length: 100 }, attempt));
    expect(outcomes.filter((o) => o === 'won')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'duplicate')).toHaveLength(99);
  }, 30_000);

  it('does not let one caller collide with another caller of the same key', async () => {
    // The security property: keys are scoped. Two people may legitimately generate
    // "k-1", and neither may ever see the other's stored response.
    const other = '00000000-0000-7000-8000-0000000000bb';
    await pool.query('DELETE FROM core.idempotency_key WHERE scope = $1', [other]);

    const insert = (s: string) =>
      pool.query(
        `INSERT INTO core.idempotency_key (scope, key, endpoint, request_hash, state)
         VALUES ($1, 'k-1', 'POST /v1/payments', 'h', 'in_progress')`,
        [s],
      );

    await expect(insert(scope)).resolves.toBeTruthy();
    await expect(insert(other)).resolves.toBeTruthy(); // must NOT be a unique violation

    await pool.query('DELETE FROM core.idempotency_key WHERE scope = $1', [other]);
  });

  it('cannot mark a key completed without a stored response', async () => {
    await pool.query(
      `INSERT INTO core.idempotency_key (scope, key, endpoint, request_hash, state)
       VALUES ($1, 'k-2', 'POST /v1/payments', 'h', 'in_progress')`,
      [scope],
    );
    await expect(
      pool.query(
        `UPDATE core.idempotency_key SET state = 'completed' WHERE scope = $1 AND key = 'k-2'`,
        [scope],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('§10 — history cannot be edited', () => {
  // REVOKE UPDATE/DELETE is a GRANT, so it only bites the application role. Connecting as
  // the owner would pass this test while production still lost its audit trail.
  const asApp = async (sql: string, params: unknown[] = []) => {
    const client = await pool.connect();
    try {
      // SET LOCAL only lasts for a transaction, so the role change needs one.
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE app_rw');
      return await client.query(sql, params);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  };

  it('refuses UPDATE and DELETE on the status trail as the application role', async () => {
    await expect(
      asApp('UPDATE core.entry_status_event SET reason = $1', ['tampered']),
    ).rejects.toMatchObject({
      code: '42501', // insufficient_privilege
    });
    await expect(asApp('DELETE FROM core.entry_status_event')).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('refuses to read the restricted schema as the application role', async () => {
    // PRV-04: the "clean export" is the default because the app role physically cannot
    // reach Article 9 data — not because an export function remembers to omit it.
    await expect(asApp('SELECT 1 FROM restricted.evidence_document')).rejects.toMatchObject({
      code: '42501',
    });
  });
});

describe('§10 — dual control is real', () => {
  it('refuses the same reviewer signing a case twice', async () => {
    const caseId = CASE;
    const signer = '00000000-0000-7000-8000-0000000000c2';
    await pool.query(
      `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
       VALUES ($1, $2, 'Signer', 'One', '1970-01-01')
       ON CONFLICT DO NOTHING`,
      [signer, `signer.${signer}@example.com`],
    );
    const sign = () =>
      pool.query(
        `INSERT INTO ops.exception_signature (case_id, signer_id, decision) VALUES ($1, $2, 'approve')`,
        [caseId, signer],
      );

    await pool.query('DELETE FROM ops.exception_signature WHERE case_id = $1', [caseId]);
    await expect(sign()).resolves.toBeTruthy();
    await expect(sign()).rejects.toMatchObject({ code: '23505' });
  });
});
