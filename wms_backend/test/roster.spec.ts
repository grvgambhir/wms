/**
 * Team rosters and partner invites on the real database.
 * Cardinality, immutability and same-team substitution are Postgres guarantees.
 * Category maths uses the entry's pinned rule_version_id, never the latest active.
 */
import { INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthGuard } from '../src/auth/guards/auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import {
  IDENTITY_PROVIDER,
  InvalidTokenError,
  type AuthenticatedIdentity,
  type IdentityProvider,
  type TokenPair,
} from '../src/auth/identity/identity-provider';
import { configureApp } from '../src/configure-app';
import { pool } from '../src/db/pool';
import { RosterModule } from '../src/roster/roster.module';
import { deriveEntryCategory } from '../src/rules/entry-category';

class FakeIdentityProvider implements IdentityProvider {
  private readonly tokens = new Map<string, AuthenticatedIdentity>();

  issueToken(identity: AuthenticatedIdentity): string {
    const token = `fake.${identity.personId}.${randomUUID()}`;
    this.tokens.set(token, identity);
    return token;
  }

  authenticate(): Promise<AuthenticatedIdentity | null> {
    return Promise.resolve(null);
  }

  issue(): Promise<TokenPair> {
    throw new InvalidTokenError();
  }

  async verify(accessToken: string): Promise<AuthenticatedIdentity> {
    const identity = this.tokens.get(accessToken);
    if (!identity) throw new InvalidTokenError();
    return identity;
  }

  refresh(): Promise<TokenPair> {
    throw new InvalidTokenError();
  }

  async revoke(): Promise<void> {
    return undefined;
  }
}

const fake = new FakeIdentityProvider();

@Module({
  imports: [RosterModule],
  providers: [
    { provide: IDENTITY_PROVIDER, useValue: fake },
    AuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
})
class RosterTestModule {}

let app: INestApplication;
let baseUrl: string;

const EVENT = randomUUID();
const SPORT = randomUUID();
const RULE_SET = randomUUID();
const RULE_V1 = randomUUID();
const RULE_V2 = randomUUID();
const PRODUCT = randomUUID();
const TEAM = randomUUID();
const OTHER_TEAM = randomUUID();
const ENTRY = randomUUID();
const CAPTAIN = randomUUID();
const CAPTAIN_PROFILE = randomUUID();
const ROWER = randomUUID();
const ROWER_PROFILE = randomUUID();
const OC = randomUUID();
const V1 = randomUUID();
const REFERENCE = '2027-12-31';

const CREW = [
  { person: randomUUID(), name: 'Daniel Harper', dob: '1981-03-15', role: 'rower', position: 1 },
  { person: randomUUID(), name: 'Alessandro Neri', dob: '1982-07-08', role: 'rower', position: 2 },
  { person: randomUUID(), name: 'Stefano Romano', dob: '1983-02-17', role: 'rower', position: 3 },
  { person: randomUUID(), name: 'Enzo Marino', dob: '1984-05-26', role: 'rower', position: 4 },
  { person: randomUUID(), name: 'Fabio Sala', dob: '1997-10-09', role: 'coxswain', position: 5 },
  { person: randomUUID(), name: 'Gianni Moretti', dob: '1991-04-02', role: 'reserve', position: 6 },
];

function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

function mutationHeaders(token: string, key = randomUUID()): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'idempotency-key': key };
}

