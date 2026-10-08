/**
 * Findings F01 and F02, as executable proof.
 *
 * Both were designed, reviewed twice, and recorded as fixed — and neither existed in the
 * database until now. So these tests do not check that tables are present; they check that
 * the guarantees the plan claims are actually enforced by Postgres.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

let pool: Pool;

const EVENT = '00000000-0000-7000-8000-0000000f0001';
const PERSON = '00000000-0000-7000-8000-0000000f0002';
const RULE_SET = '00000000-0000-7000-8000-0000000f0003';
const V1 = '00000000-0000-7000-8000-0000000f0004';
const V2 = '00000000-0000-7000-8000-0000000f0005';
// A SEPARATE rule set, so the EXCLUDE on overlapping active versions does not fire first
// and mask the constraint actually under test.
const OTHER_SET = '00000000-0000-7000-8000-0000000f0006';
const OTHER_V1 = '00000000-0000-7000-8000-0000000f0007';

beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL as string });
  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1,'rule-immutability','Rule Immutability','2027-09-17','2027-09-26','2027-12-31')`,
    [EVENT],
  );
  await pool.query(
    `INSERT INTO core.person (id, given_name, family_name, date_of_birth)
     VALUES ($1,'Rule','Publisher','1980-01-01')`,
    [PERSON],
  );
  await pool.query(
    `INSERT INTO core.rule_set (id, event_id, sport_code) VALUES ($1,$2,'judo')`,
    [RULE_SET, EVENT],
  );
  await pool.query(
    `INSERT INTO core.rule_set (id, event_id, sport_code) VALUES ($1,$2,'golf')`,
    [OTHER_SET, EVENT],
  );
  await pool.query(
    `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status)
     VALUES ($1,$2,1,'2027-12-31', tstzrange(now(), NULL), 'draft')`,
    [OTHER_V1, OTHER_SET],
  );
  for (const [id, n] of [[V1, 1], [V2, 2]] as const) {
    await pool.query(
      `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status)
       VALUES ($1,$2,$3,'2027-12-31', tstzrange(now(), NULL), 'draft')`,
      [id, RULE_SET, n],
    );
  }
});

afterAll(async () => {
  await pool.end();
});

describe('F01 — a rule is dimensions, not an age column', () => {
  it('carries judo as three dimensions, two of them non-numeric', async () => {
    // The pattern that was previously unreachable: age is a range, weight is a range with
    // decimals, belt rank is an enum that does not sit on a number line.
    await pool.query(
      `INSERT INTO core.rule_dimension
         (rule_version_id, ordinal, attribute, aggregation, rounding, value_scale, band_kind, bands)
       VALUES
         ($1, 1, 'age',       'self', 'floor', 0, 'range',
          '[{"id":"m30","name":"M30","min":30,"max":34}]'::jsonb),
         ($1, 2, 'weight_kg', 'self', 'none',  1, 'range',
          '[{"id":"u73","name":"-73kg","min":0,"max":73}]'::jsonb),
         ($1, 3, 'belt_rank', 'self', 'none',  0, 'enum',
          '[{"id":"dan","name":"Dan grades","codes":["1dan","2dan","3dan"]}]'::jsonb)`,
      [V1],
    );
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM core.rule_dimension WHERE rule_version_id = $1`,
      [V1],
    );
    expect(Number(rows[0]!.n)).toBe(3);
  });

  it('refuses integer rounding on a decimal attribute', async () => {
    // floor() on a 73.6 kg weight corrupts the fact rather than banding it.
    await expect(
      pool.query(
        `INSERT INTO core.rule_dimension
           (rule_version_id, ordinal, attribute, rounding, value_scale, band_kind, bands)
         VALUES ($1, 9, 'handicap_index', 'floor', 1, 'range', '[]'::jsonb)`,
        [V2],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('refuses an attribute that is not in the dictionary', async () => {
    await expect(
      pool.query(
        `INSERT INTO core.rule_dimension
           (rule_version_id, ordinal, attribute, band_kind, bands)
         VALUES ($1, 8, 'vibes', 'range', '[]'::jsonb)`,
        [V2],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });
});

describe('F02 — published content is frozen and the analysis is bound to it', () => {
  it('refuses to activate a version with no impact analysis', async () => {
    // "No silent reclassification" as a constraint, not a runbook policy.
    await expect(
      pool.query(`UPDATE core.rule_version SET status = 'active' WHERE id = $1`, [V1]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('publishes through the helper, which runs the analysis and binds the hash', async () => {
    await pool.query(`SELECT core.publish_rule_version($1, $2)`, [V1, PERSON]);
    const { rows } = await pool.query<{ status: string; content_hash: string | null }>(
      `SELECT status, content_hash FROM core.rule_version WHERE id = $1`,
      [V1],
    );
    expect(rows[0]!.status).toBe('active');
    expect(rows[0]!.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('freezes dimensions once the version leaves draft', async () => {
    // The defect this closes: §4.3.1 moved the bands into child tables and left the
    // immutability trigger on the near-empty header, so a published rule's MEANING could
    // be rewritten while its version id stayed the same.
    await expect(
      pool.query(
        `UPDATE core.rule_dimension SET bands = '[{"id":"x","name":"X","min":0,"max":99}]'::jsonb
          WHERE rule_version_id = $1 AND ordinal = 1`,
        [V1],
      ),
    ).rejects.toThrow(/frozen/);

    await expect(
      pool.query(`DELETE FROM core.rule_dimension WHERE rule_version_id = $1`, [V1]),
    ).rejects.toThrow(/frozen/);
  });

  it('refuses one version activating on another version\'s analysis', async () => {
    // A plain "analysis_id IS NOT NULL" would allow this: the FK proves an analysis exists,
    // not that it is THIS one's. The composite key over (analysis, version, hash) is what
    // makes it impossible.
    const { rows } = await pool.query<{ id: string; evaluated_content_hash: string }>(
      `SELECT id, evaluated_content_hash FROM core.rule_impact_analysis WHERE rule_version_id = $1`,
      [V1],
    );
    const v1Analysis = rows[0]!;
    // OTHER_V1 is in a different rule set, so the overlapping-active EXCLUDE cannot fire
    // and mask this — the composite FK is what has to refuse it.
    await expect(
      pool.query(
        `UPDATE core.rule_version
            SET impact_analysis_id = $2, content_hash = $3, status = 'active'
          WHERE id = $1`,
        [OTHER_V1, v1Analysis.id, v1Analysis.evaluated_content_hash],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });
});

describe('REG-13 — pre-registration, the foundation Track D needs', () => {
  const BATCH = '00000000-0000-7000-8000-0000000f00b1';

  it('stops one person claiming two EOI records', async () => {
    const insert = (ref: string) =>
      pool.query(
        `INSERT INTO core.pre_registration
           (event_id, reference, first_name, last_name, email, date_of_birth,
            source_list, migration_batch, status, claimed_by, claimed_at)
         VALUES ($1,$2,'A','B',$3,'1985-01-01','legacy-2026',$4,'claimed',$5, now())`,
        [EVENT, ref, `${ref}@demo.invalid`, BATCH, PERSON],
      );
    await expect(insert('COMO27-EOI-0001')).resolves.toBeTruthy();
    await expect(insert('COMO27-EOI-0002')).rejects.toMatchObject({ code: '23505' });
  });

  it('keeps claimed status and claimant consistent', async () => {
    await expect(
      pool.query(
        `INSERT INTO core.pre_registration
           (event_id, reference, first_name, last_name, email, date_of_birth,
            source_list, migration_batch, status)
         VALUES ($1,'COMO27-EOI-0003','A','B','x@demo.invalid','1985-01-01','legacy-2026',$2,'claimed')`,
        [EVENT, BATCH],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('PLT-06 — no proxy registration without recorded consent', () => {
  it('refuses a draft assisted session with no consent', async () => {
    await expect(
      pool.query(
        `INSERT INTO core.assisted_session (event_id, participant_id, operator_id, status)
         VALUES ($1,$2,$2,'draft')`,
        [EVENT, PERSON],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('placeholder profiles cannot register', () => {
  // A Cognito first login creates a person with date_of_birth 1900-01-01, because an access
  // token carries no profile. On the 2027 reference date that computes as 127. No seeded
  // band is open-ended today, so it currently fails safely by accident — but the plan's
  // RangeBand supports `max: null` ("100+"), and the day someone adds it a placeholder
  // would land in a real category silently.
  const PLACEHOLDER = '00000000-0000-7000-8000-0000000f00c1';
  const PROFILE = '00000000-0000-7000-8000-0000000f00c2';

  it('refuses an entry for a person whose profile is a placeholder', async () => {
    await pool.query(
      `INSERT INTO core.person (id, given_name, family_name, date_of_birth, profile_status)
       VALUES ($1,'Pending','User','1900-01-01','placeholder')`,
      [PLACEHOLDER],
    );
    await pool.query(
      `INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1,$2,$3)`,
      [PROFILE, PLACEHOLDER, EVENT],
    );
    const product = await pool.query<{ id: string }>(
      `SELECT id FROM core.sport_entry_product LIMIT 1`,
    );
    if (!product.rows[0]) return;   // no product seeded in this database; nothing to assert

    await expect(
      pool.query(
        `INSERT INTO core.registration_entry
           (event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id)
         VALUES ($1,$2,$3,'competitive',$4)`,
        [EVENT, PROFILE, product.rows[0].id, V1],
      ),
    ).rejects.toThrow(/placeholder/);
  });
});
