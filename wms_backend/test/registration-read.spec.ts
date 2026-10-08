/**
 * Registration read routes over HTTP. The repository test covers the SQL;
 * this one covers the controller wiring — where athleteId can go missing.
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
import { RegistrationModule } from '../src/registration/registration.module';
import { testRestrictedPool } from './db-url';
import { assertJourneySnapshotShape } from './journey-snapshot';

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
class RegistrationReadTestModule {}

let app: INestApplication;
let baseUrl: string;

const EVENT = randomUUID();
const SPORT = randomUUID();
const RULE_SET = randomUUID();
const RULE_VERSION = randomUUID();
const PRODUCT = randomUUID();
const ALICE = randomUUID();
const BOB = randomUUID();
const OC_ADMIN = randomUUID();
const ALICE_PROFILE = randomUUID();
const BOB_PROFILE = randomUUID();
const ALICE_ENTRY = randomUUID();
const ORDINARY_REQ = randomUUID();
const ORDINARY_OBLIGATION = randomUUID();
const ORDINARY_S3 = 's3://ordinary/alice-passport.pdf';
const LEAK_CLASS = 'S9LEAKTEST';
const LEAK_PASSPORT = 'LEAKPASSPORT99';
const MISSING_ENTRY = randomUUID();

function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function seedGraph(): Promise<void> {
  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1,$2,'Reg HTTP','2027-09-17','2027-09-26','2027-12-31')`,
    [EVENT, `reg-http-${EVENT}`],
  );
  await pool.query(`INSERT INTO core.sport (id, event_id, code, name) VALUES ($1,$2,'tennis','Tennis')`, [
    SPORT,
    EVENT,
  ]);
  await pool.query(`INSERT INTO core.rule_set (id, event_id, sport_code) VALUES ($1,$2,'tennis')`, [
    RULE_SET,
    EVENT,
  ]);
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

  for (const [person, profile, name, email] of [
    [ALICE, ALICE_PROFILE, 'Alice', `alice.${ALICE}@example.com`],
    [BOB, BOB_PROFILE, 'Bob', `bob.${BOB}@example.com`],
  ] as const) {
    await pool.query(
      `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
       VALUES ($1,$2,$3,'Test','1985-04-02')`,
      [person, email, name],
    );
    await pool.query(`INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1,$2,$3)`, [
      profile,
      person,
      EVENT,
    ]);
  }

  await pool.query(
    `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
     VALUES ($1,$2,'Oc','Admin','1970-01-01')`,
    [OC_ADMIN, `oc.${OC_ADMIN}@example.com`],
  );

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
  const poolId = randomUUID();
  await pool.query(
    `INSERT INTO core.quota_pool (id, event_id, name, scope_kind, scope_ref, capacity)
     VALUES ($1,$2,'Tennis singles','product',$3,60)`,
    [poolId, EVENT, PRODUCT],
  );
  await pool.query(
    `INSERT INTO core.entry_quota_consumption (entry_id, quota_pool_id, units, state)
     VALUES ($1,$2,1,'reserved')`,
    [ALICE_ENTRY, poolId],
  );

  await pool.query(
    `INSERT INTO core.evidence_requirement_set
       (id, event_id, code, document_kind, classification)
     VALUES ($1,$2,'identity_photo','identity_document','ordinary')`,
    [ORDINARY_REQ, EVENT],
  );
  await pool.query(
    `INSERT INTO core.evidence_obligation (id, event_id, person_id, requirement_set_id)
     VALUES ($1,$2,$3,$4)`,
    [ORDINARY_OBLIGATION, EVENT, ALICE, ORDINARY_REQ],
  );
  await pool.query(
    `INSERT INTO core.evidence_obligation_application (obligation_id, entry_id) VALUES ($1,$2)`,
    [ORDINARY_OBLIGATION, ALICE_ENTRY],
  );
  await pool.query(
    `INSERT INTO core.evidence_upload (obligation_id, version_no, s3_key, mime_type)
     VALUES ($1,1,$2,'application/pdf')`,
    [ORDINARY_OBLIGATION, ORDINARY_S3],
  );

  const consent = randomUUID();
  const notice = randomUUID();
  const paraSet = randomUUID();
  const paraDoc = randomUUID();
  const paraRef = randomUUID();
  const paraFact = randomUUID();
  const passport = randomUUID();

  await pool.query(
    `INSERT INTO core.consent (id, person_id, event_id, kind, granted, version, source)
     VALUES ($1,$2,$3,'eligibility_medical_evidence', true, 'Sensitive v1', 'participant')`,
    [consent, ALICE, EVENT],
  );
  await pool.query(
    `INSERT INTO core.privacy_notice (id, event_id, code, version_no, status, message_key, approved_by, approved_at)
     VALUES ($1,$2,'sensitive_processing',1,'draft','privacy.notice.sensitive',$3,now())`,
    [notice, EVENT, OC_ADMIN],
  );
  await pool.query(`UPDATE core.privacy_notice SET status = 'approved', approved_at = now() WHERE id = $1`, [
    notice,
  ]);
  await pool.query(
    `INSERT INTO core.evidence_requirement_set
       (id, event_id, code, document_kind, classification)
     VALUES ($1,$2,'para_class','para_classification','restricted')`,
    [paraSet, EVENT],
  );
  await testRestrictedPool().query(
    `INSERT INTO restricted.evidence_document
       (id, event_id, person_id, kind, requirement_set_id, lawful_basis, retain_until, consent_id, notice_id)
     VALUES ($1,$2,$3,'para_classification',$4,'explicit_consent','2028-12-31',$5,$6)`,
    [paraDoc, EVENT, ALICE, paraSet, consent, notice],
  );
  await pool.query(
    `INSERT INTO core.protected_evidence_ref
       (id, person_id, event_id, kind, restricted_record_id)
     VALUES ($1,$2,$3,'para_classification',$4)`,
    [paraRef, ALICE, EVENT, paraDoc],
  );
  await testRestrictedPool().query(
    `INSERT INTO restricted.classification_fact
       (id, event_id, person_id, sport_code, class_code, verification_status,
        supporting_document_id, protected_evidence_id, consent_id, notice_id,
        lawful_basis, retain_until)
     VALUES ($1,$2,$3,'tennis',$4,'verified',$5,$6,$7,$8,'explicit_consent','2028-12-31')`,
    [paraFact, EVENT, ALICE, LEAK_CLASS, paraDoc, paraRef, consent, notice],
  );
  await testRestrictedPool().query(
    `INSERT INTO restricted.identity_document
       (id, person_id, kind, document_number, lawful_basis, retain_until)
     VALUES ($1,$2,'passport',$3,'contract','2020-01-01')`,
    [passport, ALICE, LEAK_PASSPORT],
  );
}

beforeAll(async () => {
  await seedGraph();
  app = await NestFactory.create(RegistrationReadTestModule, { logger: false });
  configureApp(app);
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app.close();
});

describe('GET /v1/registration-journeys/:entryId', () => {
  it('returns the caller\'s own entry and 404s for someone else\'s with the same body as missing', async () => {
    const alice = fake.issueToken({ personId: ALICE, roles: ['participant'] });
    const bob = fake.issueToken({ personId: BOB, roles: ['participant'] });

    const own = await api(`/v1/registration-journeys/${ALICE_ENTRY}?eventId=${EVENT}`, {
      headers: bearer(alice),
    });
    expect(own.status).toBe(200);
    const body = await own.json();
    assertJourneySnapshotShape(body, {
      entryId: ALICE_ENTRY,
      athleteId: ALICE_PROFILE,
      eventId: EVENT,
      sportId: SPORT,
      productId: PRODUCT,
    });

    const stranger = await api(`/v1/registration-journeys/${ALICE_ENTRY}?eventId=${EVENT}`, {
      headers: bearer(bob),
    });
    const missing = await api(`/v1/registration-journeys/${MISSING_ENTRY}?eventId=${EVENT}`, {
      headers: bearer(bob),
    });
    expect(stranger.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(stranger.headers.get('content-type')).toContain('application/problem+json');
    const strangerBody = (await stranger.json()) as { code: string; detail: string };
    const missingBody = (await missing.json()) as { code: string; detail: string };
    expect(strangerBody.code).toBe('REGISTRATION_ENTRY_NOT_FOUND');
    expect(missingBody.code).toBe('REGISTRATION_ENTRY_NOT_FOUND');
    expect(strangerBody.detail).toBe(missingBody.detail);
    expect(strangerBody.code).toBe(missingBody.code);
  });

  it('ignores ?athleteId= of someone else and still returns the caller\'s entry', async () => {
    const alice = fake.issueToken({ personId: ALICE, roles: ['participant'] });
    const res = await api(
      `/v1/registration-journeys/${ALICE_ENTRY}?eventId=${EVENT}&athleteId=${BOB}`,
      { headers: bearer(alice) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    assertJourneySnapshotShape(body, {
      entryId: ALICE_ENTRY,
      athleteId: ALICE_PROFILE,
      eventId: EVENT,
      sportId: SPORT,
      productId: PRODUCT,
    });
  });
});

describe('GET /v1/registration-entries/:entryId', () => {
  it('lets an OC role read any entry and refuses a participant token', async () => {
    const oc = fake.issueToken({ personId: OC_ADMIN, roles: ['oc_admin'] });
    const alice = fake.issueToken({ personId: ALICE, roles: ['participant'] });

    const allowed = await api(`/v1/registration-entries/${ALICE_ENTRY}`, { headers: bearer(oc) });
    expect(allowed.status).toBe(200);
    const entry = (await allowed.json()) as { id: string };
    expect(entry.id).toBe(ALICE_ENTRY);

    const refused = await api(`/v1/registration-entries/${ALICE_ENTRY}`, { headers: bearer(alice) });
    expect(refused.status).toBe(403);
  });
});

describe('GET /v1/registration-entries/:entryId/exports/participant-safe', () => {
  it('omits restricted fields even when they exist for this athlete', async () => {
    const alice = fake.issueToken({ personId: ALICE, roles: ['participant'] });
    const res = await api(`/v1/registration-entries/${ALICE_ENTRY}/exports/participant-safe`, {
      headers: bearer(alice),
    });
    expect(res.status).toBe(200);
    const payload = (await res.json()) as {
      export: {
        privacyProfile: string;
        ordinaryEvidence: { items: Array<Record<string, unknown>>; total: number };
        exclusions: { restrictedEvidence: boolean; excludedFieldGroups: string[] };
        medical?: unknown;
        paraClassification?: unknown;
        restrictedFiles?: unknown;
        restrictedAccessLogs?: unknown;
        class_code?: unknown;
        document_number?: unknown;
      };
    };

    expect(payload.export.privacyProfile).toBe('participant-safe');
    expect(payload.export.exclusions.restrictedEvidence).toBe(true);
    expect(payload.export).not.toHaveProperty('medical');
    expect(payload.export).not.toHaveProperty('paraClassification');
    expect(payload.export).not.toHaveProperty('restrictedFiles');
    expect(payload.export).not.toHaveProperty('restrictedAccessLogs');
    expect(payload.export).not.toHaveProperty('class_code');
    expect(payload.export).not.toHaveProperty('document_number');

    const dumped = JSON.stringify(payload);
    expect(dumped).not.toContain(LEAK_CLASS);
    expect(dumped).not.toContain(LEAK_PASSPORT);
    expect(dumped).not.toContain(ORDINARY_S3);

    expect(payload.export.ordinaryEvidence.total).toBe(1);
    expect(payload.export.ordinaryEvidence.items[0]).toEqual({
      id: ORDINARY_OBLIGATION,
      type: 'identity_document',
      status: 'uploaded',
    });
    expect(Object.keys(payload.export.ordinaryEvidence.items[0]!).sort()).toEqual([
      'id',
      'status',
      'type',
    ]);
  });
});
