/**
 * Evidence documents on the real database. Ordinary rows live in core;
 * restricted reads use restricted_rw and never join across the boundary.
 */
import { INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { selectFact } from '@wms/domain';
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
import { EvidenceModule } from '../src/evidence/evidence.module';
import { runRestricted } from '../src/evidence/restricted-session';
import { loadFacts } from '../src/rules/load';
import { databaseUrlAs, LOCAL_APP_RW_PASSWORD, testRestrictedPool } from './db-url';

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
  imports: [EvidenceModule],
  providers: [
    { provide: IDENTITY_PROVIDER, useValue: fake },
    AuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
})
class EvidenceTestModule {}

let app: INestApplication;
let baseUrl: string;

const EVENT = randomUUID();
const SPORT = randomUUID();
const RULE_SET = randomUUID();
const RULE_VERSION = randomUUID();
const PRODUCT = randomUUID();
const ALICE = randomUUID();
const BOB = randomUUID();
const OC = randomUUID();
const ALICE_PROFILE = randomUUID();
const BOB_PROFILE = randomUUID();
const ALICE_ENTRY = randomUUID();
const BOB_ENTRY = randomUUID();
const ORDINARY_SET = randomUUID();
const ORDINARY_VER = randomUUID();
const PARA_SET = randomUUID();
const PARA_VER = randomUUID();

function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

function mutationHeaders(token: string, key = randomUUID()): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'idempotency-key': key };
}

const asApp = async (sql: string, params: unknown[] = []) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE app_rw');
    return await client.query(sql, params);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
};