async function seedGraph(): Promise<void> {
  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1, 'como-roster', 'Como Lake 2027', '2027-09-17', '2027-09-26', $2)`,
    [EVENT, REFERENCE],
  );
  await pool.query(
    `INSERT INTO core.sport (id, event_id, code, name) VALUES ($1, $2, 'rowing', 'Rowing')`,
    [SPORT, EVENT],
  );
  await pool.query(
    `INSERT INTO core.rule_set (id, event_id, sport_code) VALUES ($1, $2, 'rowing')`,
    [RULE_SET, EVENT],
  );
  await pool.query(
    `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status)
     VALUES ($1, $2, 1, $3, tstzrange(now(), NULL), 'draft'),
            ($4, $2, 2, $3, tstzrange(now(), NULL), 'draft')`,
    [RULE_V1, RULE_SET, REFERENCE, RULE_V2],
  );
  await pool.query(
    `INSERT INTO core.rule_dimension
       (rule_version_id, ordinal, attribute, aggregation, exclude_roles, rounding, value_scale, band_kind, bands)
     VALUES
       ($1, 1, 'age', 'mean', '{coxswain}', 'floor', 0, 'range',
        '[{"id":"cat-b","name":"Category B (35-42)","min":35,"max":42},
          {"id":"cat-c","name":"Category C (43+)","min":43,"max":null}]'::jsonb),
       ($2, 1, 'age', 'mean', '{coxswain}', 'floor', 0, 'range',
        '[{"id":"cat-b","name":"Category B (30-39)","min":30,"max":39},
          {"id":"cat-c","name":"Category C (40+)","min":40,"max":null}]'::jsonb)`,
    [RULE_V1, RULE_V2],
  );

  await pool.query(
    `INSERT INTO core.sport_entry_product
       (id, event_id, sport_id, name, participant_type, rule_set_id)
     VALUES ($1, $2, $3, 'Coxed four', 'crew', $4)`,
    [PRODUCT, EVENT, SPORT, RULE_SET],
  );

  await pool.query(
    `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
     VALUES ($1, $2, 'Casey', 'Captain', '1980-01-01'),
            ($3, $4, 'Riley', 'Rower', '1988-04-12'),
            ($5, $6, 'Oc', 'Staff', '1970-01-01')`,
    [
      CAPTAIN,
      `cap.${CAPTAIN}@example.com`,
      ROWER,
      `rower.${ROWER}@example.com`,
      OC,
      `oc.${OC}@example.com`,
    ],
  );
  await pool.query(`SELECT core.publish_rule_version($1, $2)`, [RULE_V2, OC]);

  for (const member of CREW) {
    const [given, family] = member.name.split(' ') as [string, string];
    await pool.query(
      `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
       VALUES ($1, $2, $3, $4, $5)`,
      [member.person, `${member.person}@example.com`, given, family, member.dob],
    );
  }

  await pool.query(
    `INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1, $2, $3), ($4, $5, $3)`,
    [CAPTAIN_PROFILE, CAPTAIN, EVENT, ROWER_PROFILE, ROWER],
  );
  await pool.query(
    `INSERT INTO core.team_roster (id, event_id, captain_profile_id, sport_entry_product_id, name)
     VALUES ($1, $2, $3, $4, 'Lario Masters Coxed Four'),
            ($5, $2, $3, $4, 'Other Crew')`,
    [TEAM, EVENT, CAPTAIN_PROFILE, PRODUCT, OTHER_TEAM],
  );
  await pool.query(
    `INSERT INTO core.registration_entry
       (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id, team_roster_id)
     VALUES ($1, $2, $3, $4, 'competitive', $5, $6)`,
    [ENTRY, EVENT, CAPTAIN_PROFILE, PRODUCT, RULE_V1, TEAM],
  );

  for (const member of CREW) {
    await pool.query(
      `INSERT INTO core.roster_member (roster_id, person_id, display_name, date_of_birth, role, position)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [TEAM, member.person, member.name, member.dob, member.role, member.position],
    );
  }

  await pool.query(
    `INSERT INTO core.roster_version (id, team_id, version_no, status)
     VALUES ($1, $2, 1, 'draft')`,
    [V1, TEAM],
  );
  for (const member of CREW) {
    const membership = await pool.query<{ id: string }>(
      `SELECT id FROM core.roster_member WHERE roster_id = $1 AND person_id = $2`,
      [TEAM, member.person],
    );
    await pool.query(
      `INSERT INTO core.roster_selection
         (roster_version_id, person_id, membership_id, display_name, date_of_birth, role, position, competes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        V1,
        member.person,
        membership.rows[0]!.id,
        member.name,
        member.dob,
        member.role,
        member.position,
        member.role !== 'reserve',
      ],
    );
  }
}

async function seedParticipantEntry(args: {
  personId: string;
  profileId: string;
  productId: string;
  entryId: string;
  participantType: 'individual' | 'doubles' | 'team' | 'crew' | 'relay';
  givenName: string;
  familyName: string;
  dateOfBirth: string;
  category?: { id: string; name: string };
}): Promise<void> {
  await pool.query(
    `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      args.personId,
      `${args.personId}@example.com`,
      args.givenName,
      args.familyName,
      args.dateOfBirth,
    ],
  );
  await pool.query(
    `INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1, $2, $3)`,
    [args.profileId, args.personId, EVENT],
  );
  await pool.query(
    `INSERT INTO core.sport_entry_product
       (id, event_id, sport_id, name, participant_type, rule_set_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [args.productId, EVENT, SPORT, `Fixture ${args.productId}`, args.participantType, RULE_SET],
  );
  await pool.query(
    `INSERT INTO core.registration_entry
       (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id,
        original_category_id, original_category_name, current_category_id, current_category_name)
     VALUES ($1, $2, $3, $4, 'competitive', $5, $6, $7, $6, $7)`,
    [
      args.entryId,
      EVENT,
      args.profileId,
      args.productId,
      RULE_V1,
      args.category?.id ?? null,
      args.category?.name ?? null,
    ],
  );
}

beforeAll(async () => {
  await seedGraph();
  app = await NestFactory.create(RosterTestModule, { logger: false });
  configureApp(app);
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  if (app) await app.close();
});

