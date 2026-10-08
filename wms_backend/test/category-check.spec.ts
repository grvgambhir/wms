/**
 * The admin category checker: a date of birth in, the category the ACTIVE rule gives out, and no
 * entry created. It exists because an entry locks the date of birth that produced it, so testing
 * bands through registration meant a database reset per date.
 */

import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RulesService } from '../src/rules/rules.service';
import type { IdempotencyService } from '../src/common/idempotency/idempotency.service';

let pool: Pool;
let rules: RulesService;

const EVENT = randomUUID();
const SPORT = randomUUID();
const RULE_SET = randomUUID();
const RULE_VERSION = randomUUID();
const INDIVIDUAL = randomUUID();
const CREW = randomUUID();
const CREW_RULE_SET = randomUUID();
const CREW_RULE_VERSION = randomUUID();
const OFFICIAL = randomUUID();

beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL as string });
  rules = new RulesService({} as IdempotencyService);
  const code = `cc-${EVENT.slice(0, 8)}`;

  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1, $2, 'Category Check', '2027-09-17', '2027-09-26', '2027-12-31')`,
    [EVENT, `cc-${EVENT}`],
  );
  await pool.query(
    `INSERT INTO core.sport (id, event_id, code, name) VALUES ($1, $2, $3, 'Check Sport')`,
    [SPORT, EVENT, code],
  );
  await pool.query(
    `INSERT INTO core.person (id, given_name, family_name, date_of_birth, profile_status)
     VALUES ($1, 'Official', 'Checker', '1970-01-01', 'complete')`,
    [OFFICIAL],
  );
  for (const [set, version, eventName, aggregation, exclude] of [
    [RULE_SET, RULE_VERSION, 'Check 100m', 'self', '{}'],
    [CREW_RULE_SET, CREW_RULE_VERSION, 'Check Four', 'mean', '{coxswain}'],
  ] as const) {
    await pool.query(
      `INSERT INTO core.rule_set (id, event_id, sport_code, event_name) VALUES ($1, $2, $3, $4)`,
      [set, EVENT, code, eventName],
    );
    await pool.query(
      `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status)
       VALUES ($1, $2, 1, '2027-12-31', tstzrange('2026-01-01', NULL), 'draft')`,
      [version, set],
    );
    await pool.query(
      `INSERT INTO core.rule_dimension
         (rule_version_id, ordinal, attribute, aggregation, exclude_roles, rounding, value_scale, band_kind, bands)
       VALUES ($1, 1, 'age', $2, $3, 'floor', 0, 'range',
         '[{"id":"b35","name":"35–39","min":35,"max":39},
           {"id":"b40","name":"40–44","min":40,"max":44}]'::jsonb)`,
      [version, aggregation, exclude],
    );
    await pool.query(`SELECT core.publish_rule_version($1, $2)`, [version, OFFICIAL]);
  }
  await pool.query(
    `INSERT INTO core.sport_entry_product (id, event_id, sport_id, name, participant_type, rule_set_id)
     VALUES ($1, $2, $3, 'Check 100m', 'individual', $4), ($5, $2, $3, 'Check Four', 'crew', $6)`,
    [INDIVIDUAL, EVENT, SPORT, RULE_SET, CREW, CREW_RULE_SET],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('category checker', () => {
  it('bands a date of birth against the reference date, not today', async () => {
    // 1985-06-01 is 41 today (Sep 2026) but 42 on 31 Dec 2027 — both 40–44. 1988-12-15 is the
    // sharper case: 37 today, 39 on the reference date.
    const forty = await rules.categoryCheck({
      sportEntryProductId: INDIVIDUAL,
      members: [{ dateOfBirth: '1985-06-01' }],
    });
    expect(forty.derivation.categoryName).toBe('40–44');
    expect(forty.referenceDate).toBe('2027-12-31');

    const late = await rules.categoryCheck({
      sportEntryProductId: INDIVIDUAL,
      members: [{ dateOfBirth: '1988-12-15' }],
    });
    expect(late.derivation.dimensions[0]).toMatchObject({ value: 39, bandName: '35–39' });
  });

  it('reports an age outside every band as blocked instead of inventing a category', async () => {
    const result = await rules.categoryCheck({
      sportEntryProductId: INDIVIDUAL,
      members: [{ dateOfBirth: '2005-01-01' }],
    });
    expect(result.derivation.categoryName).toBe('');
    expect(result.derivation.blockedBy.length).toBeGreaterThan(0);
  });

  it('applies the crew rule — mean age with the coxswain excluded', async () => {
    const result = await rules.categoryCheck({
      sportEntryProductId: CREW,
      members: [
        { dateOfBirth: '1986-01-01', role: 'rower' }, // 41
        { dateOfBirth: '1987-01-01', role: 'rower' }, // 40
        { dateOfBirth: '1988-01-01', role: 'rower' }, // 39
        { dateOfBirth: '1989-01-01', role: 'rower' }, // 38 → mean 39.5, floor 39
        { dateOfBirth: '2005-01-01', role: 'coxswain' }, // would drag the mean down if counted
      ],
    });
    expect(result.derivation.dimensions[0]).toMatchObject({ value: 39, bandName: '35–39' });
  });

  it('creates nothing', async () => {
    const before = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM core.registration_entry`,
    );
    await rules.categoryCheck({
      sportEntryProductId: INDIVIDUAL,
      members: [{ dateOfBirth: '1985-06-01' }],
    });
    const after = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM core.registration_entry`,
    );
    expect(after.rows[0]?.n).toBe(before.rows[0]?.n);
  });

  it('refuses a malformed date and an oversized crew', async () => {
    await expect(
      rules.categoryCheck({
        sportEntryProductId: INDIVIDUAL,
        members: [{ dateOfBirth: '01/06/1985' }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      rules.categoryCheck({
        sportEntryProductId: CREW,
        members: Array.from({ length: 21 }, () => ({ dateOfBirth: '1985-06-01' })),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('lists products with their sport', async () => {
    const products = await rules.categoryCheckProducts();
    expect(products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: CREW,
          name: 'Check Four',
          participantType: 'crew',
          sport: 'Check Sport',
        }),
      ]),
    );
  });
});

describe('registration options for a participant', () => {
  it('lists the event products with the caller\u2019s own category and their live entry', async () => {
    const person = randomUUID();
    const profile = randomUUID();
    const entry = randomUUID();
    await pool.query(
      `INSERT INTO core.person (id, given_name, family_name, date_of_birth, profile_status)
       VALUES ($1, 'Option', 'Seeker', '1985-06-01', 'complete')`,
      [person],
    );
    await pool.query(
      `INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1, $2, $3)`,
      [profile, person, EVENT],
    );
    await pool.query(
      `INSERT INTO core.registration_entry
         (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id, status)
       VALUES ($1, $2, $3, $4, 'competitive', $5, 'draft')`,
      [entry, EVENT, profile, INDIVIDUAL, RULE_VERSION],
    );

    const options = await rules.registrationOptions(person, EVENT);
    expect(options.event?.id).toBe(EVENT);
    const individual = options.products.find((product) => product.id === INDIVIDUAL)!;
    expect(individual.category).toMatchObject({ name: '40–44', eligible: true });
    expect(individual.myEntryId).toBe(entry);

    // A crew's category depends on the crew, so no preview is offered for it.
    const crew = options.products.find((product) => product.id === CREW)!;
    expect(crew.category).toBeNull();
    expect(crew.myEntryId).toBeNull();
  });

  it('marks an age outside every band as not eligible', async () => {
    const person = randomUUID();
    await pool.query(
      `INSERT INTO core.person (id, given_name, family_name, date_of_birth, profile_status)
       VALUES ($1, 'Too', 'Young', '2004-01-01', 'complete')`,
      [person],
    );
    const options = await rules.registrationOptions(person, EVENT);
    expect(options.products.find((product) => product.id === INDIVIDUAL)!.category).toMatchObject({
      name: null,
      eligible: false,
    });
  });
});