async function seedGraph(): Promise<void> {
  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1, 'como-evidence', 'Como Lake 2027', '2027-09-17', '2027-09-26', '2027-12-31')`,
    [EVENT],
  );
  await pool.query(
    `INSERT INTO core.sport (id, event_id, code, name) VALUES ($1, $2, 'para_swimming', 'Para swimming')`,
    [SPORT, EVENT],
  );
  await pool.query(
    `INSERT INTO core.rule_set (id, event_id, sport_code) VALUES ($1, $2, 'para_swimming')`,
    [RULE_SET, EVENT],
  );
  await pool.query(
    `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status)
     VALUES ($1, $2, 1, '2027-12-31', tstzrange(now(), NULL), 'draft')`,
    [RULE_VERSION, RULE_SET],
  );
  await pool.query(
    `INSERT INTO core.sport_entry_product
       (id, event_id, sport_id, name, participant_type, rule_set_id, requires_evidence)
     VALUES ($1, $2, $3, 'Para 100 free', 'individual', $4, true)`,
    [PRODUCT, EVENT, SPORT, RULE_SET],
  );
  await pool.query(
    `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
     VALUES ($1, $2, 'Alice', 'Entrant', '1990-01-01'),
            ($3, $4, 'Bob', 'Other', '1991-02-02'),
            ($5, $6, 'Oc', 'Reviewer', '1970-01-01')`,
    [
      ALICE,
      `alice.${ALICE}@example.com`,
      BOB,
      `bob.${BOB}@example.com`,
      OC,
      `oc.${OC}@example.com`,
    ],
  );
  await pool.query(
    `INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1, $2, $3), ($4, $5, $3)`,
    [ALICE_PROFILE, ALICE, EVENT, BOB_PROFILE, BOB],
  );
  await pool.query(
    `INSERT INTO core.registration_entry
       (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id, status)
     VALUES ($1, $2, $3, $4, 'competitive', $5, 'draft'),
            ($6, $2, $7, $4, 'competitive', $5, 'draft')`,
    [ALICE_ENTRY, EVENT, ALICE_PROFILE, PRODUCT, RULE_VERSION, BOB_ENTRY, BOB_PROFILE],
  );

  await pool.query(
    `INSERT INTO core.evidence_requirement_set
       (id, event_id, code, document_kind, classification)
     VALUES ($1, $2, 'identity_document', 'identity_document', 'ordinary'),
            ($3, $2, 'para_class', 'para_classification', 'restricted')`,
    [ORDINARY_SET, EVENT, PARA_SET],
  );
  await pool.query(
    `INSERT INTO core.evidence_requirement_version
       (id, requirement_set_id, version_no, status, effective, requiredness, valid_through,
        accepted_mime_types, message_key)
     VALUES ($1, $2, 1, 'draft', tstzrange(now(), NULL), 'required', 'games_day',
             '{application/pdf}', 'evidence.identity.required'),
            ($3, $4, 1, 'draft', tstzrange(now(), NULL), 'required', 'stated_expiry',
             '{application/pdf}', 'evidence.para_class.required')`,
    [ORDINARY_VER, ORDINARY_SET, PARA_VER, PARA_SET],
  );
  await pool.query(
    `INSERT INTO core.evidence_requirement_applicability (requirement_version_id, sport_id)
     VALUES ($1, $2), ($3, $2)`,
    [ORDINARY_VER, SPORT, PARA_VER],
  );
  await pool.query(
    `UPDATE core.evidence_requirement_version SET status = 'active', published_at = now()
      WHERE id IN ($1, $2)`,
    [ORDINARY_VER, PARA_VER],
  );
}

async function boot(): Promise<void> {
  app = await NestFactory.create(EvidenceTestModule, { logger: false });
  configureApp(app);
  await app.listen(0);
  baseUrl = await app.getUrl();
}

beforeAll(async () => {
  await seedGraph();
  await boot();
});

afterAll(async () => {
  await app.close();
});

describe('ordinary evidence isolation', () => {
  it("a participant cannot read another participant's evidence — asserted in SQL", async () => {
    const alice = fake.issueToken({ personId: ALICE, roles: ['participant'] });
    const bob = fake.issueToken({ personId: BOB, roles: ['participant'] });

    const own = await api(
      `/v1/registration-entries/${ALICE_ENTRY}/evidence?sportEntryProductId=${PRODUCT}`,
      { headers: { authorization: `Bearer ${alice}` } },
    );
    expect(own.status).toBe(200);
    const ownBody = (await own.json()) as {
      items: Array<{ id: string; athleteId: string }>;
      total: number;
    };
    expect(ownBody.total).toBeGreaterThan(0);
    expect(ownBody.items.every((item) => item.athleteId === ALICE)).toBe(true);

    const obligationIds = ownBody.items.map((item) => item.id);
    const asBob = await pool.query<{ id: string; person_id: string }>(
      `SELECT o.id, o.person_id
         FROM core.evidence_obligation o
         JOIN core.evidence_obligation_application a ON a.obligation_id = o.id
        WHERE a.entry_id = $1
          AND o.person_id = $2`,
      [ALICE_ENTRY, BOB],
    );
    expect(asBob.rows).toHaveLength(0);

    const asAlice = await pool.query<{ person_id: string }>(
      `SELECT o.person_id
         FROM core.evidence_obligation o
         JOIN core.evidence_obligation_application a ON a.obligation_id = o.id
        WHERE a.entry_id = $1
          AND o.person_id = $2
          AND o.id = ANY($3::uuid[])`,
      [ALICE_ENTRY, ALICE, obligationIds],
    );
    expect(asAlice.rows.length).toBe(obligationIds.length);
    expect(asAlice.rows.every((row) => row.person_id === ALICE)).toBe(true);

    const stranger = await api(
      `/v1/registration-entries/${ALICE_ENTRY}/evidence?sportEntryProductId=${PRODUCT}`,
      { headers: { authorization: `Bearer ${bob}` } },
    );
    const missing = await api(
      `/v1/registration-entries/${randomUUID()}/evidence?sportEntryProductId=${PRODUCT}`,
      { headers: { authorization: `Bearer ${bob}` } },
    );
    expect(stranger.status).toBe(404);
    expect(missing.status).toBe(404);
    const strangerBody = (await stranger.json()) as { code: string; detail: string };
    const missingBody = (await missing.json()) as { code: string; detail: string };
    expect(strangerBody.code).toBe(missingBody.code);
    expect(strangerBody.detail).toBe(missingBody.detail);
  });
});

describe('restricted evidence is a permission boundary', () => {
  it('a restricted read from app_rw is refused by the database', async () => {
    await expect(asApp('SELECT 1 FROM restricted.evidence_document')).rejects.toMatchObject({
      code: '42501',
    });
    await expect(asApp('SELECT 1 FROM restricted.evidence_upload')).rejects.toMatchObject({
      code: '42501',
    });
    await expect(asApp('SELECT 1 FROM restricted.access_log')).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('app_rw cannot SET ROLE restricted_rw', async () => {
    const client = new Client({
      connectionString: databaseUrlAs(
        process.env.DATABASE_URL as string,
        'app_rw',
        LOCAL_APP_RW_PASSWORD,
      ),
    });
    await client.connect();
    try {
      await expect(client.query('SET ROLE restricted_rw')).rejects.toMatchObject({ code: '42501' });
    } finally {
      await client.end();
    }
  });

  it('the restricted pool authenticates as restricted_rw', async () => {
    const restricted = new Pool({
      connectionString: process.env.RESTRICTED_DATABASE_URL,
      max: 1,
    });
    try {
      const who = await runRestricted(restricted, async (tx) => {
        const { rows } = await tx.query<{ current_user: string }>('SELECT current_user');
        return rows[0]?.current_user;
      });
      expect(who).toBe('restricted_rw');
    } finally {
      await restricted.end();
    }
  });

  it('listing restricted evidence as the owner logs access and hides it from the other participant', async () => {
    const alice = fake.issueToken({ personId: ALICE, roles: ['participant'] });
    const bob = fake.issueToken({ personId: BOB, roles: ['participant'] });

    const list = await api(
      `/v1/restricted-evidence?registrationEntryId=${ALICE_ENTRY}&sportEntryProductId=${PRODUCT}`,
      { headers: { authorization: `Bearer ${alice}` } },
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      items: Array<{
        id: string;
        athleteId: string;
        accessLoggedAt?: string;
        accessClassification: string;
      }>;
    };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((item) => item.athleteId === ALICE)).toBe(true);
    expect(body.items.every((item) => item.accessClassification === 'restricted')).toBe(true);
    expect(body.items.every((item) => Boolean(item.accessLoggedAt))).toBe(true);

    const logs = await testRestrictedPool().query<{ n: string; purpose: string }>(
      `SELECT COUNT(*)::text AS n, MIN(purpose) AS purpose FROM restricted.access_log
        WHERE actor_id = $1 AND action = 'view' AND document_id = ANY($2::uuid[])`,
      [ALICE, body.items.map((item) => item.id)],
    );
    expect(Number(logs.rows[0]?.n)).toBeGreaterThan(0);
    expect(logs.rows[0]?.purpose).toBe('GET /v1/restricted-evidence');

    const stranger = await api(
      `/v1/restricted-evidence?registrationEntryId=${ALICE_ENTRY}&sportEntryProductId=${PRODUCT}`,
      { headers: { authorization: `Bearer ${bob}` } },
    );
    expect(stranger.status).toBe(404);

    const asBob = await testRestrictedPool().query<{ id: string }>(
      `SELECT d.id FROM restricted.evidence_document d
         JOIN restricted.evidence_document_application a ON a.document_id = d.id
        WHERE a.entry_id = $1 AND d.person_id = $2`,
      [ALICE_ENTRY, BOB],
    );
    expect(asBob.rows).toHaveLength(0);
  });

  it('a restricted read that throws after the query leaves no orphan and still records access', async () => {
    const alice = fake.issueToken({ personId: ALICE, roles: ['participant'] });
    const listed = await api(
      `/v1/restricted-evidence?registrationEntryId=${ALICE_ENTRY}&sportEntryProductId=${PRODUCT}`,
      { headers: { authorization: `Bearer ${alice}` } },
    );
    const body = (await listed.json()) as { items: Array<{ id: string }> };
    const documentId = body.items[0]?.id;
    expect(documentId).toBeTruthy();

    const restricted = new Pool({
      connectionString: process.env.RESTRICTED_DATABASE_URL,
      max: 1,
    });
    try {
      const before = await restricted.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM restricted.access_log
          WHERE document_id = $1 AND purpose = $2`,
        [documentId, 'test.restricted.throw'],
      );

      await expect(
        runRestricted(restricted, async (tx) => {
          const found = await tx.query<{ id: string }>(
            `SELECT id FROM restricted.evidence_document WHERE id = $1`,
            [documentId],
          );
          expect(found.rows).toHaveLength(1);
          await tx.query(
            `INSERT INTO restricted.access_log (document_id, actor_id, action, purpose)
             VALUES ($1, $2, 'view', $3)`,
            [documentId, ALICE, 'test.restricted.throw'],
          );
          throw new Error('after-read');
        }),
      ).rejects.toThrow('after-read');

      const afterThrow = await restricted.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM restricted.access_log
          WHERE document_id = $1 AND purpose = $2`,
        [documentId, 'test.restricted.throw'],
      );
      expect(afterThrow.rows[0]?.n).toBe(before.rows[0]?.n);

      await runRestricted(restricted, async (tx) => {
        await tx.query(`SELECT id FROM restricted.evidence_document WHERE id = $1`, [documentId]);
        await tx.query(
          `INSERT INTO restricted.access_log (document_id, actor_id, action, purpose)
           VALUES ($1, $2, 'view', $3)`,
          [documentId, ALICE, 'test.restricted.throw'],
        );
      });
      const recorded = await restricted.query<{ n: string; purpose: string }>(
        `SELECT COUNT(*)::text AS n, MIN(purpose) AS purpose
           FROM restricted.access_log
          WHERE document_id = $1 AND purpose = $2`,
        [documentId, 'test.restricted.throw'],
      );
      expect(Number(recorded.rows[0]?.n)).toBe(Number(before.rows[0]?.n) + 1);
      expect(recorded.rows[0]?.purpose).toBe('test.restricted.throw');
    } finally {
      await restricted.end();
    }
  });
});

describe('upload, review, and restart', () => {
  it('approve/reject writes a review row with an actor and a coded reason', async () => {
    const alice = fake.issueToken({ personId: ALICE, roles: ['participant'] });
    const oc = fake.issueToken({ personId: OC, roles: ['oc_staff'] });

    const listed = await api(
      `/v1/registration-entries/${ALICE_ENTRY}/evidence?sportEntryProductId=${PRODUCT}`,
      { headers: { authorization: `Bearer ${alice}` } },
    );
    const ordinary = (await listed.json()) as { items: Array<{ id: string }> };
    const evidenceId = ordinary.items[0]?.id;
    expect(evidenceId).toBeTruthy();

    const uploaded = await api(`/v1/evidence/${evidenceId}/uploads`, {
      method: 'POST',
      headers: mutationHeaders(alice),
      body: JSON.stringify({
        fileName: 'alice-passport.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 2048,
      }),
    });
    expect(uploaded.status).toBe(200);
    const uploadedBody = (await uploaded.json()) as { item: { status: string; fileName?: string } };
    expect(uploadedBody.item.status).toBe('uploaded');
    expect(uploadedBody.item.fileName).toBe('alice-passport.pdf');

    const review = await api(`/v1/evidence/${evidenceId}/review`, {
      method: 'POST',
      headers: mutationHeaders(oc),
    });
    expect(review.status).toBe(200);

    const english = await api(`/v1/evidence/${evidenceId}/decisions`, {
      method: 'POST',
      headers: mutationHeaders(oc),
      body: JSON.stringify({ decision: 'rejected', reason: 'The submitted file is not legible.' }),
    });
    expect(english.status).toBeGreaterThanOrEqual(400);

    const rejected = await api(`/v1/evidence/${evidenceId}/decisions`, {
      method: 'POST',
      headers: mutationHeaders(oc),
      body: JSON.stringify({ decision: 'rejected', reason: 'evidence.rejected.illegible' }),
    });
    expect(rejected.status).toBe(200);
    const rejectedBody = (await rejected.json()) as {
      item: { status: string; rejectionReason?: string };
    };
    expect(rejectedBody.item.status).toBe('rejected');
    expect(rejectedBody.item.rejectionReason).toBe('evidence.rejected.illegible');
    expect(rejectedBody.item.rejectionReason?.includes(' ')).toBe(false);

    const reviews = await pool.query<{
      reviewer_id: string;
      decision: string;
      reason_key: string | null;
    }>(
      `SELECT r.reviewer_id, r.decision, r.reason_key
         FROM core.evidence_review r
         JOIN core.evidence_upload u ON r.upload_id = u.id
        WHERE u.obligation_id = $1
        ORDER BY r.occurred_at`,
      [evidenceId],
    );
    expect(
      reviews.rows.some((row) => row.decision === 'under_review' && row.reviewer_id === OC),
    ).toBe(true);
    expect(
      reviews.rows.some(
        (row) =>
          row.decision === 'rejected' &&
          row.reviewer_id === OC &&
          row.reason_key === 'evidence.rejected.illegible',
      ),
    ).toBe(true);

    const participantDecide = await api(`/v1/evidence/${evidenceId}/decisions`, {
      method: 'POST',
      headers: mutationHeaders(alice),
      body: JSON.stringify({ decision: 'approved' }),
    });
    expect(participantDecide.status).toBe(403);
  });

  it('upload as participant, review as OC, restart, and both rows survive', async () => {
    const alice = fake.issueToken({ personId: ALICE, roles: ['participant'] });
    const oc = fake.issueToken({ personId: OC, roles: ['oc_staff'] });

    const listed = await api(
      `/v1/restricted-evidence?registrationEntryId=${ALICE_ENTRY}&sportEntryProductId=${PRODUCT}`,
      { headers: { authorization: `Bearer ${alice}` } },
    );
    expect(listed.status).toBe(200);
    const listBody = (await listed.json()) as { items: Array<{ id: string; status: string }> };
    const evidenceId = listBody.items[0]?.id;
    expect(evidenceId).toBeTruthy();

    const uploaded = await api(`/v1/restricted-evidence/${evidenceId}/uploads`, {
      method: 'POST',
      headers: mutationHeaders(alice),
      body: JSON.stringify({
        fileName: 'alice-s9.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 4096,
      }),
    });
    expect(uploaded.status).toBe(200);
    expect(((await uploaded.json()) as { item: { status: string } }).item.status).toBe('uploaded');

    const review = await api(`/v1/restricted-evidence/${evidenceId}/review`, {
      method: 'POST',
      headers: mutationHeaders(oc),
    });
    expect(review.status).toBe(200);

    const approved = await api(`/v1/restricted-evidence/${evidenceId}/decisions`, {
      method: 'POST',
      headers: mutationHeaders(oc),
      body: JSON.stringify({ decision: 'approved' }),
    });
    expect(approved.status).toBe(200);
    expect(((await approved.json()) as { item: { status: string } }).item.status).toBe('approved');

    await app.close();
    await boot();

    const after = await api(
      `/v1/restricted-evidence?registrationEntryId=${ALICE_ENTRY}&sportEntryProductId=${PRODUCT}`,
      { headers: { authorization: `Bearer ${alice}` } },
    );
    expect(after.status).toBe(200);
    const afterBody = (await after.json()) as {
      items: Array<{ id: string; status: string; fileName?: string }>;
    };
    const survived = afterBody.items.find((item) => item.id === evidenceId);
    expect(survived?.status).toBe('approved');
    expect(survived?.fileName).toBe('alice-s9.pdf');

    const reviewRows = await testRestrictedPool().query<{ decision: string; reviewer_id: string }>(
      `SELECT r.decision, r.reviewer_id
         FROM restricted.evidence_review r
         JOIN restricted.evidence_upload u ON r.upload_id = u.id
        WHERE u.document_id = $1
        ORDER BY r.occurred_at`,
      [evidenceId],
    );
    expect(
      reviewRows.rows.some((row) => row.decision === 'approved' && row.reviewer_id === OC),
    ).toBe(true);
    expect(
      reviewRows.rows.some((row) => row.decision === 'under_review' && row.reviewer_id === OC),
    ).toBe(true);
  });
});

/**
 * The defect this guards: a reviewer approved the medical certificate and nothing happened to the
 * entry — `evidence_status` stayed as it was, checkout stayed locked, and the athlete was stuck
 * (REV-082). The gate must follow the evidence, and the entry must follow the gate.
 */
describe('an approval opens the entry', () => {
  it('moves the entry to approved and pending_payment when the last required item is approved', async () => {
    // Its own athlete: `uq_entry_live` allows one live entry per person and product.
    const person = randomUUID();
    const profile = randomUUID();
    const entry = randomUUID();
    const oc = fake.issueToken({ personId: OC, roles: ['oc_staff'] });
    await pool.query(
      `INSERT INTO core.person (id, given_name, family_name, date_of_birth, profile_status)
       VALUES ($1, 'Gate', 'Keeper', '1985-01-01', 'complete')`,
      [person],
    );
    await pool.query(
      `INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1,$2,$3)`,
      [profile, person, EVENT],
    );
    const athlete = fake.issueToken({ personId: person, roles: ['participant'] });

    await pool.query(
      `INSERT INTO core.registration_entry
         (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id,
          status, evidence_status)
       VALUES ($1, $2, $3, $4, 'competitive', $5, 'pending_evidence', 'required')`,
      [entry, EVENT, profile, PRODUCT, RULE_VERSION],
    );

    const listed = await api(`/v1/restricted-evidence?registrationEntryId=${entry}`, {
      headers: { authorization: `Bearer ${athlete}` },
    });
    const evidenceId = ((await listed.json()) as { items: Array<{ id: string }> }).items[0]?.id;
    expect(evidenceId).toBeTruthy();

    await api(`/v1/restricted-evidence/${evidenceId}/uploads`, {
      method: 'POST',
      headers: mutationHeaders(athlete),
      body: JSON.stringify({
        fileName: 'gate.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 2048,
      }),
    });

    const uploadedGate = await pool.query<{ evidence_status: string }>(
      `SELECT evidence_status FROM core.registration_entry WHERE id = $1`,
      [entry],
    );
    expect(uploadedGate.rows[0]?.evidence_status).toBe('pending_review');

    await api(`/v1/restricted-evidence/${evidenceId}/review`, {
      method: 'POST',
      headers: mutationHeaders(oc),
    });
    const decided = await api(`/v1/restricted-evidence/${evidenceId}/decisions`, {
      method: 'POST',
      headers: mutationHeaders(oc),
      body: JSON.stringify({ decision: 'approved' }),
    });
    expect(decided.status).toBe(200);

    const after = await pool.query<{ evidence_status: string; status: string }>(
      `SELECT evidence_status, status FROM core.registration_entry WHERE id = $1`,
      [entry],
    );
    expect(after.rows[0]?.evidence_status).toBe('approved');
    // Checkout is what "approved" is for.
    expect(after.rows[0]?.status).toBe('pending_payment');

    const events = await pool.query<{ to_status: string; reason: string | null }>(
      `SELECT to_status, reason FROM core.entry_status_event WHERE entry_id = $1 ORDER BY occurred_at`,
      [entry],
    );
    expect(events.rows.at(-1)).toMatchObject({
      to_status: 'pending_payment',
      reason: 'evidence_approved',
    });
  });
});

describe('Judo ordinary evidence materializes verified facts only after OC approval', () => {
  it('keeps athlete declarations in evidence uploads, then writes all three verified, sport-scoped facts', async () => {
    const judoSport = randomUUID();
    const judoSet = randomUUID();
    const judoVersion = randomUUID();
    const judoProduct = randomUUID();
    const judoEntry = randomUUID();
    const requirements = [
      ['weigh_in', 'weigh_in', { attribute: 'weight_kg', numericValue: 80.4 }],
      ['belt_certificate', 'belt_certificate', { attribute: 'belt_rank', textValue: '2dan' }],
      [
        'federation_licence',
        'federation_licence',
        { attribute: 'federation_licence', textValue: 'active', validUntil: '2028-01-01' },
      ],
    ] as const;
    const alice = fake.issueToken({ personId: ALICE, roles: ['participant'] });
    const oc = fake.issueToken({ personId: OC, roles: ['oc_staff'] });

    await pool.query(
      `INSERT INTO core.sport (id, event_id, code, name) VALUES ($1, $2, 'judo', 'Judo')`,
      [judoSport, EVENT],
    );
    await pool.query(
      `INSERT INTO core.rule_set (id, event_id, sport_code) VALUES ($1, $2, 'judo')`,
      [judoSet, EVENT],
    );
    await pool.query(
      `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status)
       VALUES ($1, $2, 1, '2027-12-31', tstzrange(now(), NULL), 'draft')`,
      [judoVersion, judoSet],
    );
    await pool.query(
      `INSERT INTO core.sport_entry_product
         (id, event_id, sport_id, name, participant_type, rule_set_id, requires_evidence)
       VALUES ($1, $2, $3, 'Men’s −81 kg', 'individual', $4, true)`,
      [judoProduct, EVENT, judoSport, judoSet],
    );
    await pool.query(
      `INSERT INTO core.registration_entry
         (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id, status)
       VALUES ($1, $2, $3, $4, 'competitive', $5, 'draft')`,
      [judoEntry, EVENT, ALICE_PROFILE, judoProduct, judoVersion],
    );

    for (const [code, documentKind] of requirements) {
      const set = randomUUID();
      const version = randomUUID();
      await pool.query(
        `INSERT INTO core.evidence_requirement_set (id, event_id, code, document_kind, classification)
         VALUES ($1, $2, $3, $4, 'ordinary')`,
        [set, EVENT, code, documentKind],
      );
      await pool.query(
        `INSERT INTO core.evidence_requirement_version
           (id, requirement_set_id, version_no, status, effective, requiredness, valid_through,
            accepted_mime_types, message_key)
         VALUES ($1, $2, 1, 'draft', tstzrange(now(), NULL), 'required', 'stated_expiry',
                 '{application/pdf}', $3)`,
        [version, set, `evidence.judo.${code}.required`],
      );
      await pool.query(
        `INSERT INTO core.evidence_requirement_applicability (requirement_version_id, sport_id)
         VALUES ($1, $2)`,
        [version, judoSport],
      );
      await pool.query(
        `UPDATE core.evidence_requirement_version SET status = 'active', published_at = now() WHERE id = $1`,
        [version],
      );
    }

    const list = await api(
      `/v1/registration-entries/${judoEntry}/evidence?sportEntryProductId=${judoProduct}`,
      {
        headers: { authorization: `Bearer ${alice}` },
      },
    );
    expect(list.status).toBe(200);
    const obligations = (await list.json()) as {
      items: Array<{ id: string; type: 'weigh_in' | 'belt_certificate' | 'federation_licence' }>;
    };

    let approvedFacts = 0;
    for (const [, type, declaredAttribute] of requirements) {
      const obligation = obligations.items.find((item) => item.type === type);
      expect(obligation).toBeTruthy();
      const upload = await api(`/v1/evidence/${obligation!.id}/uploads`, {
        method: 'POST',
        headers: mutationHeaders(alice),
        body: JSON.stringify({
          fileName: `${type}.pdf`,
          mimeType: 'application/pdf',
          fileSizeBytes: 2048,
          declaredAttribute,
        }),
      });
      expect(upload.status).toBe(200);

      const beforeApproval = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM core.entrant_attribute
          WHERE event_id = $1 AND person_id = $2 AND sport_code = 'judo'`,
        [EVENT, ALICE],
      );
      expect(Number(beforeApproval.rows[0]?.count)).toBe(approvedFacts);

      expect(
        (
          await api(`/v1/evidence/${obligation!.id}/review`, {
            method: 'POST',
            headers: mutationHeaders(oc),
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await api(`/v1/evidence/${obligation!.id}/decisions`, {
            method: 'POST',
            headers: mutationHeaders(oc),
            body: JSON.stringify({ decision: 'approved' }),
          })
        ).status,
      ).toBe(200);
      approvedFacts += 1;
    }

    const facts = await pool.query<{
      attribute: string;
      numeric_value: string | null;
      text_value: string | null;
      valid_until: string | null;
      status: string;
      verified_by: string | null;
    }>(
      `SELECT attribute, numeric_value::text, text_value, valid_until::text, status, verified_by
         FROM core.entrant_attribute
        WHERE event_id = $1 AND person_id = $2 AND sport_code = 'judo'
        ORDER BY attribute`,
      [EVENT, ALICE],
    );
    expect(facts.rows).toEqual([
      expect.objectContaining({
        attribute: 'belt_rank',
        text_value: '2dan',
        status: 'verified',
        verified_by: OC,
      }),
      expect.objectContaining({
        attribute: 'federation_licence',
        text_value: 'active',
        valid_until: '2028-01-01',
        status: 'verified',
        verified_by: OC,
      }),
      expect.objectContaining({
        attribute: 'weight_kg',
        numeric_value: '80.400',
        status: 'verified',
        verified_by: OC,
      }),
    ]);
  });

  it('re-verifies a belt certificate by superseding the prior fact and making the replacement current', async () => {
    const sport = randomUUID();
    const ruleSet = randomUUID();
    const ruleVersion = randomUUID();
    const product = randomUUID();
    const entry = randomUUID();
    const requirementSet = randomUUID();
    const requirementVersion = randomUUID();
    const previousBeltId = randomUUID();
    const sportCode = `judo-reverify-${sport.slice(0, 8)}`;
    const alice = fake.issueToken({ personId: ALICE, roles: ['participant'] });
    const oc = fake.issueToken({ personId: OC, roles: ['oc_staff'] });

    await pool.query(
      `INSERT INTO core.sport (id, event_id, code, name) VALUES ($1, $2, $3, 'Judo')`,
      [sport, EVENT, sportCode],
    );
    await pool.query(`INSERT INTO core.rule_set (id, event_id, sport_code) VALUES ($1, $2, $3)`, [
      ruleSet,
      EVENT,
      sportCode,
    ]);
    await pool.query(
      `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status)
       VALUES ($1, $2, 1, '2027-12-31', tstzrange(now(), NULL), 'draft')`,
      [ruleVersion, ruleSet],
    );
    await pool.query(
      `INSERT INTO core.sport_entry_product
         (id, event_id, sport_id, name, participant_type, rule_set_id, requires_evidence)
       VALUES ($1, $2, $3, 'Men’s −81 kg re-verification', 'individual', $4, true)`,
      [product, EVENT, sport, ruleSet],
    );
    await pool.query(
      `INSERT INTO core.registration_entry
         (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id, status)
       VALUES ($1, $2, $3, $4, 'competitive', $5, 'draft')`,
      [entry, EVENT, ALICE_PROFILE, product, ruleVersion],
    );
    await pool.query(
      `INSERT INTO core.evidence_requirement_set (id, event_id, code, document_kind, classification)
       VALUES ($1, $2, 'belt_reverify', 'belt_certificate', 'ordinary')`,
      [requirementSet, EVENT],
    );
    await pool.query(
      `INSERT INTO core.evidence_requirement_version
         (id, requirement_set_id, version_no, status, effective, requiredness, valid_through,
          accepted_mime_types, message_key)
       VALUES ($1, $2, 1, 'draft', tstzrange(now(), NULL), 'required', 'stated_expiry',
               '{application/pdf}', 'evidence.judo.belt.required')`,
      [requirementVersion, requirementSet],
    );
    await pool.query(
      `INSERT INTO core.evidence_requirement_applicability (requirement_version_id, sport_id)
       VALUES ($1, $2)`,
      [requirementVersion, sport],
    );
    await pool.query(
      `UPDATE core.evidence_requirement_version SET status = 'active', published_at = now() WHERE id = $1`,
      [requirementVersion],
    );
    await pool.query(
      `INSERT INTO core.entrant_attribute
         (id, event_id, person_id, attribute, sport_code, version_no, text_value,
          status, verified_by, verified_at)
       VALUES ($1, $2, $3, 'belt_rank', $4, 1, '1dan', 'verified', $5, now())`,
      [previousBeltId, EVENT, ALICE, sportCode, OC],
    );

    const listed = await api(
      `/v1/registration-entries/${entry}/evidence?sportEntryProductId=${product}`,
      {
        headers: { authorization: `Bearer ${alice}` },
      },
    );
    expect(listed.status).toBe(200);
    const { items } = (await listed.json()) as { items: Array<{ id: string; type: string }> };
    const beltObligation = items.find((item) => item.type === 'belt_certificate');
    expect(beltObligation).toBeTruthy();

    expect(
      (
        await api(`/v1/evidence/${beltObligation!.id}/uploads`, {
          method: 'POST',
          headers: mutationHeaders(alice),
          body: JSON.stringify({
            fileName: 'replacement-belt-certificate.pdf',
            mimeType: 'application/pdf',
            fileSizeBytes: 2048,
            declaredAttribute: { attribute: 'belt_rank', textValue: '2dan' },
          }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await api(`/v1/evidence/${beltObligation!.id}/review`, {
          method: 'POST',
          headers: mutationHeaders(oc),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await api(`/v1/evidence/${beltObligation!.id}/decisions`, {
          method: 'POST',
          headers: mutationHeaders(oc),
          body: JSON.stringify({ decision: 'approved' }),
        })
      ).status,
    ).toBe(200);

    const beltRows = await pool.query<{
      id: string;
      text_value: string;
      version_no: number;
      superseded_by: string | null;
    }>(
      `SELECT id, text_value, version_no, superseded_by
         FROM core.entrant_attribute
        WHERE event_id = $1 AND person_id = $2 AND attribute = 'belt_rank' AND sport_code = $3
        ORDER BY version_no`,
      [EVENT, ALICE, sportCode],
    );
    expect(beltRows.rows).toHaveLength(2);
    const previousBelt = beltRows.rows.find((row) => row.id === previousBeltId);
    const currentBelt = beltRows.rows.find((row) => row.superseded_by === null);
    expect(previousBelt).toMatchObject({ text_value: '1dan', version_no: 1 });
    expect(currentBelt).toMatchObject({ text_value: '2dan', version_no: 2, superseded_by: null });
    expect(previousBelt?.superseded_by).toBe(currentBelt?.id);

    const factsReadByRules = await loadFacts(pool, EVENT, [ALICE]);
    expect(
      selectFact(factsReadByRules, 'belt_rank', '2027-12-31', {
        sportCode,
        requireVerified: true,
      })?.id,
    ).toBe(currentBelt?.id);
  });
});
