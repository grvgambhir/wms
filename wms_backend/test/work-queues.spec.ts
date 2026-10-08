/**
 * Admin work queues on the real database: communications, assisted registration,
 * exception review. Dual control is UNIQUE (case_id, signer_id); consent is
 * proxy_needs_consent; audience membership is audienceIncludesParticipant().
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
import { INBOX_SUBJECTS_SQL } from '../src/ops/comms.service';
import { OpsModule } from '../src/ops/ops.module';

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
  imports: [OpsModule],
  providers: [
    { provide: IDENTITY_PROVIDER, useValue: fake },
    AuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
})
class WorkQueuesTestModule {}

let app: INestApplication;
let baseUrl: string;

const EVENT = randomUUID();
const TENNIS_SPORT = randomUUID();
const ROWING_SPORT = randomUUID();
const TENNIS_SET = randomUUID();
const ROWING_SET = randomUUID();
const TENNIS_V = randomUUID();
const ROWING_V = randomUUID();
const TENNIS_PRODUCT = randomUUID();
const ROWING_PRODUCT = randomUUID();
const TENNIS_PERSON = randomUUID();
const ROWING_PERSON = randomUUID();
const ASSISTED_PERSON = randomUUID();
const OC = randomUUID();
const OC_B = randomUUID();
const TENNIS_PROFILE = randomUUID();
const ROWING_PROFILE = randomUUID();
const ASSISTED_PROFILE = randomUUID();
const TENNIS_ENTRY = randomUUID();
const ROWING_ENTRY = randomUUID();
const CASE = randomUUID();
const TEMPLATE = randomUUID();
const TEMPLATE_VERSION = randomUUID();

function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

function mutationHeaders(token: string, key: string = randomUUID()): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'idempotency-key': key };
}

async function seedGraph(): Promise<void> {
  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1, $2, 'Como Lake 2027', '2027-09-17', '2027-09-26', '2027-12-31')`,
    [EVENT, `wq-${EVENT.slice(0, 8)}`],
  );
  await pool.query(
    `INSERT INTO core.sport (id, event_id, code, name)
     VALUES ($1, $3, 'tennis', 'Tennis'), ($2, $3, 'rowing', 'Rowing')`,
    [TENNIS_SPORT, ROWING_SPORT, EVENT],
  );
  await pool.query(
    `INSERT INTO core.rule_set (id, event_id, sport_code, event_name)
     VALUES ($1, $3, 'tennis', 'Singles'), ($2, $3, 'rowing', 'Coxed four')`,
    [TENNIS_SET, ROWING_SET, EVENT],
  );
  await pool.query(
    `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status, reason)
     VALUES ($1, $2, 1, '2027-12-31', tstzrange(now(), NULL), 'draft', 'v1.0'),
            ($3, $4, 1, '2027-12-31', tstzrange(now(), NULL), 'draft', 'v1.0')`,
    [TENNIS_V, TENNIS_SET, ROWING_V, ROWING_SET],
  );
  await pool.query(
    `INSERT INTO core.sport_entry_product
       (id, event_id, sport_id, name, participant_type, rule_set_id)
     VALUES ($1, $3, $4, 'Singles', 'individual', $5),
            ($2, $3, $6, 'Coxed four', 'crew', $7)`,
    [TENNIS_PRODUCT, ROWING_PRODUCT, EVENT, TENNIS_SPORT, TENNIS_SET, ROWING_SPORT, ROWING_SET],
  );
  await pool.query(
    `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
     VALUES ($1, $2, 'Tia', 'Tennis', '1985-03-15'),
            ($3, $4, 'Rory', 'Rowing', '1988-04-12'),
            ($5, $6, 'Luca', 'Bianchi', '1990-01-01'),
            ($7, $8, 'Helen', 'Ward', '1978-04-12'),
            ($9, $10, 'Owen', 'Other', '1975-06-01')`,
    [
      TENNIS_PERSON, `ten.${TENNIS_PERSON}@example.com`,
      ROWING_PERSON, `row.${ROWING_PERSON}@example.com`,
      ASSISTED_PERSON, `as.${ASSISTED_PERSON}@example.com`,
      OC, `oc.${OC}@example.com`,
      OC_B, `ocb.${OC_B}@example.com`,
    ],
  );
  await pool.query(`SELECT core.publish_rule_version($1, $2)`, [TENNIS_V, OC]);
  await pool.query(`SELECT core.publish_rule_version($1, $2)`, [ROWING_V, OC]);
  await pool.query(
    `INSERT INTO core.athlete_profile (id, person_id, event_id)
     VALUES ($1, $2, $7), ($3, $4, $7), ($5, $6, $7)`,
    [TENNIS_PROFILE, TENNIS_PERSON, ROWING_PROFILE, ROWING_PERSON, ASSISTED_PROFILE, ASSISTED_PERSON, EVENT],
  );
  await pool.query(
    `INSERT INTO core.registration_entry
       (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id, status)
     VALUES ($1, $3, $4, $5, 'competitive', $6, 'confirmed'),
            ($2, $3, $7, $8, 'competitive', $9, 'confirmed')`,
    [
      TENNIS_ENTRY,
      ROWING_ENTRY,
      EVENT,
      TENNIS_PROFILE,
      TENNIS_PRODUCT,
      TENNIS_V,
      ROWING_PROFILE,
      ROWING_PRODUCT,
      ROWING_V,
    ],
  );
  await pool.query(
    `INSERT INTO core.person_role (person_id, role_code, event_id, granted_by)
     VALUES ($1, 'participant', $4, $1),
            ($2, 'participant', $4, $2),
            ($3, 'participant', $4, $3)`,
    [TENNIS_PERSON, ROWING_PERSON, ASSISTED_PERSON, EVENT],
  );
  await pool.query(
    `INSERT INTO ops.exception_case
       (id, event_id, kind, impact, summary, status, rule_version_id)
     VALUES ($1, $2, 'grade_waiver', 'high', 'Tia Tennis — Singles: waiver requested', 'pending', $3)`,
    [CASE, EVENT, TENNIS_V],
  );
  await pool.query(
    `INSERT INTO core.comms_audience (event_id, code, name_key, filter)
     VALUES ($1, 'tennis', 'comms.audience.tennis', '{"sport":"tennis"}'::jsonb),
            ($1, 'rowing', 'comms.audience.rowing', '{"sport":"rowing"}'::jsonb),
            ($1, 'all-participants', 'comms.audience.all_participants', '{"all":true}'::jsonb)`,
    [EVENT],
  );
  await pool.query(
    `INSERT INTO core.comms_template (id, event_id, code, channel, classification, name_key)
     VALUES ($1, $2, 'payment_reminder', 'email', 'transactional', 'comms.template.payment_reminder')`,
    [TEMPLATE, EVENT],
  );
  await pool.query(
    `INSERT INTO core.comms_template_version (id, template_id, version_no, status)
     VALUES ($1, $2, 1, 'draft')`,
    [TEMPLATE_VERSION, TEMPLATE],
  );
  await pool.query(
    `INSERT INTO core.comms_template_copy (template_version_id, locale, subject, body)
     VALUES ($1, 'en', 'Complete your payment', 'Please pay.')`,
    [TEMPLATE_VERSION],
  );
  await pool.query(
    `UPDATE core.comms_template_version
        SET status = 'approved', approved_by = $2, approved_at = now()
      WHERE id = $1`,
    [TEMPLATE_VERSION, OC],
  );
}

beforeAll(async () => {
  await seedGraph();
  app = await NestFactory.create(WorkQueuesTestModule, { logger: false });
  configureApp(app);
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  if (app) await app.close();
});

describe('exception dual control is the unique constraint', () => {
  it('the same signer cannot insert two rows; two distinct signers can', async () => {
    await pool.query(
      `INSERT INTO ops.exception_signature (case_id, signer_id, decision)
       VALUES ($1, $2, 'approve')`,
      [CASE, OC],
    );
    await expect(
      pool.query(
        `INSERT INTO ops.exception_signature (case_id, signer_id, decision)
         VALUES ($1, $2, 'approve')`,
        [CASE, OC],
      ),
    ).rejects.toMatchObject({ code: '23505' });

    const oc = fake.issueToken({ personId: OC, roles: ['oc_staff'] });
    const replay = await api(`/v1/exceptions/${CASE}/approve`, {
      method: 'POST',
      headers: mutationHeaders(oc, 'approve-oc-1'),
      body: '{}',
    });
    expect(replay.status).toBe(409);
    const replayBody = (await replay.json()) as { code: string };
    expect(replayBody.code).toBe('DUPLICATE_SIGNATURE');

    const ocB = fake.issueToken({ personId: OC_B, roles: ['oc_staff'] });
    const second = await api(`/v1/exceptions/${CASE}/approve`, {
      method: 'POST',
      headers: mutationHeaders(ocB, 'approve-ocb-1'),
      body: '{}',
    });
    expect(second.status).toBe(200);
    const approved = (await second.json()) as { decision: string; approvers: string[] };
    expect(approved.decision).toBe('approved');
    expect(approved.approvers).toHaveLength(2);
  });
});

describe('PLT-06 proxy consent is the database constraint', () => {
  it('a draft assisted session without consent is 23514, and the HTTP action does not pre-check a different message', async () => {
    await expect(
      pool.query(
        `INSERT INTO core.assisted_session (event_id, participant_id, operator_id, status)
         VALUES ($1, $2, $3, 'draft')`,
        [EVENT, ASSISTED_PERSON, OC],
      ),
    ).rejects.toMatchObject({ code: '23514' });

    const oc = fake.issueToken({ personId: OC, roles: ['oc_staff'] });
    const refused = await api('/v1/assisted-registration/actions', {
      method: 'POST',
      headers: mutationHeaders(oc, 'proxy-before-consent'),
      body: JSON.stringify({
        participantId: ASSISTED_PERSON,
        action: 'registration_started',
      }),
    });
    expect(refused.status).toBe(422);
    const refusedBody = (await refused.json()) as { code: string };
    expect(refusedBody.code).toBe('CONSENT_REQUIRED');

    const consent = await api('/v1/assisted-registration/consents', {
      method: 'POST',
      headers: mutationHeaders(oc, 'consent-1'),
      body: JSON.stringify({ participantId: ASSISTED_PERSON, method: 'in_person' }),
    });
    expect(consent.status).toBe(200);

    const started = await api('/v1/assisted-registration/actions', {
      method: 'POST',
      headers: mutationHeaders(oc, 'proxy-after-consent'),
      body: JSON.stringify({
        participantId: ASSISTED_PERSON,
        action: 'registration_started',
      }),
    });
    expect(started.status).toBe(200);
    const startedBody = (await started.json()) as { session: { registrationStatus: string } };
    expect(startedBody.session.registrationStatus).toBe('draft');
  });
});

describe('OPS-02 broadcast audience', () => {
  it('REV-038: a tennis send reaches the tennis athlete and not the rowing athlete', async () => {
    const oc = fake.issueToken({ personId: OC, roles: ['oc_staff'] });
    const sent = await api('/v1/communications/broadcasts', {
      method: 'POST',
      headers: mutationHeaders(oc, 'bcast-tennis-1'),
      body: JSON.stringify({
        templateId: TEMPLATE,
        subject: 'Tennis notice',
        audienceId: 'tennis',
        channel: 'email',
      }),
    });
    expect(sent.status).toBe(200);
    const body = (await sent.json()) as { record: { id: string; recipientCount: number } };
    expect(body.record.recipientCount).toBeGreaterThanOrEqual(1);

    const detail = await api(`/v1/communications/broadcasts/${body.record.id}`, {
      headers: { authorization: `Bearer ${oc}` },
    });
    expect(detail.status).toBe(200);
    const view = (await detail.json()) as {
      deliveries: Array<{
        id: string;
        personId: string;
        attempts: Array<{ result: string }>;
      }>;
    };
    const personIds = view.deliveries.map((item) => item.personId);
    expect(personIds).toContain(TENNIS_PERSON);
    expect(personIds).not.toContain(ROWING_PERSON);
    const tennisDelivery = view.deliveries.find((item) => item.personId === TENNIS_PERSON);
    expect(tennisDelivery?.attempts.some((attempt) => attempt.result === 'accepted')).toBe(true);

    await pool.query(
      `INSERT INTO core.delivery_attempt (delivery_id, provider, result, response_key)
       VALUES ($1, 'unspecified', 'failed', 'comms.delivery.provider_failed')`,
      [tennisDelivery!.id],
    );
    const again = await api(`/v1/communications/broadcasts/${body.record.id}`, {
      headers: { authorization: `Bearer ${oc}` },
    });
    const againView = (await again.json()) as {
      deliveries: Array<{ personId: string; attempts: Array<{ result: string; responseKey: string | null }> }>;
    };
    const attempts = againView.deliveries.find((item) => item.personId === TENNIS_PERSON)?.attempts ?? [];
    expect(attempts.some((attempt) => attempt.result === 'failed')).toBe(true);
    expect(attempts.find((attempt) => attempt.result === 'failed')?.responseKey).toBe(
      'comms.delivery.provider_failed',
    );
  });
});

describe('GET /v1/me/inbox', () => {
  it('a tennis broadcast appears in the tennis inbox and not the rowing inbox', async () => {
    const oc = fake.issueToken({ personId: OC, roles: ['oc_staff'] });
    const sent = await api('/v1/communications/broadcasts', {
      method: 'POST',
      headers: mutationHeaders(oc, 'inbox-tennis-1'),
      body: JSON.stringify({
        templateId: TEMPLATE,
        subject: 'Tennis inbox notice',
        audienceId: 'tennis',
        channel: 'in-app',
      }),
    });
    expect(sent.status).toBe(200);
    const tennisNotice = ((await sent.json()) as { record: { id: string } }).record.id;

    const tennis = fake.issueToken({ personId: TENNIS_PERSON, roles: ['participant'] });
    const rowing = fake.issueToken({ personId: ROWING_PERSON, roles: ['participant'] });
    const tennisInbox = await api('/v1/me/inbox', { headers: { authorization: `Bearer ${tennis}` } });
    const rowingInbox = await api('/v1/me/inbox', { headers: { authorization: `Bearer ${rowing}` } });
    expect(tennisInbox.status).toBe(200);
    expect(rowingInbox.status).toBe(200);
    const tennisBody = (await tennisInbox.json()) as { items: Array<{ id: string; subject: string }> };
    const rowingBody = (await rowingInbox.json()) as { items: Array<{ id: string }> };
    expect(tennisBody.items.some((item) => item.id === tennisNotice)).toBe(true);
    expect(rowingBody.items.some((item) => item.id === tennisNotice)).toBe(false);

    const spoofed = await api(`/v1/me/inbox?athleteId=${TENNIS_PERSON}`, {
      headers: { authorization: `Bearer ${rowing}` },
    });
    const spoofedBody = (await spoofed.json()) as { items: Array<{ id: string }> };
    expect(spoofedBody.items.some((item) => item.id === tennisNotice)).toBe(false);
  });

  it('cannot read another participant\'s subjects — the WHERE is person_id = caller', async () => {
    const { rows } = await pool.query<{ person_id: string }>(INBOX_SUBJECTS_SQL, [ROWING_PERSON]);
    expect(rows.map((row) => row.person_id)).toEqual([ROWING_PERSON]);
    expect(rows.some((row) => row.person_id === TENNIS_PERSON)).toBe(false);
  });

  it('returns a stable keyset cursor', async () => {
    const oc = fake.issueToken({ personId: OC, roles: ['oc_staff'] });
    const first = await api('/v1/communications/broadcasts', {
      method: 'POST',
      headers: mutationHeaders(oc, 'inbox-page-1'),
      body: JSON.stringify({
        templateId: TEMPLATE,
        subject: 'Tennis page one',
        audienceId: 'tennis',
        channel: 'in-app',
      }),
    });
    const second = await api('/v1/communications/broadcasts', {
      method: 'POST',
      headers: mutationHeaders(oc, 'inbox-page-2'),
      body: JSON.stringify({
        templateId: TEMPLATE,
        subject: 'Tennis page two',
        audienceId: 'tennis',
        channel: 'in-app',
      }),
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const tennis = fake.issueToken({ personId: TENNIS_PERSON, roles: ['participant'] });
    const page1 = await api('/v1/me/inbox?limit=1', { headers: { authorization: `Bearer ${tennis}` } });
    expect(page1.status).toBe(200);
    const body1 = (await page1.json()) as {
      items: Array<{ id: string }>;
      cursor?: string;
      total: number;
    };
    expect(body1.items).toHaveLength(1);
    expect(body1.cursor).toBeTruthy();
    expect(body1.total).toBeGreaterThanOrEqual(2);

    const page2 = await api(`/v1/me/inbox?limit=1&cursor=${encodeURIComponent(body1.cursor!)}`, {
      headers: { authorization: `Bearer ${tennis}` },
    });
    expect(page2.status).toBe(200);
    const body2 = (await page2.json()) as { items: Array<{ id: string }>; cursor?: string };
    expect(body2.items).toHaveLength(1);
    expect(body2.items[0]!.id).not.toBe(body1.items[0]!.id);

    const page2Again = await api(`/v1/me/inbox?limit=1&cursor=${encodeURIComponent(body1.cursor!)}`, {
      headers: { authorization: `Bearer ${tennis}` },
    });
    const again = (await page2Again.json()) as { items: Array<{ id: string }> };
    expect(again.items[0]!.id).toBe(body2.items[0]!.id);
  });
});

describe('restart survival', () => {
  it('broadcast, assisted session and exception signatures are still in Postgres after the HTTP call', async () => {
    const broadcast = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM core.broadcast WHERE event_id = $1 AND status = 'sent'`,
      [EVENT],
    );
    expect(Number(broadcast.rows[0]?.n)).toBeGreaterThanOrEqual(1);
    const session = await pool.query<{ status: string; consent_id: string | null }>(
      `SELECT status, consent_id FROM core.assisted_session WHERE participant_id = $1`,
      [ASSISTED_PERSON],
    );
    expect(session.rows[0]?.consent_id).toBeTruthy();
    expect(session.rows[0]?.status).toBe('draft');
    const signatures = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM ops.exception_signature WHERE case_id = $1`,
      [CASE],
    );
    expect(Number(signatures.rows[0]?.n)).toBe(2);
    const exception = await pool.query<{ status: string; rule_version_id: string | null }>(
      `SELECT status, rule_version_id FROM ops.exception_case WHERE id = $1`,
      [CASE],
    );
    expect(exception.rows[0]?.status).toBe('approved');
    expect(exception.rows[0]?.rule_version_id).toBe(TENNIS_V);
  });
});
