/**
 * `POST /v1/me/entries` — starting a registration.
 *
 * Until this endpoint existed nothing outside the seed inserted a registration entry, so a real
 * sign-up could not register and the app edited one demo athlete's entry for everybody. These
 * tests pin the refusals that make "anyone can start an entry" safe: one live entry per product,
 * no placeholder profiles, no missing consents, no closed events, and the athlete is always the
 * token's person.
 */

import { INestApplication, Module } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
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
import { PostgresRegistrationJourneyRepository } from '../src/registration/postgres-registration-journey.repository';
import { RegistrationMutations } from '../src/registration/registration-mutations';
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
class CreateEntryTestModule {}

let pool: Pool;
let mutations: RegistrationMutations;
let app: INestApplication;
let baseUrl: string;

const EVENT = randomUUID();
const CLOSED_EVENT = randomUUID();
const SPORT = randomUUID();
const CLOSED_SPORT = randomUUID();
const RULE_SET = randomUUID();
const RULE_VERSION = randomUUID();
const PRODUCT = randomUUID();
const EVIDENCE_PRODUCT = randomUUID();
const CLOSED_PRODUCT = randomUUID();
const POOL_ID = randomUUID();
const TAX = randomUUID();

const create = (actorId: string, productId = PRODUCT, key = randomUUID()) =>
  mutations.createEntry({
    sportEntryProductId: productId,
    grade: 'competitive',
    idempotencyKey: key,
    actorId,
    scope: actorId,
  });

