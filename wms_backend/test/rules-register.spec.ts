/**
 * F2 — one rule register. The participant derivation and the admin preview of the
 * same product must be the same MultiDimensionDerivation, not merely the same name.
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
import { RulesModule } from '../src/rules/rules.module';

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
  imports: [RulesModule],
  providers: [
    { provide: IDENTITY_PROVIDER, useValue: fake },
    AuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
})
class RulesTestModule {}

let app: INestApplication;
let baseUrl: string;

const EVENT = randomUUID();
const SPORT = randomUUID();
const RULE_SET = randomUUID();
const RULE_V1 = randomUUID();
const JUDO_SET = randomUUID();
const JUDO_V = randomUUID();
const PRODUCT = randomUUID();
const ATHLETE = randomUUID();
const PARTNER = randomUUID();
const OC = randomUUID();
const ATHLETE_PROFILE = randomUUID();
const PARTNER_PROFILE = randomUUID();
const ENTRY = randomUUID();
const WEIGHT_FACT = randomUUID();
const BELT_FACT = randomUUID();
const JUDO_PERSON = randomUUID();

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
     VALUES ($1, 'como-rules', 'Como Lake 2027', '2027-09-17', '2027-09-26', '2027-12-31')`,
    [EVENT],
  );
  await pool.query(`INSERT INTO core.sport (id, event_id, code, name) VALUES ($1, $2, 'tennis', 'Tennis')`, [
    SPORT,
    EVENT,
  ]);
  await pool.query(
    `INSERT INTO core.rule_set (id, event_id, sport_code, event_name) VALUES ($1, $2, 'tennis', $3)`,
    [RULE_SET, EVENT, "Men's Doubles"],
  );
  await pool.query(
    `INSERT INTO core.rule_set (id, event_id, sport_code, event_name) VALUES ($1, $2, 'judo', 'Individual')`,
    [JUDO_SET, EVENT],
  );
  await pool.query(
    `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status, reason)
     VALUES ($1, $2, 1, '2027-12-31', tstzrange(now(), NULL), 'draft', 'v2.1'),
            ($3, $4, 1, '2027-12-31', tstzrange(now(), NULL), 'draft', 'v1.0')`,
    [RULE_V1, RULE_SET, JUDO_V, JUDO_SET],
  );
  await pool.query(
    `INSERT INTO core.rule_dimension
       (rule_version_id, ordinal, attribute, aggregation, rounding, value_scale, band_kind, bands)
     VALUES
       ($1, 1, 'age', 'min', 'floor', 0, 'range',
        '[{"id":"td3034","name":"Men''s Doubles 30–34","min":30,"max":34},
          {"id":"td3539","name":"Men''s Doubles 35–39","min":35,"max":39},
          {"id":"td4044","name":"Men''s Doubles 40–44","min":40,"max":44},
          {"id":"td45","name":"Men''s Doubles 45+","min":45,"max":null}]'::jsonb),
       ($2, 1, 'age', 'self', 'floor', 0, 'range',
        '[{"id":"m30","name":"M30","min":30,"max":34}]'::jsonb),
       ($2, 2, 'weight_kg', 'self', 'none', 1, 'range',
        '[{"id":"u73","name":"-73kg","min":0,"max":73}]'::jsonb),
       ($2, 3, 'belt_rank', 'self', 'none', 0, 'enum',
        '[{"id":"dan","name":"Dan grades","codes":["1dan","2dan","3dan"]}]'::jsonb)`,
    [RULE_V1, JUDO_V],
  );
  await pool.query(
    `INSERT INTO core.rule_eligibility
       (rule_version_id, ordinal, predicate, params, severity, message_key)
     VALUES ($1, 1, 'min_age', '{"min":35}'::jsonb, 'blocks', 'eligibility.min_age')`,
    [JUDO_V],
  );

  await pool.query(
    `INSERT INTO core.sport_entry_product
       (id, event_id, sport_id, name, participant_type, rule_set_id, partner_required)
     VALUES ($1, $2, $3, $4, 'doubles', $5, true)`,
    [PRODUCT, EVENT, SPORT, "Men's Doubles", RULE_SET],
  );

  await pool.query(
    `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
     VALUES ($1, $2, 'Daniel', 'Harper', '1985-03-15'),
            ($3, $4, 'Marco', 'Rossi', '1988-09-22'),
            ($5, $6, 'Oc', 'Staff', '1970-01-01'),
            ($7, $8, 'Judo', 'Athlete', '1995-06-01')`,
    [
      ATHLETE,
      `ath.${ATHLETE}@example.com`,
      PARTNER,
      `part.${PARTNER}@example.com`,
      OC,
      `oc.${OC}@example.com`,
      JUDO_PERSON,
      `judo.${JUDO_PERSON}@example.com`,
    ],
  );
  await pool.query(`SELECT core.publish_rule_version($1, $2)`, [RULE_V1, OC]);
  await pool.query(`SELECT core.publish_rule_version($1, $2)`, [JUDO_V, OC]);

  await pool.query(
    `INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1, $2, $3), ($4, $5, $3)`,
    [ATHLETE_PROFILE, ATHLETE, EVENT, PARTNER_PROFILE, PARTNER],
  );
  await pool.query(
    `INSERT INTO core.registration_entry
       (id, event_id, athlete_profile_id, sport_entry_product_id, partner_profile_id, grade, rule_version_id)
     VALUES ($1, $2, $3, $4, $5, 'competitive', $6)`,
    [ENTRY, EVENT, ATHLETE_PROFILE, PRODUCT, PARTNER_PROFILE, RULE_V1],
  );
  await pool.query(
    `INSERT INTO core.entrant_attribute
       (id, event_id, person_id, attribute, numeric_value, status, verified_by, version_no)
     VALUES ($1, $2, $3, 'weight_kg', 72.4, 'verified', $4, 1)`,
    [WEIGHT_FACT, EVENT, JUDO_PERSON, OC],
  );
  await pool.query(
    `INSERT INTO core.entrant_attribute
       (id, event_id, person_id, attribute, text_value, status, verified_by, version_no)
     VALUES ($1, $2, $3, 'belt_rank', '2dan', 'verified', $4, 1)`,
    [BELT_FACT, EVENT, JUDO_PERSON, OC],
  );
}

beforeAll(async () => {
  await seedGraph();
  app = await NestFactory.create(RulesTestModule, { logger: false });
  configureApp(app);
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  if (app) await app.close();
});

describe('F2 — one register, same full derivation', () => {
  it('the same product resolves to the same MultiDimensionDerivation on both paths', async () => {
    const participant = fake.issueToken({ personId: ATHLETE, roles: ['participant'] });
    const oc = fake.issueToken({ personId: OC, roles: ['oc_admin'] });

    const fromEntry = await api(`/v1/registration-entries/${ENTRY}/category-derivation`, {
      headers: { authorization: `Bearer ${participant}` },
    });
    expect(fromEntry.status).toBe(200);
    const participantDerivation = (await fromEntry.json()) as Record<string, unknown>;

    const preview = await api(`/v1/admin/rule-versions/${RULE_V1}/preview-derivation`, {
      method: 'POST',
      headers: { authorization: `Bearer ${oc}` },
      body: JSON.stringify({
        roster: [
          { personId: ATHLETE, dob: '1985-03-15' },
          { personId: PARTNER, dob: '1988-09-22', role: 'partner' },
        ],
      }),
    });
    expect(preview.status).toBe(200);
    const adminDerivation = (await preview.json()) as Record<string, unknown>;

    expect(adminDerivation).toEqual(participantDerivation);
    expect(participantDerivation.categoryName).toBe("Men's Doubles 35–39");
    expect(participantDerivation.dimensions).toEqual([
      { attribute: 'age', value: 39, bandId: 'td3539', bandName: "Men's Doubles 35–39" },
    ]);
  });
});

describe('published content is frozen', () => {
  it('refuses to edit a published version (HTTP)', async () => {
    const oc = fake.issueToken({ personId: OC, roles: ['oc_admin'] });
    const patched = await api(`/v1/admin/rule-versions/${RULE_V1}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${oc}` },
      body: JSON.stringify({
        bands: [{ id: 'x', name: 'X', min: 0, max: 99 }],
      }),
    });
    expect(patched.status).toBe(422);
    const body = (await patched.json()) as { code: string };
    expect(body.code).toBe('RULE_VERSION_FROZEN');
  });

  it('refuses to activate a version with no impact analysis', async () => {
    const draft = randomUUID();
    await pool.query(
      `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status)
       VALUES ($1, $2, 9, '2027-12-31', tstzrange(now(), NULL), 'draft')`,
      [draft, RULE_SET],
    );
    await expect(
      pool.query(`UPDATE core.rule_version SET status = 'active' WHERE id = $1`, [draft]),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('judo three-dimension derivation', () => {
  it('bands age, decimal weight and belt enum and records the consumed facts', async () => {
    const oc = fake.issueToken({ personId: OC, roles: ['oc_admin'] });
    const preview = await api(`/v1/admin/rule-versions/${JUDO_V}/preview-derivation`, {
      method: 'POST',
      headers: { authorization: `Bearer ${oc}` },
      body: JSON.stringify({
        roster: [{ personId: JUDO_PERSON, dob: '1995-06-01' }],
        facts: [
          {
            id: WEIGHT_FACT,
            personId: JUDO_PERSON,
            attribute: 'weight_kg',
            numericValue: 72.4,
            status: 'verified',
          },
          {
            id: BELT_FACT,
            personId: JUDO_PERSON,
            attribute: 'belt_rank',
            textValue: '2dan',
            status: 'verified',
          },
        ],
      }),
    });
    expect(preview.status).toBe(200);
    const body = (await preview.json()) as {
      categoryName: string;
      blockedBy: Array<{ messageKey: string }>;
      dimensions: Array<{ attribute: string; value: number | string; attributeId?: string; bandName?: string }>;
    };
    expect(body.categoryName).toBe('M30 / -73kg / Dan grades');
    expect(body.dimensions).toEqual([
      { attribute: 'age', value: 32, bandId: 'm30', bandName: 'M30' },
      {
        attribute: 'weight_kg',
        value: 72.4,
        bandId: 'u73',
        bandName: '-73kg',
        attributeId: WEIGHT_FACT,
      },
      {
        attribute: 'belt_rank',
        value: '2dan',
        bandId: 'dan',
        bandName: 'Dan grades',
        attributeId: BELT_FACT,
      },
    ]);
    expect(body.blockedBy[0]?.messageKey).toBe('eligibility.min_age');
  });
});

describe('publish a new version', () => {
  it('creates a draft, runs impact analysis, publishes through core.publish_rule_version', async () => {
    const oc = fake.issueToken({ personId: OC, roles: ['oc_admin'] });
    const draft = await api(`/v1/admin/rule-sets/${RULE_SET}/versions`, {
      method: 'POST',
      headers: mutationHeaders(oc),
      body: JSON.stringify({
        fromVersionId: RULE_V1,
        bands: [
          { id: 'td3034', name: "Men's Doubles 30–34", min: 30, max: 39 },
          { id: 'td40', name: "Men's Doubles 40+", min: 40, max: null },
        ],
        versionLabel: 'v2.2',
      }),
    });
    expect(draft.status).toBe(201);
    const created = (await draft.json()) as { versionId: string };
    expect(created.versionId).toBeTruthy();

    const analysis = await api(`/v1/admin/rule-versions/${created.versionId}/impact-analysis`, {
      method: 'POST',
      headers: mutationHeaders(oc),
    });
    expect(analysis.status).toBe(200);
    const impact = (await analysis.json()) as { entriesExamined: number; entriesAffected: number };
    expect(impact.entriesExamined).toBe(1);
    expect(impact.entriesAffected).toBe(1);

    const published = await api(`/v1/admin/rule-versions/${created.versionId}/publish`, {
      method: 'POST',
      headers: mutationHeaders(oc),
    });
    expect(published.status).toBe(200);
    const body = (await published.json()) as { rule: SportRuleLike; notice: { toVersion: string } };
    expect(body.rule.version).toBe('v2.2');
    expect(body.notice.toVersion).toBe('v2.2');

    const listed = await api('/v1/rules?sport=Tennis&event=Men%27s%20Doubles', {
      headers: { authorization: `Bearer ${fake.issueToken({ personId: ATHLETE, roles: ['participant'] })}` },
    });
    expect(listed.status).toBe(200);
    const rules = (await listed.json()) as Array<{ version: string; id: string; bands: Array<{ maxAge: number | null }> }>;
    const live = rules.find((item) => item.id === created.versionId);
    expect(live?.version).toBe('v2.2');
    expect(live?.bands[0]?.maxAge).toBe(39);
    expect(rules.some((item) => item.id === RULE_V1)).toBe(false);

    const pinned = await api(`/v1/registration-entries/${ENTRY}/category-derivation`, {
      headers: { authorization: `Bearer ${fake.issueToken({ personId: ATHLETE, roles: ['participant'] })}` },
    });
    const pinnedBody = (await pinned.json()) as { ruleVersionId: string; categoryName: string };
    expect(pinnedBody.ruleVersionId).toBe(RULE_V1);
    expect(pinnedBody.categoryName).toBe("Men's Doubles 35–39");
  });
});

type SportRuleLike = { version: string; id: string };
