/** Admin registration queue: cursor paging, access control, restricted-data boundary and export audit. */
import { INestApplication, Module } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
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
    const token = `registrations.${identity.personId}.${randomUUID()}`;
    this.tokens.set(token, identity);
    return token;
  }
  authenticate(): Promise<AuthenticatedIdentity | null> {
    return Promise.resolve(null);
  }
  issue(): Promise<TokenPair> {
    throw new InvalidTokenError();
  }
  async verify(token: string): Promise<AuthenticatedIdentity> {
    const identity = this.tokens.get(token);
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
class AdminRegistrationsTestModule {}

const EVENT = randomUUID();
const ROWING = randomUUID();
const SWIMMING = randomUUID();
const RULE_SET = randomUUID();
const RULE_VERSION = randomUUID();
const ROWING_PRODUCT = randomUUID();
const SWIMMING_PRODUCT = randomUUID();
const ADMIN = randomUUID();
const PARTICIPANT = randomUUID();
const ENTRIES = [
  randomUUID(),
  randomUUID(),
  randomUUID(),
  randomUUID(),
  randomUUID(),
  randomUUID(),
];

let app: INestApplication;
let baseUrl: string;
let ocToken: string;
let participantToken: string;

function request(path: string, token: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

async function seed(): Promise<void> {
  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date, status)
     VALUES ($1,$2,'Admin registrations','2027-09-17','2027-09-26','2027-12-31','registration_open')`,
    [EVENT, `admin-registrations-${EVENT.slice(0, 8)}`],
  );
  await pool.query(
    `INSERT INTO core.sport (id,event_id,code,name) VALUES ($1,$3,'rowing','Rowing'), ($2,$3,'swimming','Swimming')`,
    [ROWING, SWIMMING, EVENT],
  );
  await pool.query(`INSERT INTO core.rule_set (id,event_id,sport_code) VALUES ($1,$2,'rowing')`, [
    RULE_SET,
    EVENT,
  ]);
  await pool.query(
    `INSERT INTO core.rule_version (id,rule_set_id,version_no,reference_date,effective,status)
     VALUES ($1,$2,1,'2027-12-31',tstzrange('2026-01-01',NULL),'draft')`,
    [RULE_VERSION, RULE_SET],
  );
  await pool.query(
    `INSERT INTO core.sport_entry_product (id,event_id,sport_id,name,participant_type,rule_set_id)
     VALUES ($1,$2,$3,'Rowing single','individual',$5), ($4,$2,$6,'Swimming 5 km','individual',$5)`,
    [ROWING_PRODUCT, EVENT, ROWING, SWIMMING_PRODUCT, RULE_SET, SWIMMING],
  );
  await pool.query(
    `INSERT INTO core.person (id,given_name,family_name,date_of_birth,profile_status)
     VALUES ($1,'OC','Admin','1970-01-01','complete'), ($2,'Participant','Only','1980-01-01','complete')`,
    [ADMIN, PARTICIPANT],
  );

  for (const [index, entryId] of ENTRIES.entries()) {
    const person = index === 0 ? PARTICIPANT : randomUUID();
    const profile = randomUUID();
    if (index !== 0) {
      const name = index === 1 ? '=cmd' : `Athlete ${index}`;
      await pool.query(
        `INSERT INTO core.person (id,email,given_name,family_name,date_of_birth,profile_status)
         VALUES ($1,$2,$3,'Queue','1985-01-01','complete')`,
        [person, `queue-${index}@example.com`, name],
      );
    }
    await pool.query(`INSERT INTO core.athlete_profile (id,person_id,event_id) VALUES ($1,$2,$3)`, [
      profile,
      person,
      EVENT,
    ]);
    const product = index === 4 ? SWIMMING_PRODUCT : ROWING_PRODUCT;
    const status = index === 2 ? 'confirmed' : index === 3 ? 'cancelled' : 'pending_payment';
    const created = index < 3 ? '2027-05-01T10:00:00.000Z' : `2027-05-0${index + 1}T10:00:00.000Z`;
    await pool.query(
      `INSERT INTO core.registration_entry
         (id,event_id,athlete_profile_id,sport_entry_product_id,grade,rule_version_id,
          original_category_name,current_category_name,evidence_status,status,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'Senior','Senior',$7,$8,$9,$9)`,
      [
        entryId,
        EVENT,
        profile,
        product,
        index === 5 ? 'recreational' : 'competitive',
        RULE_VERSION,
        index === 1 ? 'approved' : 'pending',
        status,
        created,
      ],
    );
    await pool.query(
      `INSERT INTO core.entry_status_event (entry_id,to_status,actor_kind,reason,occurred_at)
       VALUES ($1,$2,'participant','created',$3)`,
      [entryId, status, created],
    );
  }
  const participantProfile = await pool.query<{ id: string }>(
    `SELECT id FROM core.athlete_profile WHERE person_id = $1 AND event_id = $2`,
    [PARTICIPANT, EVENT],
  );
  await pool.query(
    `INSERT INTO core.protected_evidence_ref (person_id,event_id,kind,restricted_record_id)
     VALUES ($1,$2,'para_classification',$3)`,
    [PARTICIPANT, EVENT, randomUUID()],
  );
  await pool.query(
    `INSERT INTO core.registration_order (id,event_id,payer_person_id,status,currency,net_minor,tax_minor,gross_minor)
     VALUES ($1,$2,$3,'awaiting_payment','EUR',10000,0,10000)`,
    [randomUUID(), EVENT, PARTICIPANT],
  );
  const order = await pool.query<{ id: string }>(
    `SELECT id FROM core.registration_order WHERE event_id = $1 AND payer_person_id = $2`,
    [EVENT, PARTICIPANT],
  );
  await pool.query(
    `INSERT INTO core.order_line (order_id,entry_id,kind,description,quantity,unit_net_minor,net_minor,tax_rate_bp,tax_minor,tax_code,gross_minor)
     VALUES ($1,$2,'entry_fee','Entry',1,10000,10000,0,0,'EXEMPT',10000)`,
    [order.rows[0]!.id, ENTRIES[0]],
  );
  void participantProfile;
}

beforeAll(async () => {
  await seed();
  app = await NestFactory.create(AdminRegistrationsTestModule, { logger: false });
  configureApp(app);
  await app.listen(0);
  baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  ocToken = fake.issueToken({ personId: ADMIN, roles: ['oc_admin'] });
  participantToken = fake.issueToken({ personId: PARTICIPANT, roles: ['participant'] });
});

afterAll(async () => {
  await app?.close();
});

describe('admin registration queue', () => {
  it('combines sport, status and search; counts intentionally ignore status', async () => {
    const filter = `eventId=${EVENT}&sportId=${ROWING}&status=pending_payment&search=Queue`;
    const page = await request(`/v1/admin/registrations?${filter}`, ocToken);
    expect(page.status).toBe(200);
    const body = (await page.json()) as { items: Array<{ id: string }> };
    expect(body.items).toHaveLength(2);
    expect(body.items.every((item) => new Set<string>(ENTRIES).has(item.id))).toBe(true);

    const counts = await request(
      `/v1/admin/registrations/counts?eventId=${EVENT}&sportId=${ROWING}&search=Queue`,
      ocToken,
    );
    expect((await counts.json()) as Record<string, number>).toMatchObject({
      pending_payment: 2,
      confirmed: 1,
      cancelled: 1,
    });
  });

  it('uses a created-at/id keyset so equal timestamps neither repeat nor skip rows', async () => {
    const ids: string[] = [];
    let cursor = '';
    do {
      const page = await request(
        `/v1/admin/registrations?eventId=${EVENT}&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        ocToken,
      );
      const body = (await page.json()) as { items: Array<{ id: string }>; cursor?: string };
      ids.push(...body.items.map((item) => item.id));
      cursor = body.cursor ?? '';
    } while (cursor);
    expect(ids).toHaveLength(ENTRIES.length);
    expect(new Set(ids)).toHaveLength(ENTRIES.length);
  });

  it('refuses participant tokens over HTTP for every registration read', async () => {
    for (const path of [
      `/v1/admin/registrations?eventId=${EVENT}`,
      `/v1/admin/registrations/counts?eventId=${EVENT}`,
      `/v1/admin/registrations/export.csv?eventId=${EVENT}`,
      `/v1/admin/registrations/${ENTRIES[0]}`,
    ]) {
      expect((await request(path, participantToken)).status, path).toBe(403);
    }
  });

  it('returns restricted evidence only as a coarse summary and reads database actions', async () => {
    const response = await request(`/v1/admin/registrations/${ENTRIES[0]}`, ocToken);
    expect(response.status).toBe(200);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toContain('"restrictedCount":1');
    expect(serialized).not.toContain('para_classification');

    const cancelled = await request(`/v1/admin/registrations/${ENTRIES[3]}`, ocToken);
    expect(
      ((await cancelled.json()) as { allowedActions: Array<{ action: string }> }).allowedActions,
    ).toMatchObject([{ action: 'reinstate' }]);
    const confirmed = await request(`/v1/admin/registrations/${ENTRIES[2]}`, ocToken);
    expect(
      (
        (await confirmed.json()) as { allowedActions: Array<{ action: string }> }
      ).allowedActions.map((action) => action.action),
    ).toContain('cancel');
  });

  it('writes one audit record for the bounded CSV export and defuses formulas', async () => {
    const before = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit.activity_log WHERE action = 'registration.export'`,
    );
    const response = await request(
      `/v1/admin/registrations/export.csv?eventId=${EVENT}&search=cmd`,
      ocToken,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("'=cmd");
    const after = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit.activity_log WHERE action = 'registration.export'`,
    );
    expect(Number(after.rows[0]!.count)).toBe(Number(before.rows[0]!.count) + 1);
  });

  it('keeps a filtered and searched list responsive across 20,000 entries', async () => {
    const started = performance.now();
    await pool.query(
      `WITH people AS (
         INSERT INTO core.person (id,email,given_name,family_name,date_of_birth,profile_status)
         SELECT uuidv7(), 'load-' || series || '@example.com', 'Load Athlete ' || series, 'Queue', '1985-01-01', 'complete'
           FROM generate_series(1, 20000) series
         RETURNING id
       ), profiles AS (
         INSERT INTO core.athlete_profile (id,person_id,event_id)
         SELECT uuidv7(), id, $1 FROM people
         RETURNING id
       )
       INSERT INTO core.registration_entry
         (id,event_id,athlete_profile_id,sport_entry_product_id,grade,rule_version_id,status,created_at,updated_at)
       SELECT uuidv7(), $1, id, $2, 'competitive', $3, 'pending_payment',
              now() - (row_number() OVER () || ' seconds')::interval,
              now() - (row_number() OVER () || ' seconds')::interval
         FROM profiles`,
      [EVENT, ROWING_PRODUCT, RULE_VERSION],
    );
    const insertedAt = performance.now();
    const response = await request(
      `/v1/admin/registrations?eventId=${EVENT}&sportId=${ROWING}&status=pending_payment&search=Load%20Athlete%2019999&limit=20`,
      ocToken,
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as { items: unknown[] }).items).toHaveLength(1);
    const searchedListMs = performance.now() - insertedAt;
    const plans = await Promise.all([
      explainQueue({ search: false }),
      explainQueue({ search: true }),
    ]);
    const [filteredMs = Number.NaN, searchedPlanMs = Number.NaN] = plans.map(executionMs);
    const keysetPlan = await pool.query<{ 'QUERY PLAN': string }>(
      `EXPLAIN (ANALYZE, BUFFERS)
       SELECT id
         FROM core.registration_entry
        WHERE event_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 21`,
      [EVENT],
    );
    const keysetLines = keysetPlan.rows.map((row) => row['QUERY PLAN']);
    const keysetMs = executionMs(keysetLines);
    const accessPaths = plans.map((plan) => {
      if (plan.some((line) => line.includes('entry_keyset'))) return 'entry_keyset';
      if (plan.some((line) => line.includes('entry_by_event_status')))
        return 'entry_by_event_status';
      return 'sequential scan';
    });
    console.info(
      `admin registrations 20k: fixture ${Math.round(insertedAt - started)}ms; endpoint search ${Math.round(searchedListMs)}ms; EXPLAIN filtered ${filteredMs.toFixed(2)}ms (${accessPaths[0]}); search ${searchedPlanMs.toFixed(2)}ms (${accessPaths[1]}); keyset ${keysetMs.toFixed(2)}ms (${keysetLines.some((line) => line.includes('entry_keyset')) ? 'entry_keyset' : 'unexpected plan'})`,
    );
    expect(searchedListMs).toBeLessThan(1_000);
    expect(filteredMs).toBeLessThan(1_000);
    expect(searchedPlanMs).toBeLessThan(1_000);
    expect(keysetLines.some((line) => line.includes('entry_keyset'))).toBe(true);
  });
});