describe("category against the entry's own rule_version_id", () => {
  it('recomputes against the pinned version, not the current active one', async () => {
    const captain = fake.issueToken({ personId: CAPTAIN, roles: ['participant'] });
    const oc = fake.issueToken({ personId: OC, roles: ['oc_staff'] });

    const published = await api(`/v1/roster-versions/${V1}/publish`, {
      method: 'POST',
      headers: mutationHeaders(oc),
    });
    expect(published.status).toBe(200);

    const pinned = await pool.query<{ rule_version_id: string }>(
      `SELECT rule_version_id FROM core.registration_entry WHERE id = $1`,
      [ENTRY],
    );
    expect(pinned.rows[0]?.rule_version_id).toBe(RULE_V1);
    const active = await pool.query<{ id: string }>(
      `SELECT id FROM core.rule_version WHERE rule_set_id = $1 AND status = 'active'`,
      [RULE_SET],
    );
    expect(active.rows[0]?.id).toBe(RULE_V2);
    expect(active.rows[0]?.id).not.toBe(RULE_V1);

    // Anti-divergence: the value persisted by publishing must equal the canonical rules
    // adapter for exactly the same selected members, not a second hand-rolled age average.
    const expected = await deriveEntryCategory(pool, {
      ruleVersionId: RULE_V1,
      eventId: EVENT,
      members: CREW.filter((member) => member.role !== 'reserve').map((member) => ({
        id: member.person,
        personId: member.person,
        name: member.name,
        dob: member.dob,
        role: member.role,
      })),
    });
    const stored = await pool.query<{ current_category_id: string; current_category_name: string }>(
      `SELECT current_category_id, current_category_name FROM core.registration_entry WHERE id = $1`,
      [ENTRY],
    );
    expect(stored.rows[0]).toMatchObject({
      current_category_id: expected.id,
      current_category_name: expected.name,
    });

    const before = await pool.query<{ floor: string }>(
      `SELECT floor(avg(age_years))::text AS floor
         FROM core.roster_competing_ages($1, $2::date)
        WHERE role IS DISTINCT FROM 'coxswain'`,
      [V1, REFERENCE],
    );
    expect(Number(before.rows[0]?.floor)).toBe(44);

    const replacePerson = CREW[3]!.person;
    const withPerson = CREW[5]!.person;
    const proposed = await api(`/v1/registration-entries/${ENTRY}/roster-substitutions`, {
      method: 'POST',
      headers: mutationHeaders(captain),
      body: JSON.stringify({ replacePersonId: replacePerson, withPersonId: withPerson }),
    });
    expect(proposed.status).toBe(200);
    const body = (await proposed.json()) as {
      id: string;
      fromCategoryId: string;
      toCategoryId: string;
      fromCategoryName: string;
      toCategoryName: string;
      ruleVersionId: string;
    };
    expect(body.ruleVersionId).toBe(RULE_V1);
    expect(body.fromCategoryId).toBe('cat-c');
    expect(body.fromCategoryName).toBe('Category C (43+)');
    expect(body.toCategoryId).toBe('cat-b');
    expect(body.toCategoryName).toBe('Category B (35-42)');

    const approved = await api(`/v1/roster-substitutions/${body.id}/approve`, {
      method: 'POST',
      headers: mutationHeaders(oc),
    });
    expect(approved.status).toBe(200);
    const after = (await approved.json()) as {
      currentCategoryId: string;
      currentCategoryName: string;
    };
    expect(after.currentCategoryId).toBe('cat-b');
    expect(after.currentCategoryName).toBe('Category B (35-42)');
  });
});

