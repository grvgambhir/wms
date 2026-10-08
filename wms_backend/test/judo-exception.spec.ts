/**
 * A4 Judo eligibility: verified, sport-scoped facts drive the refusal and a
 * participant can escalate only an entry they own.  This is deliberately an
 * HTTP test: it covers the participant endpoint and the existing OC queue.
 */
import { INestApplication, Module } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
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
import { RegistrationModule } from '../src/registration/registration.module';

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
  imports: [RegistrationModule],
  providers: [
    { provide: IDENTITY_PROVIDER, useValue: fake },
    AuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
})
class JudoExceptionTestModule {}

const EVENT = randomUUID();
const SPORT = randomUUID();
const RULE_SET = randomUUID();
const RULE_VERSION = randomUUID();
const PRODUCT = randomUUID();
const REVIEWER_A = randomUUID();
const REVIEWER_B = randomUUID();
const PASSING = randomUUID();
const WEIGHT_FAIL = randomUUID();
const BELT_FAIL = randomUUID();
const LICENCE_FAIL = randomUUID();
const OTHER = randomUUID();
const ENTRIES = new Map<string, string>();

let app: INestApplication;
let baseUrl: string;

function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

function headers(token: string, key: string = randomUUID()): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'idempotency-key': key };
}

async function fact(args: {
  personId: string;
  attribute: 'weight_kg' | 'belt_rank' | 'federation_licence';
  numericValue?: number;
  textValue?: string;
  validUntil?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO core.entrant_attribute
       (event_id, person_id, attribute, sport_code, issuer, numeric_value, text_value,
        status, verified_by, verified_at, valid_until)
     VALUES ($1, $2, $3, 'judo', 'Judo federation', $4, $5, 'verified', $6, now(), $7)`,
    [
      EVENT,
      args.personId,
      args.attribute,
      args.numericValue ?? null,
      args.textValue ?? null,
      REVIEWER_A,
      args.validUntil ?? null,
    ],
  );
}

async function addAthlete(personId: string, label: string): Promise<void> {
  const profile = randomUUID();
  const entry = randomUUID();
  ENTRIES.set(personId, entry);
  await pool.query(
    `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
     VALUES ($1, $2, $3, 'Judoka', '1995-07-10')`,
    [personId, `${personId}@example.com`, label],
  );
  await pool.query(
    `INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1, $2, $3)`,
    [profile, personId, EVENT],
  );
  await pool.query(
    `INSERT INTO core.person_role (person_id, role_code, event_id, granted_by)
     VALUES ($1, 'participant', $2, $1)`,
    [personId, EVENT],
  );
  await pool.query(
    `INSERT INTO core.registration_entry
       (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id, status)
     VALUES ($1, $2, $3, $4, 'competitive', $5, 'draft')`,
    [entry, EVENT, profile, PRODUCT, RULE_VERSION],
  );
}

async function seed(): Promise<void> {
  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date, status)
     VALUES ($1, $2, 'A4 Judo', '2027-09-17', '2027-09-26', '2027-12-31', 'registration_open')`,
    [EVENT, `a4-judo-${EVENT.slice(0, 8)}`],
  );
  await pool.query(
    `INSERT INTO core.sport (id, event_id, code, name) VALUES ($1, $2, 'judo', 'Judo')`,
    [SPORT, EVENT],
  );
  await pool.query(`INSERT INTO core.rule_set (id, event_id, sport_code) VALUES ($1, $2, 'judo')`, [
    RULE_SET,
    EVENT,
  ]);
  await pool.query(
    `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status)
     VALUES ($1, $2, 1, '2027-12-31', tstzrange('2026-01-01', NULL), 'draft')`,
    [RULE_VERSION, RULE_SET],
  );
  await pool.query(
    `INSERT INTO core.rule_dimension
       (rule_version_id, ordinal, attribute, aggregation, exclude_roles, rounding, value_scale, band_kind, bands)
     VALUES
       ($1, 1, 'age', 'self', '{}', 'floor', 0, 'range', '[{"id":"senior","name":"Senior","min":18,"max":99}]'),
       ($1, 2, 'weight_kg', 'self', '{}', 'none', 1, 'range', '[{"id":"-81","name":"−81 kg","min":0,"max":81}]'),
       ($1, 3, 'belt_rank', 'self', '{}', 'none', 0, 'enum', '[{"id":"dan","name":"2nd dan or above","codes":["2dan","3dan","4dan","5dan"]}]')`,
    [RULE_VERSION],
  );
  await pool.query(
    `INSERT INTO core.rule_eligibility (rule_version_id, ordinal, predicate, params, severity, message_key)
     VALUES
       ($1, 1, 'attribute_range', '{"attribute":"weight_kg","min":0,"max":81}', 'blocks', 'eligibility.judo.weight'),
       ($1, 2, 'attribute_in', '{"attribute":"belt_rank","codes":["2dan","3dan","4dan","5dan"]}', 'blocks', 'eligibility.judo.minimum_belt'),
       ($1, 3, 'licence_valid', '{"attribute":"federation_licence"}', 'blocks', 'eligibility.judo.federation_licence')`,
    [RULE_VERSION],
  );
  await pool.query(
    `INSERT INTO core.sport_entry_product
       (id, event_id, sport_id, name, participant_type, rule_set_id, requires_evidence)
     VALUES ($1, $2, $3, 'Men’s −81 kg', 'individual', $4, true)`,
    [PRODUCT, EVENT, SPORT, RULE_SET],
  );
  await pool.query(
    `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
     VALUES ($1, 'reviewer.a@example.com', 'Reviewer', 'A', '1980-01-01'),
            ($2, 'reviewer.b@example.com', 'Reviewer', 'B', '1980-01-01')`,
    [REVIEWER_A, REVIEWER_B],
  );
  await addAthlete(PASSING, 'Passing');
  await addAthlete(WEIGHT_FAIL, 'Weight');
  await addAthlete(BELT_FAIL, 'Belt');
  await addAthlete(LICENCE_FAIL, 'Licence');
  await addAthlete(OTHER, 'Other');

  for (const personId of [PASSING, WEIGHT_FAIL, BELT_FAIL, LICENCE_FAIL]) {
    await fact({ personId, attribute: 'weight_kg', numericValue: personId === WEIGHT_FAIL ? 81.5 : 80.4 });
    await fact({ personId, attribute: 'belt_rank', textValue: personId === BELT_FAIL ? '2kyu' : '2dan' });
    await fact({
      personId,
      attribute: 'federation_licence',
      textValue: 'active',
      validUntil: personId === LICENCE_FAIL ? '2027-12-30' : '2028-01-01',
    });
  }
}