async function explainQueue({ search }: { search: boolean }): Promise<string[]> {
  const searchSql = search
    ? ` AND (person.given_name ILIKE '%Load Athlete 19999%' ESCAPE '\\'
          OR person.family_name ILIKE '%Load Athlete 19999%' ESCAPE '\\'
          OR (person.given_name || ' ' || person.family_name) ILIKE '%Load Athlete 19999%' ESCAPE '\\'
          OR COALESCE(person.email::text, '') ILIKE '%Load Athlete 19999%' ESCAPE '\\'
          OR entry.id::text ILIKE 'Load Athlete 19999%' ESCAPE '\\')`
    : '';
  const { rows } = await pool.query<{ 'QUERY PLAN': string }>(
    `EXPLAIN (ANALYZE, BUFFERS)
     SELECT entry.id, money.due_minor
       FROM core.registration_entry entry
       JOIN core.athlete_profile athlete ON athlete.id = entry.athlete_profile_id
       JOIN core.person person ON person.id = athlete.person_id
       JOIN core.sport_entry_product product ON product.id = entry.sport_entry_product_id
       JOIN core.sport sport ON sport.id = product.sport_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(line.gross_minor) FILTER (WHERE line.kind IN ('entry_fee','add_on','deposit','balance')), 0) AS due_minor
           FROM core.order_line line
          WHERE line.entry_id = entry.id
       ) money ON TRUE
      WHERE entry.event_id = $1
        AND sport.id = $2
        AND entry.status = 'pending_payment'
        ${searchSql}
      ORDER BY entry.created_at DESC, entry.id DESC
      LIMIT 21`,
    [EVENT, ROWING],
  );
  return rows.map((row) => row['QUERY PLAN']);
}

function executionMs(plan: string[]): number {
  const line = plan.find((value) => value.startsWith('Execution Time:'));
  const match = /Execution Time: ([\d.]+) ms/.exec(line ?? '');
  if (!match?.[1]) throw new Error(`EXPLAIN did not report execution time: ${plan.join('\n')}`);
  return Number(match[1]);
}
