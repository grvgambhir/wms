/**
 * The first repository against real Postgres.
 *
 * The test that matters most here is not "does it read a row" — it is that one participant
 * cannot read another's entry. That check lives in the SQL, so it has to be proven in SQL;
 * a service-layer test would pass while the query stayed open.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import {
  PostgresRegistrationJourneyRepository,
  projectQuota,
} from '../src/registration/postgres-registration-journey.repository';
import type { QuotaPool } from '@wms/domain';
import { assertJourneySnapshotShape } from './journey-snapshot';

let pool: Pool;
let repo: PostgresRegistrationJourneyRepository;

const EVENT = '00000000-0000-7000-8000-0000000000e1';
const SPORT = '00000000-0000-7000-8000-0000000000e2';
const RULE_SET = '00000000-0000-7000-8000-0000000000e3';
const RULE_VERSION = '00000000-0000-7000-8000-0000000000e4';
const PRODUCT = '00000000-0000-7000-8000-0000000000e5';
const ALICE = '00000000-0000-7000-8000-0000000000a1';
const BOB = '00000000-0000-7000-8000-0000000000b1';
const ALICE_PROFILE = '00000000-0000-7000-8000-0000000000a2';
const BOB_PROFILE = '00000000-0000-7000-8000-0000000000b2';
const ALICE_ENTRY = '00000000-0000-7000-8000-0000000000a3';

beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL as string });
  repo = new PostgresRegistrationJourneyRepository(pool);

  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1,'repo-test','Repo Test','2027-09-17','2027-09-26','2027-12-31')`,
    [EVENT],
  );
  await pool.query(
    `INSERT INTO core.sport (id, event_id, code, name) VALUES ($1,$2,'tennis','Tennis')`,
    [SPORT, EVENT],
  );
  await pool.query(
    `INSERT INTO core.rule_set (id, event_id, sport_code) VALUES ($1,$2,'tennis')`,
    [RULE_SET, EVENT],
  );
  await pool.query(
    `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status)
     VALUES ($1,$2,1,'2027-12-31', tstzrange(now(), NULL), 'draft')`,
    [RULE_VERSION, RULE_SET],
  );
  await pool.query(
    `INSERT INTO core.sport_entry_product (id, event_id, sport_id, name, participant_type, rule_set_id)
     VALUES ($1,$2,$3,'Tennis Singles','individual',$4)`,
    [PRODUCT, EVENT, SPORT, RULE_SET],
  );

  for (const [person, profile, name] of [
    [ALICE, ALICE_PROFILE, 'Alice'],
    [BOB, BOB_PROFILE, 'Bob'],
  ] as const) {
    await pool.query(
      `INSERT INTO core.person (id, given_name, family_name, date_of_birth)
       VALUES ($1,$2,'Test','1985-04-02')`,
      [person, name],
    );
    await pool.query(
      `INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1,$2,$3)`,
      [profile, person, EVENT],
    );
  }

  await pool.query(
    `INSERT INTO core.registration_entry
       (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id, status)
     VALUES ($1,$2,$3,$4,'competitive',$5,'draft')`,
    [ALICE_ENTRY, EVENT, ALICE_PROFILE, PRODUCT, RULE_VERSION],
  );
  await pool.query(
    `INSERT INTO core.entry_status_event (entry_id, to_status, actor_kind, reason)
     VALUES ($1,'draft','participant','created')`,
    [ALICE_ENTRY],
  );
  const quotaPool = '00000000-0000-7000-8000-0000000000a1';
  await pool.query(
    `INSERT INTO core.quota_pool (id, event_id, name, scope_kind, scope_ref, capacity)
     VALUES ($1,$2,'Tennis singles','product',$3,60)`,
    [quotaPool, EVENT, PRODUCT],
  );
  await pool.query(
    `INSERT INTO core.entry_quota_consumption (entry_id, quota_pool_id, units, state)
     VALUES ($1,$2,1,'reserved')`,
    [ALICE_ENTRY, quotaPool],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('getEntry', () => {
  it('maps a row to the domain shape, with its status trail', async () => {
    const entry = await repo.getEntry(ALICE_ENTRY);
    expect(entry).not.toBeNull();
    expect(entry!.status).toBe('draft');
    expect(entry!.grade).toBe('competitive');
    expect(entry!.statusHistory).toHaveLength(1);
    expect(entry!.statusHistory![0]!.actor).toBe('participant');
  });

  it('returns null for an unknown id rather than throwing', async () => {
    expect(await repo.getEntry('00000000-0000-7000-8000-00000000dead')).toBeNull();
  });
});

describe('getJourney — identity scoping', () => {
  it('returns the journey to the athlete who owns it', async () => {
    const snapshot = await repo.getJourney({
      eventId: EVENT,
      athleteId: ALICE,
      registrationEntryId: ALICE_ENTRY,
    });
    assertJourneySnapshotShape(snapshot, {
      entryId: ALICE_ENTRY,
      athleteId: ALICE_PROFILE,
      eventId: EVENT,
      sportId: SPORT,
      productId: PRODUCT,
    });
  });

  it('refuses Alice\'s entry to Bob', async () => {
    // The whole point. Bob supplies a real entry id and his own identity; the WHERE clause
    // must not return it.
    await expect(
      repo.getJourney({ eventId: EVENT, athleteId: BOB, registrationEntryId: ALICE_ENTRY }),
    ).rejects.toMatchObject({ code: 'REGISTRATION_ENTRY_NOT_FOUND' });
  });

  it('answers identically for a non-existent entry and someone else\'s', async () => {
    // Distinguishing the two would tell an attacker which entry ids are real.
    const stranger = repo.getJourney({
      eventId: EVENT, athleteId: BOB, registrationEntryId: ALICE_ENTRY,
    }).catch((e) => e);
    const missing = repo.getJourney({
      eventId: EVENT, athleteId: BOB, registrationEntryId: '00000000-0000-7000-8000-00000000dead',
    }).catch((e) => e);
    const [a, b] = await Promise.all([stranger, missing]);
    expect(a.code).toBe(b.code);
    expect(a.message).toBe(b.message);
  });
});

describe('projectQuota — which pool the participant is shown', () => {
  const mk = (id: string, capacity: number, confirmed: number): QuotaPool => ({
    id, eventId: EVENT, name: id, scopeKind: 'product', scopeRef: PRODUCT,
    allocation: 'general', unit: 'entry', capacity, confirmed, reserved: 0,
    updatedAt: '2026-09-09T00:00:00.000Z',
  });

  it('reports the tightest pool, not the widest', () => {
    // Sport cap 100 with 0 taken, product pool 60 with 58 taken: the participant is two
    // places from being refused, and showing the sport cap would say otherwise.
    const q = projectQuota([mk('sport', 100, 0), mk('product', 60, 58)]);
    expect(q!.id).toBe('product');
    expect(q!.status).toBe('available');
  });

  it('reports full when the binding pool has no headroom', () => {
    expect(projectQuota([mk('sport', 100, 0), mk('product', 60, 60)])!.status).toBe('full');
  });

  it('returns null for no pools rather than inventing an empty quota', () => {
    expect(projectQuota([])).toBeNull();
  });
});