describe('adding a player to an already-confirmed team (A2, REG-03)', () => {
  it('proposes an addition, lists it for the OC, and only moves the roster on approval', async () => {
    const captain = randomUUID();
    const captainProfile = randomUUID();
    const oc = randomUUID();
    const product = randomUUID();
    const team = randomUUID();
    const entry = randomUUID();
    const v1 = randomUUID();
    const members = [
      { person: randomUUID(), name: 'Paolo Gallo', dob: '1989-01-18', role: 'player', position: 1 },
      { person: randomUUID(), name: 'Marco Rossi', dob: '1988-09-21', role: 'player', position: 2 },
      { person: randomUUID(), name: 'Luca Bianchi', dob: '1994-06-10', role: 'reserve', position: 3 },
    ];

    await pool.query(
      `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
       VALUES ($1, $2, 'Como', 'Captain', '1985-04-10'), ($3, $4, 'Oc', 'Reviewer', '1970-01-01')`,
      [captain, `cap.${captain}@example.com`, oc, `oc.${oc}@example.com`],
    );
    for (const member of members) {
      const [given, family] = member.name.split(' ') as [string, string];
      await pool.query(
        `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
         VALUES ($1, $2, $3, $4, $5)`,
        [member.person, `${member.person}@example.com`, given, family, member.dob],
      );
    }
    await pool.query(`INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1, $2, $3)`, [
      captainProfile,
      captain,
      EVENT,
    ]);
    await pool.query(
      `INSERT INTO core.sport_entry_product
         (id, event_id, sport_id, name, participant_type, rule_set_id)
       VALUES ($1, $2, $3, 'Men''s Team', 'team', $4)`,
      [product, EVENT, SPORT, RULE_SET],
    );
    await pool.query(
      `INSERT INTO core.team_roster (id, event_id, captain_profile_id, sport_entry_product_id, name)
       VALUES ($1, $2, $3, $4, 'Como Lakers Masters')`,
      [team, EVENT, captainProfile, product],
    );
    await pool.query(
      `INSERT INTO core.registration_entry
         (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id, team_roster_id, status)
       VALUES ($1, $2, $3, $4, 'competitive', $5, $6, 'confirmed')`,
      [entry, EVENT, captainProfile, product, RULE_V1, team],
    );
    for (const member of members) {
      await pool.query(
        `INSERT INTO core.roster_member (roster_id, person_id, display_name, date_of_birth, role, position)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [team, member.person, member.name, member.dob, member.role, member.position],
      );
    }
    await pool.query(`INSERT INTO core.roster_version (id, team_id, version_no, status) VALUES ($1, $2, 1, 'draft')`, [
      v1,
      team,
    ]);
    for (const member of members.filter((m) => m.role !== 'reserve')) {
      const membership = await pool.query<{ id: string }>(
        `SELECT id FROM core.roster_member WHERE roster_id = $1 AND person_id = $2`,
        [team, member.person],
      );
      await pool.query(
        `INSERT INTO core.roster_selection
           (roster_version_id, person_id, membership_id, display_name, date_of_birth, role, position, competes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
        [v1, member.person, membership.rows[0]!.id, member.name, member.dob, member.role, member.position],
      );
    }

    const captainToken = fake.issueToken({ personId: captain, roles: ['participant'] });
    const ocToken = fake.issueToken({ personId: oc, roles: ['oc_staff'] });

    const published = await api(`/v1/roster-versions/${v1}/publish`, {
      method: 'POST',
      headers: mutationHeaders(ocToken),
    });
    expect(published.status).toBe(200);

    // The entry is already confirmed (and, in the real flow, paid) — this is exactly the case
    // that used to fail with ILLEGAL_STATUS_TRANSITION when the roster screen tried to save
    // through the general entry PUT. Proposing a substitution never touches entry.status.
    const reserve = members[2]!;
    const proposed = await api(`/v1/registration-entries/${entry}/roster-substitutions`, {
      method: 'POST',
      headers: mutationHeaders(captainToken),
      // No replacePersonId: nobody is leaving, someone is joining.
      body: JSON.stringify({ withPersonId: reserve.person }),
    });
    expect(proposed.status).toBe(200);
    const proposedBody = (await proposed.json()) as { id: string; toCategoryId: string };

    const statusAfterPropose = await pool.query<{ status: string }>(
      `SELECT status FROM core.registration_entry WHERE id = $1`,
      [entry],
    );
    expect(statusAfterPropose.rows[0]?.status).toBe('confirmed');

    const queue = await api('/v1/roster-substitutions/review-queue', {
      headers: { authorization: `Bearer ${ocToken}` },
    });
    expect(queue.status).toBe(200);
    const queueBody = (await queue.json()) as { items: Array<{ id: string; captainName?: string }> };
    expect(queueBody.items.some((item) => item.id === proposedBody.id)).toBe(true);
    expect(queueBody.items.find((item) => item.id === proposedBody.id)?.captainName).toBe('Como Captain');

    const beforeApproval = await pool.query<{ id: string }>(
      `SELECT person_id AS id FROM core.roster_selection WHERE roster_version_id = $1 AND competes`,
      [v1],
    );
    expect(beforeApproval.rows).toHaveLength(2);

    const approved = await api(`/v1/roster-substitutions/${proposedBody.id}/approve`, {
      method: 'POST',
      headers: mutationHeaders(ocToken),
    });
    expect(approved.status).toBe(200);

    const current = await pool.query<{ current_roster_version_id: string }>(
      `SELECT current_roster_version_id FROM core.registration_entry WHERE id = $1`,
      [entry],
    );
    const afterApproval = await pool.query<{ id: string }>(
      `SELECT person_id AS id FROM core.roster_selection
        WHERE roster_version_id = $1 AND competes`,
      [current.rows[0]!.current_roster_version_id],
    );
    expect(afterApproval.rows.map((row) => row.id)).toEqual(
      expect.arrayContaining([members[0]!.person, members[1]!.person, reserve.person]),
    );
    expect(afterApproval.rows).toHaveLength(3);
  });
});

describe('database guarantees', () => {
  it('cardinality above the maximum is refused by the database', async () => {
    const policySet = randomUUID();
    const policyVer = randomUUID();
    const roster = randomUUID();
    const person = randomUUID();
    const profile = randomUUID();
    const entry = randomUUID();
    await pool.query(
      `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
       VALUES ($1, $2, 'Max', 'Crew', '1990-01-01')`,
      [person, `max.${person}@example.com`],
    );
    await pool.query(
      `INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1, $2, $3)`,
      [profile, person, EVENT],
    );
    await pool.query(`INSERT INTO core.team_roster (id, event_id) VALUES ($1, $2)`, [
      roster,
      EVENT,
    ]);
    await pool.query(
      `INSERT INTO core.registration_entry
         (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id, team_roster_id)
       VALUES ($1, $2, $3, $4, 'competitive', $5, $6)`,
      [entry, EVENT, profile, PRODUCT, RULE_V1, roster],
    );
    await pool.query(
      `INSERT INTO core.registration_policy_set (id, event_id, sport_entry_product_id, name)
       VALUES ($1, $2, $3, 'crew cardinality')`,
      [policySet, EVENT, PRODUCT],
    );
    await pool.query(
      `INSERT INTO core.registration_policy_version
         (id, policy_set_id, version_no, status, effective)
       VALUES ($1, $2, 1, 'draft', tstzrange(now(), NULL))`,
      [policyVer, policySet],
    );
    await pool.query(
      `INSERT INTO core.registration_policy_roster_rule
         (policy_version_id, role, min_count, max_count, message_key)
       VALUES ($1, 'rower', 4, 4, 'registration.roster.rower_cardinality')`,
      [policyVer],
    );
    await pool.query(
      `UPDATE core.registration_policy_version SET status = 'active', published_at = now() WHERE id = $1`,
      [policyVer],
    );
    await pool.query(`UPDATE core.registration_entry SET policy_version_id = $2 WHERE id = $1`, [
      entry,
      policyVer,
    ]);

    for (let i = 0; i < 4; i += 1) {
      await pool.query(
        `INSERT INTO core.roster_member (roster_id, person_id, display_name, date_of_birth, role, position)
         VALUES ($1, $2, $3, '1990-01-15', 'rower', $4)`,
        [roster, person, `Rower ${i + 1}`, i + 1],
      );
    }
    await expect(
      pool.query(
        `INSERT INTO core.roster_member (roster_id, person_id, display_name, date_of_birth, role, position)
         VALUES ($1, $2, 'Fifth rower', '1991-03-03', 'rower', 6)`,
        [roster, person],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('cardinality below the minimum is refused by the database', async () => {
    const thinRoster = randomUUID();
    const thinEntry = randomUUID();
    const thinProfile = randomUUID();
    const thinPerson = randomUUID();
    const policySet = randomUUID();
    const policyVer = randomUUID();
    await pool.query(
      `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
       VALUES ($1, $2, 'Thin', 'Crew', '1987-02-14')`,
      [thinPerson, `thin.${thinPerson}@example.com`],
    );
    await pool.query(
      `INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1, $2, $3)`,
      [thinProfile, thinPerson, EVENT],
    );
    await pool.query(`INSERT INTO core.team_roster (id, event_id) VALUES ($1, $2)`, [
      thinRoster,
      EVENT,
    ]);
    await pool.query(
      `INSERT INTO core.registration_entry
         (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id, team_roster_id)
       VALUES ($1, $2, $3, $4, 'competitive', $5, $6)`,
      [thinEntry, EVENT, thinProfile, PRODUCT, RULE_V1, thinRoster],
    );
    await pool.query(
      `INSERT INTO core.roster_member (roster_id, display_name, date_of_birth, role, position)
       VALUES ($1, 'Only one', '1990-01-15', 'rower', 1)`,
      [thinRoster],
    );
    await pool.query(
      `INSERT INTO core.registration_policy_set (id, event_id, name) VALUES ($1, $2, 'thin')`,
      [policySet, EVENT],
    );
    await pool.query(
      `INSERT INTO core.registration_policy_version
         (id, policy_set_id, version_no, status, effective)
       VALUES ($1, $2, 1, 'draft', tstzrange(now(), NULL))`,
      [policyVer, policySet],
    );
    await pool.query(
      `INSERT INTO core.registration_policy_roster_rule
         (policy_version_id, role, min_count, max_count, message_key)
       VALUES ($1, 'rower', 4, 4, 'registration.roster.rower_cardinality')`,
      [policyVer],
    );
    await pool.query(
      `UPDATE core.registration_policy_version SET status = 'active', published_at = now() WHERE id = $1`,
      [policyVer],
    );
    const evalId = await pool.query<{ evaluate_registration_policy: string }>(
      `SELECT core.evaluate_registration_policy($1, $2)`,
      [thinEntry, policyVer],
    );
    const judged = await pool.query<{ result: string; message_key: string }>(
      `SELECT result, message_key FROM core.registration_policy_evaluation WHERE id = $1`,
      [evalId.rows[0]!.evaluate_registration_policy],
    );
    expect(judged.rows[0]?.result).toBe('fail');
    expect(judged.rows[0]?.message_key).toBe('registration.roster.rower_cardinality');
  });

  it('a published roster version cannot be edited', async () => {
    await expect(
      pool.query(
        `INSERT INTO core.roster_selection
           (roster_version_id, person_id, display_name, date_of_birth, role, position, competes)
         VALUES ($1, $2, 'Late add', '1990-01-01', 'rower', 99, true)`,
        [V1, ROWER],
      ),
    ).rejects.toThrow(/frozen/);
  });

  it('a substitution across teams is refused', async () => {
    const otherVersion = randomUUID();
    await pool.query(
      `INSERT INTO core.roster_version (id, team_id, version_no, status)
       VALUES ($1, $2, 1, 'proposed')`,
      [otherVersion, OTHER_TEAM],
    );
    await expect(
      pool.query(
        `INSERT INTO core.roster_substitution
           (entry_id, from_version_id, proposed_version_id, status,
            fee_impact_minor, refund_impact_minor, from_category_id, to_category_id,
            accreditation_impact_key, proposed_by, message_key)
         VALUES ($1, $2, $3, 'proposed', 0, 0, 'cat-c', 'cat-c',
                 'accreditation.unchanged', $4, 'roster.substitution.proposed')`,
        [ENTRY, V1, otherVersion, CAPTAIN],
      ),
    ).rejects.toThrow(/roster\.substitution\.wrong_team/);
  });

  it('a coxswain is excluded from the crew average', async () => {
    const meanAll = await pool.query<{ n: string }>(
      `SELECT core.roster_competing_mean_age($1, $2::date)::text AS n`,
      [V1, REFERENCE],
    );
    const meanWithoutCox = await pool.query<{ floor: string }>(
      `SELECT floor(avg(age_years))::text AS floor
         FROM core.roster_competing_ages($1, $2::date)
        WHERE role IS DISTINCT FROM 'coxswain'`,
      [V1, REFERENCE],
    );
    expect(Number(meanWithoutCox.rows[0]?.floor)).toBe(44);
    expect(Number(meanAll.rows[0]?.n)).not.toBe(44);
  });

  it('a member who is not the captain cannot invite — asserted in SQL', async () => {
    const refused = await pool.query<{ id: string }>(
      `INSERT INTO core.team_invitation
         (team_id, sport_entry_product_id, token_hash, expires_at, inviter_person_id, invitee_person_id)
       SELECT $1, $2, $3, now() + interval '1 day', $4, $5
         FROM core.team_roster tr
         JOIN core.athlete_profile ap ON ap.id = tr.captain_profile_id
        WHERE tr.id = $1
          AND ap.person_id = $4
       RETURNING id`,
      [
        TEAM,
        PRODUCT,
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        ROWER,
        CREW[0]!.person,
      ],
    );
    expect(refused.rows).toHaveLength(0);

    const rower = fake.issueToken({ personId: ROWER, roles: ['participant'] });
    const http = await api(`/v1/teams/${TEAM}/invitations`, {
      method: 'POST',
      headers: mutationHeaders(rower),
      body: JSON.stringify({ inviteePersonId: CREW[0]!.person, sportEntryProductId: PRODUCT }),
    });
    expect(http.status).toBe(422);

    const captain = fake.issueToken({ personId: CAPTAIN, roles: ['participant'] });
    const allowed = await api(`/v1/teams/${TEAM}/invitations`, {
      method: 'POST',
      headers: mutationHeaders(captain),
      body: JSON.stringify({ inviteePersonId: ROWER, sportEntryProductId: PRODUCT }),
    });
    expect(allowed.status).toBe(200);
  });
});

describe('participant-created teams and invitations', () => {
  it('creates exactly one team for its owner, hides other entries, and refuses individual entries', async () => {
    const owner = randomUUID();
    const owned = {
      personId: owner,
      profileId: randomUUID(),
      productId: randomUUID(),
      entryId: randomUUID(),
      participantType: 'team' as const,
      givenName: 'Tess',
      familyName: 'Owner',
      dateOfBirth: '1984-04-12',
    };
    const individual = {
      personId: randomUUID(),
      profileId: randomUUID(),
      productId: randomUUID(),
      entryId: randomUUID(),
      participantType: 'individual' as const,
      givenName: 'Indy',
      familyName: 'Solo',
      dateOfBirth: '1984-04-12',
    };
    await seedParticipantEntry(owned);
    await seedParticipantEntry(individual);

    const ownerToken = fake.issueToken({ personId: owner, roles: ['participant'] });
    const stranger = fake.issueToken({ personId: individual.personId, roles: ['participant'] });
    expect(
      (
        await api(`/v1/me/entries/${owned.entryId}/team`, {
          method: 'POST',
          headers: mutationHeaders(stranger),
        })
      ).status,
    ).toBe(404);

    const individualResponse = await api(`/v1/me/entries/${individual.entryId}/team`, {
      method: 'POST',
      headers: mutationHeaders(stranger),
    });
    expect(individualResponse.status).toBe(422);
    expect((await individualResponse.json()) as { code: string }).toMatchObject({
      code: 'VALIDATION_ERROR',
    });

    const idempotencyKey = randomUUID();
    const first = await api(`/v1/me/entries/${owned.entryId}/team`, {
      method: 'POST',
      headers: mutationHeaders(ownerToken, idempotencyKey),
    });
    const second = await api(`/v1/me/entries/${owned.entryId}/team`, {
      method: 'POST',
      headers: mutationHeaders(ownerToken, idempotencyKey),
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const created = (await first.json()) as { teamId: string };
    expect(await second.json()).toMatchObject({ teamId: created.teamId });
    const roster = await pool.query<{ members: string; selections: string }>(
      `SELECT count(member.id)::text AS members,
              (SELECT count(*)::text FROM core.roster_selection selection
                JOIN core.roster_version version ON version.id = selection.roster_version_id
               WHERE version.team_id = team.id) AS selections
         FROM core.team_roster team
         LEFT JOIN core.roster_member member ON member.roster_id = team.id
        WHERE team.id = $1
        GROUP BY team.id`,
      [created.teamId],
    );
    expect(roster.rows[0]).toEqual({ members: '1', selections: '1' });

    const duplicate = await api(`/v1/me/entries/${owned.entryId}/team`, {
      method: 'POST',
      headers: mutationHeaders(ownerToken),
    });
    expect(duplicate.status).toBe(409);
    expect(
      (await duplicate.json()) as { code: string; errors?: { teamId?: string } },
    ).toMatchObject({
      code: 'TEAM_ALREADY_EXISTS',
      errors: { teamId: created.teamId },
    });
  });

  it('adds only an invited participant to a draft roster and refuses acceptance after the lock', async () => {
    const captain = {
      personId: randomUUID(),
      profileId: randomUUID(),
      productId: randomUUID(),
      entryId: randomUUID(),
      participantType: 'crew' as const,
      givenName: 'Cara',
      familyName: 'Captain',
      dateOfBirth: '1982-02-02',
    };
    const invitee = {
      personId: randomUUID(),
      profileId: randomUUID(),
      productId: randomUUID(),
      entryId: randomUUID(),
      participantType: 'individual' as const,
      givenName: 'Ari',
      familyName: 'Invitee',
      dateOfBirth: '1990-03-03',
    };
    const lockedInvitee = {
      personId: randomUUID(),
      profileId: randomUUID(),
      productId: randomUUID(),
      entryId: randomUUID(),
      participantType: 'individual' as const,
      givenName: 'Lee',
      familyName: 'Locked',
      dateOfBirth: '1991-04-04',
    };
    await seedParticipantEntry(captain);
    await seedParticipantEntry(invitee);
    await seedParticipantEntry(lockedInvitee);
    const captainToken = fake.issueToken({ personId: captain.personId, roles: ['participant'] });
    const inviteeToken = fake.issueToken({ personId: invitee.personId, roles: ['participant'] });
    const lockedInviteeToken = fake.issueToken({
      personId: lockedInvitee.personId,
      roles: ['participant'],
    });
    const ocToken = fake.issueToken({ personId: OC, roles: ['oc_staff'] });

    const team = (await (
      await api(`/v1/me/entries/${captain.entryId}/team`, {
        method: 'POST',
        headers: mutationHeaders(captainToken),
      })
    ).json()) as { teamId: string };
    const invitation = (await (
      await api(`/v1/teams/${team.teamId}/invitations`, {
        method: 'POST',
        headers: mutationHeaders(captainToken),
        body: JSON.stringify({
          inviteePersonId: invitee.personId,
          sportEntryProductId: captain.productId,
        }),
      })
    ).json()) as { id: string };
    const inbox = (await (
      await api('/v1/me/invitations', { headers: { authorization: `Bearer ${inviteeToken}` } })
    ).json()) as Array<{ kind: string; id: string }>;
    expect(inbox).toContainEqual(expect.objectContaining({ kind: 'team', id: invitation.id }));
    expect(
      (
        await api(`/v1/team-invitations/${invitation.id}/accept`, {
          method: 'POST',
          headers: mutationHeaders(captainToken),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await api(`/v1/team-invitations/${invitation.id}/accept`, {
          method: 'POST',
          headers: mutationHeaders(inviteeToken),
        })
      ).status,
    ).toBe(200);
    const selected = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM core.roster_selection selection
         JOIN core.roster_version version ON version.id = selection.roster_version_id
        WHERE version.team_id = $1 AND selection.person_id = $2`,
      [team.teamId, invitee.personId],
    );
    expect(selected.rows[0]?.n).toBe('1');

    const pending = (await (
      await api(`/v1/teams/${team.teamId}/invitations`, {
        method: 'POST',
        headers: mutationHeaders(captainToken),
        body: JSON.stringify({
          inviteePersonId: lockedInvitee.personId,
          sportEntryProductId: captain.productId,
        }),
      })
    ).json()) as { id: string };
    expect(
      (
        await api(`/v1/teams/${team.teamId}/lock`, {
          method: 'POST',
          headers: mutationHeaders(ocToken),
        })
      ).status,
    ).toBe(200);
    const refused = await api(`/v1/team-invitations/${pending.id}/accept`, {
      method: 'POST',
      headers: mutationHeaders(lockedInviteeToken),
    });
    expect(refused.status).toBe(422);
    expect((await refused.json()) as { code: string }).toMatchObject({ code: 'ROSTER_LOCKED' });
  });
});

describe('partner acceptance changes the inviting entry', () => {
  it('is invitee-scoped and writes the rules-derived category audit', async () => {
    const owner = {
      personId: randomUUID(),
      profileId: randomUUID(),
      productId: randomUUID(),
      entryId: randomUUID(),
      participantType: 'doubles' as const,
      givenName: 'Dara',
      familyName: 'Doubles',
      dateOfBirth: '1980-01-01',
      category: { id: 'cat-c', name: 'Category C (43+)' },
    };
    const partner = {
      personId: randomUUID(),
      profileId: randomUUID(),
      productId: randomUUID(),
      entryId: randomUUID(),
      participantType: 'individual' as const,
      givenName: 'Pia',
      familyName: 'Partner',
      dateOfBirth: '1995-01-01',
    };
    await seedParticipantEntry(owner);
    await seedParticipantEntry(partner);
    const ownerToken = fake.issueToken({ personId: owner.personId, roles: ['participant'] });
    const partnerToken = fake.issueToken({ personId: partner.personId, roles: ['participant'] });
    const sent = await api('/v1/partner-requests', {
      method: 'POST',
      headers: mutationHeaders(ownerToken),
      body: JSON.stringify({
        eventId: EVENT,
        categoryId: 'cat-c',
        toAthleteId: partner.personId,
        entryId: owner.entryId,
      }),
    });
    expect(sent.status).toBe(200);
    const request = (await sent.json()) as { id: string };
    const inbox = (await (
      await api('/v1/me/invitations', { headers: { authorization: `Bearer ${partnerToken}` } })
    ).json()) as Array<{ kind: string; id: string }>;
    expect(inbox).toContainEqual(expect.objectContaining({ kind: 'partner', id: request.id }));
    expect(
      (
        await api(`/v1/partner-requests/${request.id}`, {
          method: 'POST',
          headers: mutationHeaders(ownerToken),
          body: JSON.stringify({ status: 'accepted' }),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await api(`/v1/partner-requests/${request.id}`, {
          method: 'POST',
          headers: mutationHeaders(partnerToken),
          body: JSON.stringify({ status: 'accepted' }),
        })
      ).status,
    ).toBe(200);

    const expected = await deriveEntryCategory(pool, {
      ruleVersionId: RULE_V1,
      eventId: EVENT,
      members: [
        {
          id: owner.personId,
          personId: owner.personId,
          name: 'Dara Doubles',
          dob: owner.dateOfBirth,
          role: 'entrant',
        },
        {
          id: partner.personId,
          personId: partner.personId,
          name: 'Pia Partner',
          dob: partner.dateOfBirth,
          role: 'partner',
        },
      ],
    });
    const entry = await pool.query<{
      partner_profile_id: string;
      original_category_id: string;
      current_category_id: string;
    }>(
      `SELECT partner_profile_id, original_category_id, current_category_id
         FROM core.registration_entry WHERE id = $1`,
      [owner.entryId],
    );
    expect(entry.rows[0]).toMatchObject({
      partner_profile_id: partner.profileId,
      original_category_id: 'cat-c',
      current_category_id: expected.id,
    });
    const audit = await pool.query<{
      from_category: string;
      to_category: string;
      trigger: string;
      occurred_at: Date;
    }>(
      `SELECT from_category, to_category, trigger, occurred_at
         FROM core.category_audit WHERE entry_id = $1 ORDER BY occurred_at DESC LIMIT 1`,
      [owner.entryId],
    );
    expect(audit.rows[0]).toMatchObject({
      from_category: 'cat-c',
      to_category: expected.id,
      trigger: 'partner_accepted',
    });
    expect(audit.rows[0]?.occurred_at).toBeInstanceOf(Date);
  });

  it('can be replaced — inviting a second partner no longer 404s once the entry already has one (A5)', async () => {
    const owner = {
      personId: randomUUID(),
      profileId: randomUUID(),
      productId: randomUUID(),
      entryId: randomUUID(),
      participantType: 'doubles' as const,
      givenName: 'Remy',
      familyName: 'Replaces',
      dateOfBirth: '1985-03-15',
      category: { id: 'cat-c', name: 'Category C (43+)' },
    };
    const first = {
      personId: randomUUID(),
      profileId: randomUUID(),
      productId: randomUUID(),
      entryId: randomUUID(),
      participantType: 'individual' as const,
      givenName: 'First',
      familyName: 'Partner',
      dateOfBirth: '1988-11-02',
    };
    const second = {
      personId: randomUUID(),
      profileId: randomUUID(),
      productId: randomUUID(),
      entryId: randomUUID(),
      participantType: 'individual' as const,
      givenName: 'Second',
      familyName: 'Partner',
      dateOfBirth: '1980-06-18',
    };
    await seedParticipantEntry(owner);
    await seedParticipantEntry(first);
    await seedParticipantEntry(second);
    const ownerToken = fake.issueToken({ personId: owner.personId, roles: ['participant'] });
    const firstToken = fake.issueToken({ personId: first.personId, roles: ['participant'] });
    const secondToken = fake.issueToken({ personId: second.personId, roles: ['participant'] });

    const firstRequest = (await (
      await api('/v1/partner-requests', {
        method: 'POST',
        headers: mutationHeaders(ownerToken),
        body: JSON.stringify({
          eventId: EVENT,
          categoryId: 'cat-c',
          toAthleteId: first.personId,
          entryId: owner.entryId,
        }),
      })
    ).json()) as { id: string };
    await api(`/v1/partner-requests/${firstRequest.id}`, {
      method: 'POST',
      headers: mutationHeaders(firstToken),
      body: JSON.stringify({ status: 'accepted' }),
    });

    // This is the bug this test guards: inviting a *second* partner used to 404
    // (REGISTRATION_ENTRY_NOT_FOUND) because the lookup required partner_profile_id IS NULL —
    // true only before a first partner is ever accepted, never again after.
    const secondSend = await api('/v1/partner-requests', {
      method: 'POST',
      headers: mutationHeaders(ownerToken),
      body: JSON.stringify({
        eventId: EVENT,
        categoryId: 'cat-c',
        toAthleteId: second.personId,
        entryId: owner.entryId,
      }),
    });
    expect(secondSend.status).toBe(200);
    const secondRequest = (await secondSend.json()) as { id: string };

    const secondAccept = await api(`/v1/partner-requests/${secondRequest.id}`, {
      method: 'POST',
      headers: mutationHeaders(secondToken),
      body: JSON.stringify({ status: 'accepted' }),
    });
    expect(secondAccept.status).toBe(200);

    const expected = await deriveEntryCategory(pool, {
      ruleVersionId: RULE_V1,
      eventId: EVENT,
      members: [
        {
          id: owner.personId,
          personId: owner.personId,
          name: 'Remy Replaces',
          dob: owner.dateOfBirth,
          role: 'entrant',
        },
        {
          id: second.personId,
          personId: second.personId,
          name: 'Second Partner',
          dob: second.dateOfBirth,
          role: 'partner',
        },
      ],
    });
    const entry = await pool.query<{ partner_profile_id: string; current_category_id: string }>(
      `SELECT partner_profile_id, current_category_id FROM core.registration_entry WHERE id = $1`,
      [owner.entryId],
    );
    // Second replaced First, and the category was recomputed against the new pair, not left
    // pointing at First (this is the whole point of allowing the replacement).
    expect(entry.rows[0]?.partner_profile_id).toBe(second.profileId);
    expect(entry.rows[0]?.current_category_id).toBe(expected.id);
  });
});
