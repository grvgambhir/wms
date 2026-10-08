/**
 * CMP-01 and CMP-06.
 *
 * The tests that matter are the negative ones: an unpublished or embargoed list must not leave
 * through the public path, and a published list must not be editable. Both are the kind of
 * guarantee that a filter in a controller appears to provide and does not.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { testRestrictedPool } from './db-url';
import { IdempotencyService } from '../src/common/idempotency/idempotency.service';
import { runPgTransaction } from '../src/db/pg-transaction';
import { StartListService } from '../src/competition/start-list.service';

let pool: Pool;
let startLists: StartListService;
let restricted: Pool;

const EVENT = randomUUID();
const SPORT = randomUUID();
const RULE_SET = randomUUID();
const RULE_VERSION = randomUUID();
const PRODUCT = randomUUID();
const OFFICIAL = randomUUID();
const CATEGORY = '40–44';

const headers = (key: string) => ({ 'idempotency-key': key });
const build = () =>
  startLists.build({
    sportEntryProductId: PRODUCT,
    categoryName: CATEGORY,
    actorId: OFFICIAL,
    scope: OFFICIAL,
    headers: headers(randomUUID()),
  });

async function athlete(opts: {
  name: string;
  status: string;
  paraClass?: string;
}): Promise<string> {
  const person = randomUUID();
  const profile = randomUUID();
  const entry = randomUUID();
  await pool.query(
    `INSERT INTO core.person (id, given_name, family_name, date_of_birth, profile_status, nationality)
     VALUES ($1,$2,'Runner','1985-04-02','complete','GB')`,
    [person, opts.name],
  );
  await pool.query(`INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1,$2,$3)`, [
    profile,
    person,
    EVENT,
  ]);
  await pool.query(
    `INSERT INTO core.registration_entry
       (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id,
        status, original_category_name)
     VALUES ($1,$2,$3,$4,'competitive',$5,$6,$7)`,
    [entry, EVENT, profile, PRODUCT, RULE_VERSION, opts.status, CATEGORY],
  );
  if (opts.paraClass) {
    // `core.para_class_projection` is a VIEW over `restricted.classification_fact` — it exists
    // so the competition side can read a class without crossing the PRV-04 boundary. Writing
    // therefore goes through the restricted connection, as it would in production.
    // `classification_requires_consent` refuses sensitive data without a granted consent on
    // record — the lawful basis has to exist before the data does, not alongside it.
    const consent = randomUUID();
    await pool.query(
      `INSERT INTO core.consent (id, person_id, event_id, kind, granted, version, source)
       VALUES ($1,$2,$3,'eligibility_medical',true,'v1','participant')`,
      [consent, person, EVENT],
    );
    await restricted.query(
      `INSERT INTO restricted.classification_fact
         (event_id, person_id, sport_code, class_code, verification_status,
          consent_id, lawful_basis, retain_until)
       VALUES ($1,$2,$3,$4,'verified',$5,'explicit_consent','2028-12-31')`,
      [EVENT, person, `sl-${EVENT.slice(0, 8)}`, opts.paraClass, consent],
    );
  }
  return entry;
}

beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL as string });
  restricted = testRestrictedPool();
  startLists = new StartListService(pool, new IdempotencyService(runPgTransaction, pool));

  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1,$2,'Start Lists','2027-09-17','2027-09-26','2027-12-31')`,
    [EVENT, `start-lists-${EVENT.slice(0, 8)}`],
  );
  await pool.query(
    `INSERT INTO core.sport (id, event_id, code, name) VALUES ($1,$2,$3,'Startlist Swimming')`,
    [SPORT, EVENT, `sl-${EVENT.slice(0, 8)}`],
  );
  await pool.query(`INSERT INTO core.rule_set (id, event_id, sport_code) VALUES ($1,$2,$3)`, [
    RULE_SET,
    EVENT,
    `sl-${EVENT.slice(0, 8)}`,
  ]);
  await pool.query(
    `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status)
     VALUES ($1,$2,1,'2027-12-31', tstzrange(now(), NULL), 'draft')`,
    [RULE_VERSION, RULE_SET],
  );
  await pool.query(
    `INSERT INTO core.sport_entry_product (id, event_id, sport_id, name, participant_type, rule_set_id)
     VALUES ($1,$2,$3,'100m Free','individual',$4)`,
    [PRODUCT, EVENT, SPORT, RULE_SET],
  );
  await pool.query(
    `INSERT INTO core.person (id, given_name, family_name, date_of_birth, profile_status)
     VALUES ($1,'Official','Person','1970-01-01','complete')`,
    [OFFICIAL],
  );

  await athlete({ name: 'Bravo', status: 'confirmed' });
  await athlete({ name: 'Alpha', status: 'confirmed', paraClass: 'S9' });
  await athlete({ name: 'Draftee', status: 'draft' });
});

afterAll(async () => {
  await restricted.end();
  await pool.end();
});

describe('building the list', () => {
  it('includes only confirmed entries', async () => {
    // A draft or unpaid entry on a start list tells an official that someone is racing who
    // has not finished registering.
    const list = await build();
    const names = list.entries.map((e) => e.displayName);
    expect(names).toContain('Bravo Runner');
    expect(names).toContain('Alpha Runner');
    expect(names).not.toContain('Draftee Runner');
    expect(list.status).toBe('draft');
    expect(list.versionNo).toBe(1);
  });

  it('leaves the para class empty rather than widening the boundary to get it', async () => {
    // `core.para_class_projection` is the redacted view built for exactly this, but it is
    // granted to `classification_ro` and app_rw is deliberately not a member —
    // `restricted-governance.spec.ts` asserts that refusal. Granting it here would have made
    // this field populate and would have quietly undone a boundary drawn on purpose.
    //
    // So the field is null until a `classification_ro` connection exists, the same way the
    // restricted evidence module has one for `restricted_rw`. This test records that as a
    // deliberate gap rather than letting it look like an oversight.
    const list = await startLists.get((await build()).id);
    const alpha = list.entries.find((e) => e.displayName === 'Alpha Runner')!;
    expect(alpha.classCode).toBeNull();
    expect(Object.keys(alpha)).not.toContain('evidence');
  });

  it('returns the open draft instead of starting a second one', async () => {
    // Two drafts for one scope is two people preparing the same document unaware of each other.
    const first = await build();
    const second = await build();
    expect(second.id).toBe(first.id);
  });
});

describe('publication — CMP-06', () => {
  it('refuses to publish straight from draft', async () => {
    const list = await build();
    await expect(
      startLists.publish({ startListId: list.id, actorId: OFFICIAL }),
    ).rejects.toMatchObject({ code: 'START_LIST_NOT_APPROVED' });
  });

  it('approves, hashes the content, then publishes', async () => {
    const list = await build();
    const approved = await startLists.approve({ startListId: list.id, actorId: OFFICIAL });
    expect(approved.status).toBe('approved');
    expect(approved.contentHash).toMatch(/^[0-9a-f]{64}$/);

    const published = await startLists.publish({ startListId: list.id, actorId: OFFICIAL });
    expect(published.status).toBe('published');
    expect(published.publishedAt).toBeTruthy();
  });

  it('keeps an approved-but-unpublished list out of the public read', async () => {
    const visible = await startLists.published({ eventId: EVENT });
    expect(visible.every((list) => list.status === 'published')).toBe(true);
  });

  it('hides a published list until its embargo lifts, then shows it', async () => {
    // The embargo is a time, not a second status — it lifts itself, with nobody remembering
    // to flip anything at the right moment.
    const product = randomUUID();
    await pool.query(
      `INSERT INTO core.sport_entry_product (id, event_id, sport_id, name, participant_type, rule_set_id)
       VALUES ($1,$2,$3,'Embargoed Event','individual',$4)`,
      [product, EVENT, SPORT, RULE_SET],
    );
    const list = await startLists.build({
      sportEntryProductId: product,
      categoryName: null,
      actorId: OFFICIAL,
      scope: OFFICIAL,
      headers: headers(randomUUID()),
    });
    await startLists.approve({ startListId: list.id, actorId: OFFICIAL });
    await startLists.publish({
      startListId: list.id,
      actorId: OFFICIAL,
      embargoUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    const hidden = await startLists.published({ eventId: EVENT, sportEntryProductId: product });
    expect(hidden).toHaveLength(0);

    // Move the embargo into the past — the same list is now visible, untouched.
    await pool.query(
      `UPDATE core.start_list SET embargo_until = now() - interval '1 minute' WHERE id = $1`,
      [list.id],
    );
    const shown = await startLists.published({ eventId: EVENT, sportEntryProductId: product });
    expect(shown).toHaveLength(1);
    expect(shown[0]!.id).toBe(list.id);
  });
});

describe('immutability and correction', () => {
  it('freezes the entries once the list leaves draft', async () => {
    const product = randomUUID();
    await pool.query(
      `INSERT INTO core.sport_entry_product (id, event_id, sport_id, name, participant_type, rule_set_id)
       VALUES ($1,$2,$3,'Frozen Event','individual',$4)`,
      [product, EVENT, SPORT, RULE_SET],
    );
    // The list needs at least one entry: a row-level trigger never fires on a DELETE that
    // matches nothing, so an empty list would make this test pass for the wrong reason.
    const person = randomUUID();
    const profile = randomUUID();
    await pool.query(
      `INSERT INTO core.person (id, given_name, family_name, date_of_birth, profile_status)
       VALUES ($1,'Frozen','Athlete','1985-04-02','complete')`,
      [person],
    );
    await pool.query(
      `INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1,$2,$3)`,
      [profile, person, EVENT],
    );
    await pool.query(
      `INSERT INTO core.registration_entry
         (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id, status)
       VALUES ($1,$2,$3,$4,'competitive',$5,'confirmed')`,
      [randomUUID(), EVENT, profile, product, RULE_VERSION],
    );

    const list = await startLists.build({
      sportEntryProductId: product,
      categoryName: null,
      actorId: OFFICIAL,
      scope: OFFICIAL,
      headers: headers(randomUUID()),
    });
    expect(list.entries).toHaveLength(1);
    await startLists.approve({ startListId: list.id, actorId: OFFICIAL });

    // Officials print this. A late change must not rewrite a document already in circulation.
    await expect(
      pool.query(`DELETE FROM core.start_list_entry WHERE start_list_id = $1`, [list.id]),
    ).rejects.toThrow(/frozen/);
    await expect(
      pool.query(
        `UPDATE core.start_list_entry SET display_name = 'Someone Else' WHERE start_list_id = $1`,
        [list.id],
      ),
    ).rejects.toThrow(/frozen/);
  });

  it('refuses a correction that does not say what it corrects', async () => {
    // CMP-05 asks for correction history. A version 2 with no reason is a silent rewrite.
    const product = randomUUID();
    await pool.query(
      `INSERT INTO core.sport_entry_product (id, event_id, sport_id, name, participant_type, rule_set_id)
       VALUES ($1,$2,$3,'Corrected Event','individual',$4)`,
      [product, EVENT, SPORT, RULE_SET],
    );
    const mk = () =>
      startLists.build({
        sportEntryProductId: product,
        categoryName: null,
        actorId: OFFICIAL,
        scope: OFFICIAL,
        headers: headers(randomUUID()),
      });
    const v1 = await mk();
    await startLists.approve({ startListId: v1.id, actorId: OFFICIAL });
    await startLists.publish({ startListId: v1.id, actorId: OFFICIAL });

    const v2 = await mk();
    expect(v2.versionNo).toBe(2);
    expect(v2.supersedes).toBe(v1.id);
    await startLists.approve({ startListId: v2.id, actorId: OFFICIAL });
    await expect(
      startLists.publish({ startListId: v2.id, actorId: OFFICIAL }),
    ).rejects.toMatchObject({ code: 'CORRECTION_NEEDS_REASON' });

    const corrected = await startLists.publish({
      startListId: v2.id,
      actorId: OFFICIAL,
      correctionReasonKey: 'competition.correction.late_withdrawal',
    });
    expect(corrected.status).toBe('published');

    // Exactly one published list per scope — two authoritative documents would disagree.
    const live = await startLists.published({ eventId: EVENT, sportEntryProductId: product });
    expect(live).toHaveLength(1);
    expect(live[0]!.id).toBe(v2.id);
  });
});
