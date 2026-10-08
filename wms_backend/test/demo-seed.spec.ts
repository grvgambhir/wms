/**
 * Demo seed: the shipped journeys run against real Postgres, not fixture JSON.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { seedDemo } from '../seeds/demo';
import { asDatabaseRole } from './db-url';
import {
  BASKETBALL_35_39,
  BASKETBALL_FULL_POOL,
  BASKETBALL_RULE_VERSION,
  BASKETBALL_SPORT,
  BASKETBALL_TEAM,
  BASKETBALL_VERSION,
  ELENA_ID,
  GIULIA_ID,
  HARPER_BASKETBALL_ENTRY,
  HARPER_ID,
  LUCA_BASKETBALL_ENTRY,
  REFERENCE_DATE,
  ROWING_CAT_C,
  ROWING_RULE_VERSION,
  ROWING_VERSION,
  sportPoolId,
  TENNIS_ENTRY,
  TENNIS_FEE,
  TENNIS_INTENT,
  TENNIS_ORDER,
  TENNIS_PRODUCT,
  TENNIS_RULE_VERSION,
} from '../seeds/ids';

const CONNECTION = process.env.DATABASE_URL as string;

let pool: Pool;

beforeAll(async () => {
  pool = new Pool({ connectionString: CONNECTION, max: 4 });
  await seedDemo(pool);
  await seedDemo(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('demo seed — tennis doubles athlete (not singles)', () => {
  it('has an entry, a fee, a paid order and an invoice', async () => {
    const entry = await pool.query<{ sport_entry_product_id: string; status: string }>(
      `SELECT sport_entry_product_id, status FROM core.registration_entry WHERE id = $1`,
      [TENNIS_ENTRY],
    );
    expect(entry.rows[0]).toMatchObject({
      sport_entry_product_id: TENNIS_PRODUCT,
      status: 'confirmed',
    });

    const product = await pool.query<{ name: string }>(
      `SELECT name FROM core.sport_entry_product WHERE id = $1`,
      [TENNIS_PRODUCT],
    );
    expect(product.rows[0]?.name).toBe("Men's Doubles");

    const fee = await pool.query<{ base_amount_minor: string }>(
      `SELECT base_amount_minor::text FROM core.fee WHERE id = $1`,
      [TENNIS_FEE],
    );
    expect(Number(fee.rows[0]?.base_amount_minor)).toBe(9000);

    const intent = await pool.query<{ status: string; allocated_minor: string }>(
      `SELECT status, allocated_minor::text FROM core.payment_intent WHERE id = $1`,
      [TENNIS_INTENT],
    );
    expect(intent.rows[0]).toMatchObject({ status: 'settled', allocated_minor: '9000' });

    const invoice = await pool.query<{ type: string; gross_minor: string }>(
      `SELECT type, gross_minor::text FROM core.invoice WHERE order_id = $1 AND type = 'invoice'`,
      [TENNIS_ORDER],
    );
    expect(invoice.rows).toHaveLength(1);
    expect(Number(invoice.rows[0]?.gross_minor)).toBe(9000);
  });
});

describe('demo seed — basketball youngest selected member', () => {
  it('places the team in 35–39 from the selected crew, not the reserve', async () => {
    const ages = await pool.query<{ person_id: string; age_years: number }>(
      `SELECT person_id, age_years FROM core.roster_competing_ages($1, $2::date)`,
      [BASKETBALL_VERSION, REFERENCE_DATE],
    );
    expect(ages.rows.some((r) => r.person_id === HARPER_ID)).toBe(true);
    expect(ages.rows.some((r) => r.person_id === '693edf31-739e-4f28-96c4-202700000003')).toBe(
      false,
    );
    const youngest = Math.min(...ages.rows.map((r) => r.age_years));
    expect(youngest).toBe(38);

    const entry = await pool.query<{ current_category_id: string }>(
      `SELECT current_category_id FROM core.registration_entry
        WHERE team_roster_id = $1 AND athlete_profile_id IN
              (SELECT id FROM core.athlete_profile WHERE person_id = $2)
        LIMIT 1`,
      [BASKETBALL_TEAM, HARPER_ID],
    );
    expect(entry.rows[0]?.current_category_id).toBe(BASKETBALL_35_39);
    expect(youngest >= 35 && youngest <= 39).toBe(true);
  });
});

describe('demo seed — rowing average excluding cox and reserve', () => {
  it('does not let the reserve or the cox change Category C', async () => {
    const competing = await pool.query<{ person_id: string; role: string; age_years: number }>(
      `SELECT person_id, role, age_years FROM core.roster_competing_ages($1, $2::date)`,
      [ROWING_VERSION, REFERENCE_DATE],
    );
    expect(competing.rows.some((r) => r.role === 'coxswain')).toBe(true);
    expect(competing.rows.some((r) => r.person_id === 'd0e9c836-a139-4e90-a557-202700000025')).toBe(
      false,
    );

    const mean = await pool.query<{ floor: string }>(
      `SELECT floor(avg(age_years))::text AS floor
         FROM core.roster_competing_ages($1, $2::date)
        WHERE role IS DISTINCT FROM 'coxswain'`,
      [ROWING_VERSION, REFERENCE_DATE],
    );
    expect(Number(mean.rows[0]?.floor)).toBe(44);

    const withReserve = await pool.query<{ floor: string }>(
      `SELECT floor(avg(EXTRACT(YEAR FROM age($2::date, date_of_birth))))::text AS floor
         FROM core.roster_member
        WHERE roster_id = $1 AND role IS DISTINCT FROM 'coxswain'`,
      ['f8b8077d-7845-4f04-8f8c-202700000002', REFERENCE_DATE],
    );
    expect(Number(withReserve.rows[0]?.floor)).not.toBe(44);

    const entry = await pool.query<{ current_category_id: string }>(
      `SELECT current_category_id FROM core.registration_entry
        WHERE current_roster_version_id = $1`,
      [ROWING_VERSION],
    );
    expect(entry.rows[0]?.current_category_id).toBe(ROWING_CAT_C);
  });
});

describe('demo seed — waitlist behind the binding pool', () => {
  it('sits Luca behind the full 35–39 pool while the sport cap still has room', async () => {
    const narrow = await pool.query<{ confirmed: number; capacity: number }>(
      `SELECT confirmed, capacity FROM core.quota_pool WHERE id = $1`,
      [BASKETBALL_FULL_POOL],
    );
    expect(narrow.rows[0]).toEqual({ confirmed: 60, capacity: 60 });

    const sport = await pool.query<{ confirmed: number; capacity: number }>(
      `SELECT confirmed, capacity FROM core.quota_pool WHERE id = $1`,
      [sportPoolId(BASKETBALL_SPORT)],
    );
    expect(Number(sport.rows[0]?.confirmed)).toBeLessThan(Number(sport.rows[0]?.capacity));

    const wait = await pool.query<{ status: string; position: number; quota_pool_id: string }>(
      `SELECT status, position, quota_pool_id FROM core.waitlist_entry WHERE entry_id = $1`,
      [LUCA_BASKETBALL_ENTRY],
    );
    expect(wait.rows[0]).toMatchObject({
      status: 'waiting',
      position: 1,
      quota_pool_id: BASKETBALL_FULL_POOL,
    });
  });
});

describe('demo seed — para restricted evidence', () => {
  it('exists for Elena Rossi and app_rw cannot read it', async () => {
    const projected = await asDatabaseRole(
      'classification_ro',
      `SELECT class_code, verification_status, evidence_exists
         FROM core.para_class_projection WHERE person_id = $1`,
      [ELENA_ID],
    );
    expect(projected.rows[0]).toEqual({
      class_code: 'S9',
      verification_status: 'verified',
      evidence_exists: true,
    });

    await expect(
      asDatabaseRole('app_rw', 'SELECT 1 FROM restricted.classification_fact'),
    ).rejects.toMatchObject({
      code: '42501',
    });
    await expect(
      asDatabaseRole('app_rw', 'SELECT 1 FROM restricted.evidence_document'),
    ).rejects.toMatchObject({
      code: '42501',
    });
  });
});

describe('demo seed — accreditation validity window', () => {
  it('has an issued pass whose valid_until has not expired', async () => {
    const row = await pool.query<{ person_id: string; valid_until: string }>(
      `SELECT person_id, valid_until::text
         FROM core.accreditation
        WHERE person_id = $1 AND status = 'issued' AND valid_until >= CURRENT_DATE`,
      [GIULIA_ID],
    );
    expect(row.rows[0]?.person_id).toBe(GIULIA_ID);
    expect(row.rows[0]?.valid_until).toBe('2027-09-26');
  });
});

describe('demo seed — published rule versions', () => {
  it('activates through impact analysis with age dimensions from the fixtures', async () => {
    const tennis = await pool.query<{
      status: string;
      content_hash: string | null;
      aggregation: string;
    }>(
      `SELECT v.status, v.content_hash, d.aggregation
         FROM core.rule_version v
         JOIN core.rule_dimension d ON d.rule_version_id = v.id
        WHERE v.id = $1`,
      [TENNIS_RULE_VERSION],
    );
    expect(tennis.rows[0]?.status).toBe('active');
    expect(tennis.rows[0]?.content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(tennis.rows[0]?.aggregation).toBe('min');

    const rowing = await pool.query<{ aggregation: string; exclude_roles: string[] }>(
      `SELECT aggregation, exclude_roles FROM core.rule_dimension WHERE rule_version_id = $1`,
      [ROWING_RULE_VERSION],
    );
    expect(rowing.rows[0]).toMatchObject({ aggregation: 'mean' });
    expect(rowing.rows[0]?.exclude_roles).toContain('coxswain');

    const basketball = await pool.query<{ aggregation: string }>(
      `SELECT aggregation FROM core.rule_dimension WHERE rule_version_id = $1`,
      [BASKETBALL_RULE_VERSION],
    );
    expect(basketball.rows[0]?.aggregation).toBe('min');
  });
});

describe('demo seed — part-paid team order', () => {
  it('leaves unpaid members on the basketball roster balance', async () => {
    const unpaid = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM core.roster_member_balance
        WHERE roster_id = $1 AND settled_minor < due_minor`,
      [BASKETBALL_TEAM],
    );
    expect(Number(unpaid.rows[0]?.n)).toBeGreaterThan(0);

    const tennis = await pool.query<{ due_minor: string; settled_minor: string }>(
      `SELECT due_minor::text, settled_minor::text FROM core.entry_balance WHERE entry_id = $1`,
      [TENNIS_ENTRY],
    );
    expect(tennis.rows[0]?.due_minor).toBe('9000');
    expect(tennis.rows[0]?.settled_minor).toBe('9000');
  });
});

describe('demo seed — quota consumption', () => {
  it('records the tennis entry against the product pool and the sport cap', async () => {
    const rows = await pool.query<{ quota_pool_id: string; state: string }>(
      `SELECT quota_pool_id, state FROM core.entry_quota_consumption WHERE entry_id = $1`,
      [TENNIS_ENTRY],
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.every((r) => r.state === 'confirmed')).toBe(true);
  });

  it('consumes the binding basketball 35–39 pool once for the seeded team', async () => {
    const row = await pool.query<{ units: number; state: string }>(
      `SELECT units, state FROM core.entry_quota_consumption
        WHERE entry_id = $1 AND quota_pool_id = $2`,
      [HARPER_BASKETBALL_ENTRY, BASKETBALL_FULL_POOL],
    );
    expect(row.rows[0]).toEqual({ units: 1, state: 'confirmed' });
  });
});

describe('demo seed — pre-registration and assisted session', () => {
  it('keeps Giulia Moretti claimed and Harper unclaimed', async () => {
    const giulia = await pool.query<{ status: string; claimed_by: string | null }>(
      `SELECT status, claimed_by::text FROM core.pre_registration WHERE email = $1`,
      ['giulia.moretti@example.com'],
    );
    expect(giulia.rows[0]?.status).toBe('claimed');
    expect(giulia.rows[0]?.claimed_by).toBe(GIULIA_ID);

    const harper = await pool.query<{ status: string }>(
      `SELECT status FROM core.pre_registration WHERE email = $1`,
      ['daniel.harper@example.com'],
    );
    expect(harper.rows[0]?.status).toBe('unclaimed');
  });

  it("records Harper's assisted session behind proxy consent", async () => {
    const row = await pool.query<{ status: string }>(
      `SELECT status FROM core.assisted_session WHERE participant_id = $1`,
      [HARPER_ID],
    );
    expect(row.rows[0]?.status).toBe('draft');
  });
});

describe('demo seed — production guard', () => {
  it('refuses to load when NODE_ENV is production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(seedDemo(pool)).rejects.toThrow(/production/);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