async function athlete(opts: {
  dob?: string;
  profileStatus?: 'complete' | 'placeholder';
  consents?: string[];
}): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth, profile_status)
     VALUES ($1, $2, 'Test', 'Athlete', $3, $4)`,
    [id, `${id}@example.com`, opts.dob ?? '1985-06-01', opts.profileStatus ?? 'complete'],
  );
  for (const kind of opts.consents ?? [
    'terms_and_conditions',
    'privacy_policy',
    'eligibility_medical_evidence',
  ]) {
    await pool.query(
      `INSERT INTO core.consent (person_id, event_id, kind, granted, version, source)
       VALUES ($1, $2, $3, true, 'v1', 'participant')`,
      [id, EVENT, kind],
    );
  }
  return id;
}

beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL as string, max: 8 });
  mutations = new RegistrationMutations(pool);

  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date, status)
     VALUES ($1, $2, 'Create Entry', '2027-09-17', '2027-09-26', '2027-12-31', 'registration_open'),
            ($3, $4, 'Closed Event', '2027-09-17', '2027-09-26', '2027-12-31', 'planned')`,
    [EVENT, `create-${EVENT}`, CLOSED_EVENT, `closed-${CLOSED_EVENT}`],
  );
  await pool.query(
    `INSERT INTO core.sport (id, event_id, code, name) VALUES ($1, $2, $3, 'Create Swim'),
            ($4, $5, $6, 'Closed Swim')`,
    [
      SPORT,
      EVENT,
      `cs-${EVENT.slice(0, 8)}`,
      CLOSED_SPORT,
      CLOSED_EVENT,
      `cl-${EVENT.slice(0, 8)}`,
    ],
  );
  await pool.query(`INSERT INTO core.rule_set (id, event_id, sport_code) VALUES ($1, $2, $3)`, [
    RULE_SET,
    EVENT,
    `cs-${EVENT.slice(0, 8)}`,
  ]);
  await pool.query(
    `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status)
     VALUES ($1, $2, 1, '2027-12-31', tstzrange('2026-01-01', NULL), 'draft')`,
    [RULE_VERSION, RULE_SET],
  );
  await pool.query(
    `INSERT INTO core.rule_dimension
       (rule_version_id, ordinal, attribute, aggregation, exclude_roles, rounding, value_scale, band_kind, bands)
     VALUES ($1, 1, 'age', 'self', '{}', 'floor', 0, 'range',
       '[{"id":"b35","name":"35–39","min":35,"max":39},
         {"id":"b40","name":"40–44","min":40,"max":44}]'::jsonb)`,
    [RULE_VERSION],
  );
  await pool.query(
    `INSERT INTO core.tax_rule (id, event_id, name, rate_bp, rounding, basis, effective, status)
     VALUES ($1, $2, 'IVA 22', 2200, 'half_up', 'inclusive', tstzrange('2026-01-01', NULL), 'active')`,
    [TAX, EVENT],
  );
  for (const [id, evidence] of [
    [PRODUCT, false],
    [EVIDENCE_PRODUCT, true],
  ] as const) {
    await pool.query(
      `INSERT INTO core.sport_entry_product
         (id, event_id, sport_id, name, participant_type, rule_set_id, requires_evidence)
       VALUES ($1, $2, $3, $4, 'individual', $5, $6)`,
      [id, EVENT, SPORT, evidence ? 'Evidence 100m' : '100m', RULE_SET, evidence],
    );
    if (evidence) {
      // A product flag alone no longer gates an entry: there must be a requirement to satisfy,
      // or the athlete waits in pending_evidence for something that does not exist.
      const set = randomUUID();
      const version = randomUUID();
      await pool.query(
        `INSERT INTO core.evidence_requirement_set (id, event_id, code, document_kind, classification)
         VALUES ($1, $2, 'identity_document', 'identity_document', 'ordinary')`,
        [set, EVENT],
      );
      await pool.query(
        `INSERT INTO core.evidence_requirement_version
           (id, requirement_set_id, version_no, status, effective, requiredness, valid_through, message_key)
         VALUES ($1, $2, 1, 'draft', tstzrange('2026-01-01', NULL), 'required', 'games_day',
                 'evidence.identity.required')`,
        [version, set],
      );
      await pool.query(
        `INSERT INTO core.evidence_requirement_applicability (requirement_version_id, sport_entry_product_id)
         VALUES ($1, $2)`,
        [version, id],
      );
      await pool.query(
        `UPDATE core.evidence_requirement_version SET status = 'active', published_at = now() WHERE id = $1`,
        [version],
      );
    }

    await pool.query(
      `INSERT INTO core.fee (event_id, sport_entry_product_id, grade, currency, base_amount_minor, effective)
       VALUES ($1, $2, 'competitive', 'EUR', 6500, tstzrange('2026-01-01', NULL))`,
      [EVENT, id],
    );
  }
  await pool.query(
    `INSERT INTO core.quota_pool (id, event_id, name, scope_kind, scope_ref, capacity)
     VALUES ($1, $2, '100m places', 'product', $3, 50)`,
    [POOL_ID, EVENT, PRODUCT],
  );
  await pool.query(
    `INSERT INTO core.sport_entry_product (id, event_id, sport_id, name, participant_type, rule_set_id)
     VALUES ($1, $2, $3, 'Closed 100m', 'individual', $4)`,
    [CLOSED_PRODUCT, CLOSED_EVENT, CLOSED_SPORT, RULE_SET],
  );

  app = await NestFactory.create(CreateEntryTestModule, { logger: false });
  configureApp(app);
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  if (app) await app.close();
  await pool.end();
});

