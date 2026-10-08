/**
 * CMP-03 (category combination preserving the award category) and CMP-04 (roster locks and
 * Games-time substitution revalidation).
 *
 * Almost every test here is a refusal, because both requirements are about what must NOT be
 * possible: an entrant's award category overwritten by the field they race in, an athlete
 * merged into two fields, a locked crew changed without its checks, an unaccredited athlete
 * walked onto the field of play.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { IdempotencyService } from '../src/common/idempotency/idempotency.service';
import { runPgTransaction } from '../src/db/pg-transaction';
import { CategoryCombinationService } from '../src/competition/category-combination.service';
import { StartListService } from '../src/competition/start-list.service';
import { RosterService } from '../src/roster/roster.service';

let pool: Pool;
let combinations: CategoryCombinationService;
let startLists: StartListService;
let rosters: RosterService;

const EVENT = randomUUID();
const SPORT = randomUUID();
const RULE_SET = randomUUID();
const RULE_VERSION = randomUUID();
const OFFICIAL = randomUUID();
const REFERENCE = '2027-12-31';

const headers = () => ({ 'idempotency-key': randomUUID() });
const suffix = EVENT.slice(0, 8);

async function product(name: string, participantType: 'individual' | 'crew'): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO core.sport_entry_product (id, event_id, sport_id, name, participant_type, rule_set_id)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, EVENT, SPORT, name, participantType, RULE_SET],
  );
  return id;
}

async function person(given: string, dob: string): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth, profile_status)
     VALUES ($1,$2,$3,'Masters',$4,'complete')`,
    [id, `${id}@example.com`, given, dob],
  );
  return id;
}

beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL as string });
  const idempotency = new IdempotencyService(runPgTransaction, pool);
  combinations = new CategoryCombinationService(pool, idempotency);
  startLists = new StartListService(pool, idempotency);
  rosters = new RosterService(idempotency);

  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1,$2,'Combinations','2027-09-17','2027-09-26',$3)`,
    [EVENT, `combo-${suffix}`, REFERENCE],
  );
  await pool.query(`INSERT INTO core.sport (id, event_id, code, name) VALUES ($1,$2,$3,'Combo')`, [
    SPORT,
    EVENT,
    `combo-${suffix}`,
  ]);
  await pool.query(`INSERT INTO core.rule_set (id, event_id, sport_code) VALUES ($1,$2,$3)`, [
    RULE_SET,
    EVENT,
    `combo-${suffix}`,
  ]);
  await pool.query(
    `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status)
     VALUES ($1,$2,1,$3, tstzrange(now(), NULL), 'draft')`,
    [RULE_VERSION, RULE_SET, REFERENCE],
  );
  // Crew-mean age bands. Mean 44 is Category C; swapping in a 26-year-old drops it to B.
  await pool.query(
    `INSERT INTO core.rule_dimension
       (rule_version_id, ordinal, attribute, aggregation, exclude_roles, rounding, value_scale, band_kind, bands)
     VALUES ($1, 1, 'age', 'mean', '{coxswain}', 'floor', 0, 'range',
       '[{"id":"cat-b","name":"Category B (35-42)","min":35,"max":42},
         {"id":"cat-c","name":"Category C (43+)","min":43,"max":null}]'::jsonb)`,
    [RULE_VERSION],
  );
  await pool.query(
    `INSERT INTO core.person (id, given_name, family_name, date_of_birth, profile_status)
     VALUES ($1,'Official','Person','1970-01-01','complete')`,
    [OFFICIAL],
  );
  await pool.query(
    `INSERT INTO core.accreditation_gate (event_id, role, requires) VALUES ($1,'athlete','{photo,eligibility}')`,
    [EVENT],
  );
});

afterAll(async () => {
  await pool.end();
});

// ── CMP-03 ─────────────────────────────────────────────────────────────────────────────────

describe('category combination — CMP-03', () => {
  async function individual(
    productId: string,
    name: string,
    category: string,
    status = 'confirmed',
  ) {
    const id = await person(name, '1983-05-05');
    const profile = randomUUID();
    const entry = randomUUID();
    await pool.query(
      `INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1,$2,$3)`,
      [profile, id, EVENT],
    );
    await pool.query(
      `INSERT INTO core.registration_entry
         (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id,
          status, original_category_name)
       VALUES ($1,$2,$3,$4,'competitive',$5,$6,$7)`,
      [entry, EVENT, profile, productId, RULE_VERSION, status, category],
    );
    return entry;
  }

  const combine = (productId: string, combinedKey: string, sourceKeys: string[]) =>
    combinations.combine({
      sportEntryProductId: productId,
      combinedKey,
      sourceKeys,
      minEntries: 6,
      reason: 'Four entrants in 45–49, three in 40–44',
      reasonKey: 'competition.combination.low_entries',
      actorId: OFFICIAL,
      scope: OFFICIAL,
      headers: headers(),
    });

  it('refuses a "combination" of one category', async () => {
    const productId = await product('Solo combination', 'individual');
    await expect(combine(productId, '40–49', ['40–44'])).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('refuses merging one category into two fields', async () => {
    // An entrant in 40–44 would appear on two start lists and be awarded twice.
    const productId = await product('Double merge', 'individual');
    await combine(productId, '40–49', ['40–44', '45–49']);
    await expect(combine(productId, '35–44', ['35–39', '40–44'])).rejects.toMatchObject({
      code: 'COMBINATION_CONFLICT',
    });
  });

  it('refuses building a field out of another field', async () => {
    // Chained combinations turn the award lineage into a graph every consumer must walk.
    const productId = await product('Chained merge', 'individual');
    await combine(productId, '40–49', ['40–44', '45–49']);
    await expect(combine(productId, '40–59', ['40–49', '50–59'])).rejects.toMatchObject({
      code: 'COMBINATION_CONFLICT',
    });
  });

  it("refuses writing the combined field over an entrant's award category — in the database", async () => {
    // The shortcut CMP-03 exists to prevent. One UPDATE would make every start list look
    // right and destroy the only record of what the athlete entered.
    const productId = await product('Overwrite attempt', 'individual');
    const entry = await individual(productId, 'Lineage', '40–44');
    await combine(productId, '40–49', ['40–44', '45–49']);

    await expect(
      pool.query(
        `UPDATE core.registration_entry SET current_category_name = '40–49' WHERE id = $1`,
        [entry],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      message: 'competition.combination.award_category_overwritten',
    });

    // A late entry born with the field as its original category loses lineage just the same.
    await expect(individual(productId, 'Late', '40–49')).rejects.toMatchObject({
      code: '23514',
      message: 'competition.combination.award_category_overwritten',
    });
  });

  it('builds one list for the field while every line keeps its own award category', async () => {
    const productId = await product('Combined 100m', 'individual');
    await individual(productId, 'Anna', '40–44');
    await individual(productId, 'Beppe', '45–49');
    await individual(productId, 'Carla', '50–54'); // not merged: must not appear
    await combine(productId, '40–49', ['40–44', '45–49']);

    const list = await startLists.build({
      sportEntryProductId: productId,
      categoryName: '40–49',
      actorId: OFFICIAL,
      scope: OFFICIAL,
      headers: headers(),
    });

    expect(list.categoryName).toBe('40–49');
    expect(list.combination).toMatchObject({
      combinedKey: '40–49',
      sourceKeys: ['40–44', '45–49'],
      reasonKey: 'competition.combination.low_entries',
    });
    const byName = Object.fromEntries(list.entries.map((e) => [e.displayName, e]));
    expect(Object.keys(byName).sort()).toEqual(['Anna Masters', 'Beppe Masters']);
    expect(byName['Anna Masters']).toMatchObject({
      categoryName: '40–49',
      awardCategoryName: '40–44',
    });
    expect(byName['Beppe Masters']).toMatchObject({
      categoryName: '40–49',
      awardCategoryName: '45–49',
    });

    // And the entries themselves were never touched.
    const untouched = await pool.query<{ current_category_name: string | null }>(
      `SELECT current_category_name FROM core.registration_entry WHERE sport_entry_product_id = $1`,
      [productId],
    );
    expect(untouched.rows.every((r) => r.current_category_name === null)).toBe(true);
  });

  it('refuses a combined-list line whose award category is not one of the merged sources', async () => {
    const productId = await product('Lineage guard', 'individual');
    const entry = await individual(productId, 'Dora', '40–44');
    await combine(productId, '40–49', ['40–44', '45–49']);
    const list = await startLists.build({
      sportEntryProductId: productId,
      categoryName: '40–49',
      actorId: OFFICIAL,
      scope: OFFICIAL,
      headers: headers(),
    });

    await expect(
      pool.query(
        `UPDATE core.start_list_entry SET award_category_name = '40–49'
          WHERE start_list_id = $1 AND registration_entry_id = $2`,
        [list.id, entry],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      message: 'competition.combination.award_category_not_a_source',
    });
  });

  it('leaves an ordinary single-category list unchanged', async () => {
    const productId = await product('Plain 100m', 'individual');
    await individual(productId, 'Elio', '40–44');
    const list = await startLists.build({
      sportEntryProductId: productId,
      categoryName: '40–44',
      actorId: OFFICIAL,
      scope: OFFICIAL,
      headers: headers(),
    });
    expect(list.combination).toBeNull();
    expect(list.entries[0]).toMatchObject({ categoryName: '40–44', awardCategoryName: '40–44' });
  });
});

// ── CMP-04 ─────────────────────────────────────────────────────────────────────────────────

describe('roster lock and Games-time substitution — CMP-04', () => {
  interface Crew {
    team: string;
    entry: string;
    captain: string;
    outgoing: string;
    /** Same age band as the outgoing rower — the crew stays in Category C. */
    peer: string;
    /** 26 years old — swapping them in drops the crew mean into Category B. */
    youngster: string;
  }

  async function accredit(personId: string): Promise<void> {
    await pool.query(
      `INSERT INTO core.accreditation
         (event_id, person_id, badge_number, role, photo_status, eligibility_status, status,
          valid_from, valid_until, issued_at)
       VALUES ($1,$2,$3,'athlete','approved','approved','issued','2026-01-01','2028-12-31', now())`,
      [EVENT, personId, `T-${randomUUID()}`],
    );
  }

  async function crew(): Promise<Crew> {
    const productId = await product(`Coxed four ${randomUUID().slice(0, 6)}`, 'crew');
    const captain = await person('Captain', '1980-01-01');
    const captainProfile = randomUUID();
    const team = randomUUID();
    const entry = randomUUID();
    await pool.query(
      `INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1,$2,$3)`,
      [captainProfile, captain, EVENT],
    );
    await pool.query(
      `INSERT INTO core.team_roster (id, event_id, captain_profile_id, sport_entry_product_id, name)
       VALUES ($1,$2,$3,$4,'Lario Masters')`,
      [team, EVENT, captainProfile, productId],
    );
    await pool.query(
      `INSERT INTO core.registration_entry
         (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id, team_roster_id)
       VALUES ($1,$2,$3,$4,'competitive',$5,$6)`,
      [entry, EVENT, captainProfile, productId, RULE_VERSION, team],
    );

    const members = [
      { name: 'Rower1', dob: '1983-03-15', role: 'rower', competes: true },
      { name: 'Rower2', dob: '1983-07-08', role: 'rower', competes: true },
      { name: 'Rower3', dob: '1983-02-17', role: 'rower', competes: true },
      { name: 'Rower4', dob: '1983-05-26', role: 'rower', competes: true },
      { name: 'Peer', dob: '1983-09-09', role: 'reserve', competes: false },
      { name: 'Youngster', dob: '2001-04-02', role: 'reserve', competes: false },
    ];
    const ids: string[] = [];
    const version = randomUUID();
    await pool.query(
      `INSERT INTO core.roster_version (id, team_id, version_no, status) VALUES ($1,$2,1,'draft')`,
      [version, team],
    );
    for (const [index, member] of members.entries()) {
      const id = await person(member.name, member.dob);
      ids.push(id);
      const membership = await pool.query<{ id: string }>(
        `INSERT INTO core.roster_member (roster_id, person_id, display_name, date_of_birth, role, position)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [team, id, member.name, member.dob, member.role, index + 1],
      );
      await pool.query(
        `INSERT INTO core.roster_selection
           (roster_version_id, person_id, membership_id, display_name, date_of_birth, role, position, competes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          version,
          id,
          membership.rows[0]!.id,
          member.name,
          member.dob,
          member.role,
          index + 1,
          member.competes,
        ],
      );
      // The starting crew holds badges; the reserves' badges are the variable under test.
      if (member.competes) await accredit(id);
    }
    await rosters.publishVersion({
      versionId: version,
      actorId: OFFICIAL,
      scope: OFFICIAL,
      headers: headers(),
    });

    return { team, entry, captain, outgoing: ids[3]!, peer: ids[4]!, youngster: ids[5]! };
  }

  const lock = (team: string) =>
    pool.query(
      `UPDATE core.team_roster SET locked_at = now() - interval '1 minute' WHERE id = $1`,
      [team],
    );

  const propose = (c: Crew, withPersonId: string) =>
    rosters.proposeSubstitution({
      entryId: c.entry,
      personId: c.captain,
      scope: c.captain,
      headers: headers(),
      body: { replacePersonId: c.outgoing, withPersonId },
    });

  const revalidate = (id: string) =>
    rosters.revalidateSubstitution({
      substitutionId: id,
      actorId: OFFICIAL,
      scope: OFFICIAL,
      headers: headers(),
    });

  const approve = (id: string) =>
    rosters.approveSubstitution({
      substitutionId: id,
      actorId: OFFICIAL,
      scope: OFFICIAL,
      headers: headers(),
    });

  it('refuses publishing a fresh roster version once the team is locked', async () => {
    // Publishing a new version repoints every entry on the team in one step — the
    // uncontrolled path CMP-04 closes at Games time.
    const c = await crew();
    await lock(c.team);
    const draft = randomUUID();
    await pool.query(
      `INSERT INTO core.roster_version (id, team_id, version_no, status) VALUES ($1,$2,99,'draft')`,
      [draft, c.team],
    );
    await expect(
      rosters.publishVersion({
        versionId: draft,
        actorId: OFFICIAL,
        scope: OFFICIAL,
        headers: headers(),
      }),
    ).rejects.toMatchObject({ code: 'ROSTER_LOCKED' });
  });

  it('records the real accreditation impact at proposal instead of asserting "unchanged"', async () => {
    const c = await crew();
    const proposed = await propose(c, c.peer); // the peer holds no badge
    const row = await pool.query<{
      accreditation_impact_key: string;
      accreditation_unmet: string[];
    }>(
      `SELECT accreditation_impact_key, accreditation_unmet FROM core.roster_substitution WHERE id = $1`,
      [proposed.id],
    );
    expect(row.rows[0]).toEqual({
      accreditation_impact_key: 'accreditation.review_required',
      accreditation_unmet: ['accreditation.missing'],
    });
  });

  it('refuses a Games-time substitution that was never revalidated', async () => {
    const c = await crew();
    await accredit(c.peer);
    const proposed = await propose(c, c.peer);
    await lock(c.team);
    await expect(approve(proposed.id)).rejects.toMatchObject({ code: 'REVALIDATION_REQUIRED' });
  });

  it('refuses walking an unaccredited athlete onto the field', async () => {
    const c = await crew();
    const proposed = await propose(c, c.peer); // no badge
    await lock(c.team);
    const checked = await revalidate(proposed.id);
    expect(checked).toMatchObject({
      gamesTime: true,
      categoryWouldChange: false,
      accreditationUnmet: ['accreditation.missing'],
      approvable: false,
    });
    await expect(approve(proposed.id)).rejects.toMatchObject({ code: 'ACCREDITATION_NOT_VALID' });
  });

  it('refuses a Games-time substitution that would move the crew into another category', async () => {
    // Before the lock this is a legitimate category change (TEA-04). After it, the field is set
    // and the crew would race in a category it is not entered in.
    const c = await crew();
    await accredit(c.youngster);
    const proposed = await propose(c, c.youngster);
    await lock(c.team);
    const checked = await revalidate(proposed.id);
    expect(checked).toMatchObject({
      categoryWouldChange: true,
      fromCategoryId: 'cat-c',
      toCategoryId: 'cat-b',
    });
    await expect(approve(proposed.id)).rejects.toMatchObject({ code: 'CATEGORY_WOULD_CHANGE' });
  });

  it('does not accept a revalidation performed before the lock', async () => {
    // The crew it checked could still change afterwards; the check has to describe the locked roster.
    const c = await crew();
    await accredit(c.peer);
    const proposed = await propose(c, c.peer);
    await revalidate(proposed.id);
    await pool.query(`UPDATE core.team_roster SET locked_at = now() WHERE id = $1`, [c.team]);
    await expect(approve(proposed.id)).rejects.toMatchObject({ code: 'REVALIDATION_REQUIRED' });
  });

  it('approves a revalidated Games-time substitution with a clean crew and an unchanged category', async () => {
    const c = await crew();
    await accredit(c.peer);
    const proposed = await propose(c, c.peer);
    await lock(c.team);
    expect(await revalidate(proposed.id)).toMatchObject({
      approvable: true,
      accreditationUnmet: [],
    });

    const approved = await approve(proposed.id);
    expect(approved.currentCategoryId).toBe('cat-c');
    const row = await pool.query<{ games_time: boolean; revalidated_by: string }>(
      `SELECT games_time, revalidated_by FROM core.roster_substitution WHERE id = $1`,
      [proposed.id],
    );
    expect(row.rows[0]).toEqual({ games_time: true, revalidated_by: OFFICIAL });
  });

  it('leaves pre-lock substitutions — including category changes — exactly as they were', async () => {
    const c = await crew();
    const proposed = await propose(c, c.youngster);
    const approved = await approve(proposed.id);
    expect(approved.currentCategoryId).toBe('cat-b');
  });
});