beforeAll(async () => {
  await seed();
  app = await NestFactory.create(JudoExceptionTestModule, { logger: false });
  configureApp(app);
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  if (app) await app.close();
});

describe('A4 Judo refusal and exception path', () => {
  it('refuses escalation of a fully eligible entry', async () => {
    const passing = fake.issueToken({ personId: PASSING, roles: ['participant'] });
    const response = await api(`/v1/registration-entries/${ENTRIES.get(PASSING)}/exceptions`, {
      method: 'POST',
      headers: headers(passing, 'passing-not-blocked'),
      body: '{}',
    });
    expect(response.status).toBe(422);
    expect((await response.json() as { code: string }).code).toBe('ENTRY_NOT_BLOCKED');
  });

  it.each([
    [WEIGHT_FAIL, 'eligibility.judo.weight'],
    [BELT_FAIL, 'eligibility.judo.minimum_belt'],
    [LICENCE_FAIL, 'eligibility.judo.federation_licence'],
  ])('uses the current verified facts to expose %s as %s', async (personId, expectedReason) => {
    const participant = fake.issueToken({ personId, roles: ['participant'] });
    const response = await api(`/v1/registration-entries/${ENTRIES.get(personId)}/exceptions`, {
      method: 'POST',
      headers: headers(participant),
      body: '{}',
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; checks: Array<{ label: string }> };
    expect(body.checks.map((check) => check.label)).toContain(expectedReason);
  });

  it('hides other athletes, de-duplicates the same live refusal, and takes two OC approvals', async () => {
    const owner = fake.issueToken({ personId: WEIGHT_FAIL, roles: ['participant'] });
    const other = fake.issueToken({ personId: OTHER, roles: ['participant'] });
    const entryId = ENTRIES.get(WEIGHT_FAIL)!;

    const hidden = await api(`/v1/registration-entries/${entryId}/exceptions`, {
      method: 'POST',
      headers: headers(other, 'other-athlete'),
      body: '{}',
    });
    expect(hidden.status).toBe(404);

    const first = await api(`/v1/registration-entries/${entryId}/exceptions`, {
      method: 'POST',
      headers: headers(owner, 'weight-first'),
      body: '{}',
    });
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { id: string; decision: string };

    const replay = await api(`/v1/registration-entries/${entryId}/exceptions`, {
      method: 'POST',
      headers: headers(owner, 'weight-second-key'),
      body: '{}',
    });
    expect(replay.status).toBe(201);
    expect((await replay.json() as { id: string }).id).toBe(firstBody.id);

    const ocA = fake.issueToken({ personId: REVIEWER_A, roles: ['oc_staff'] });
    const queue = await api('/v1/exceptions', { headers: { authorization: `Bearer ${ocA}` } });
    expect(queue.status).toBe(200);
    expect((await queue.json() as { cases: Array<{ id: string }> }).cases.map((item) => item.id)).toContain(firstBody.id);

    const one = await api(`/v1/exceptions/${firstBody.id}/approve`, {
      method: 'POST',
      headers: headers(ocA, 'reviewer-a'),
      body: '{}',
    });
    expect((await one.json() as { decision: string; approvers: string[] })).toMatchObject({
      decision: 'pending',
      approvers: ['Reviewer A'],
    });

    const ocB = fake.issueToken({ personId: REVIEWER_B, roles: ['oc_staff'] });
    const two = await api(`/v1/exceptions/${firstBody.id}/approve`, {
      method: 'POST',
      headers: headers(ocB, 'reviewer-b'),
      body: '{}',
    });
    expect((await two.json() as { decision: string; approvers: string[] })).toMatchObject({
      decision: 'approved',
      approvers: ['Reviewer A', 'Reviewer B'],
    });
  });
});