describe('starting a registration', () => {
  it('creates a draft for the caller with the category pinned and a creation event', async () => {
    const person = await athlete({ dob: '1985-06-01' }); // 42 on 31 Dec 2027
    const entry = await create(person);

    expect(entry.status).toBe('draft');
    expect(entry.originalCategoryName).toBe('40–44');
    expect(entry.currentCategoryName).toBe('40–44');
    expect(entry.ruleVersion).toBe(RULE_VERSION);
    expect(entry.statusHistory).toEqual([
      expect.objectContaining({
        status: 'draft',
        actor: 'participant',
        reason: 'registration.created',
      }),
    ]);

    const owner = await pool.query<{ person_id: string }>(
      `SELECT ap.person_id FROM core.registration_entry e
         JOIN core.athlete_profile ap ON ap.id = e.athlete_profile_id WHERE e.id = $1`,
      [entry.id],
    );
    expect(owner.rows[0]?.person_id).toBe(person);
  });

  it('is readable as a journey straight away — the app opens it by the id it got back', async () => {
    const person = await athlete({});
    const entry = await create(person);
    const journey = await new PostgresRegistrationJourneyRepository(pool).getJourney({
      registrationEntryId: entry.id,
      eventId: EVENT,
      athleteId: person,
    });
    expect(journey.entry.id).toBe(entry.id);
    expect(journey.entry.status).toBe('draft');
  });

  it('continues through the existing submit path — one route to payment, not two', async () => {
    const person = await athlete({});
    const entry = await create(person);
    const decision = await mutations.saveEntry({
      registrationEntryId: entry.id,
      sportEntryProductId: PRODUCT,
      grade: 'competitive',
      idempotencyKey: randomUUID(),
      actorId: person,
      scope: person,
    });
    expect(decision.entry.status).toBe('pending_payment');
    expect(decision.nextStep).toBe('checkout');
  });

  it('refuses a second live entry for the same product and says which one exists', async () => {
    const person = await athlete({});
    const first = await create(person);
    await expect(create(person)).rejects.toMatchObject({
      code: 'DUPLICATE_ENTRY',
      fields: { entryId: first.id },
    });
  });

  it('lets two tabs race and still leaves exactly one entry', async () => {
    const person = await athlete({});
    const outcomes = await Promise.allSettled([create(person), create(person)]);
    const rows = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM core.registration_entry e
         JOIN core.athlete_profile ap ON ap.id = e.athlete_profile_id
        WHERE ap.person_id = $1`,
      [person],
    );
    expect(rows.rows[0]?.n).toBe(1);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
  });

  it('replays a retried request instead of creating a second entry', async () => {
    const person = await athlete({});
    const key = randomUUID();
    const first = await create(person, PRODUCT, key);
    const again = await create(person, PRODUCT, key);
    expect(again.id).toBe(first.id);
  });

  it('refuses a placeholder profile', async () => {
    const person = await athlete({ profileStatus: 'placeholder' });
    await expect(create(person)).rejects.toMatchObject({ code: 'PROFILE_INCOMPLETE' });
  });

  it('refuses while a required consent is missing, and names it', async () => {
    const person = await athlete({ consents: ['terms_and_conditions'] });
    await expect(create(person)).rejects.toMatchObject({
      code: 'CONSENT_REQUIRED',
      fields: { consents: 'privacy_policy,eligibility_medical_evidence' },
    });
  });

  it('refuses an event that is not open for registration', async () => {
    const person = await athlete({});
    await expect(create(person, CLOSED_PRODUCT)).rejects.toMatchObject({
      code: 'EVENT_UNAVAILABLE',
    });
  });

  it('refuses an athlete whose age falls in no band, and writes nothing', async () => {
    const person = await athlete({ dob: '1995-01-01' }); // 32 — below every band
    await expect(create(person)).rejects.toMatchObject({ code: 'CATEGORY_NOT_ELIGIBLE' });
    const rows = await pool.query(`SELECT 1 FROM core.athlete_profile WHERE person_id = $1`, [
      person,
    ]);
    expect(rows.rows).toHaveLength(0);
  });
});

describe('over HTTP', () => {
  it("creates for the token's person and ignores any athlete id in the body", async () => {
    const person = await athlete({});
    const someoneElse = await athlete({});
    const token = fake.issueToken({ personId: person, roles: ['participant'] });
    const response = await fetch(`${baseUrl}/v1/me/entries`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({
        sportEntryProductId: EVIDENCE_PRODUCT,
        grade: 'competitive',
        athleteId: someoneElse,
      }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; evidenceStatus: string };
    expect(body.evidenceStatus).toBe('required');
    const owner = await pool.query<{ person_id: string }>(
      `SELECT ap.person_id FROM core.registration_entry e
         JOIN core.athlete_profile ap ON ap.id = e.athlete_profile_id WHERE e.id = $1`,
      [body.id],
    );
    expect(owner.rows[0]?.person_id).toBe(person);
  });

  it('refuses a caller without the participant role', async () => {
    const person = await athlete({});
    const token = fake.issueToken({ personId: person, roles: ['oc_staff'] });
    const response = await fetch(`${baseUrl}/v1/me/entries`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({ sportEntryProductId: PRODUCT, grade: 'competitive' }),
    });
    expect(response.status).toBe(403);
  });

  it('returns 409 for a duplicate', async () => {
    const person = await athlete({});
    await create(person);
    const token = fake.issueToken({ personId: person, roles: ['participant'] });
    const response = await fetch(`${baseUrl}/v1/me/entries`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({ sportEntryProductId: PRODUCT, grade: 'competitive' }),
    });
    expect(response.status).toBe(409);
  });
});
