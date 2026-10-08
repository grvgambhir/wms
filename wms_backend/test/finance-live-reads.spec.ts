/**
 * The three list reads the admin Finance screen merges into settlements.
 *
 * The test that matters most here is not "does it return rows" — it is that a participant
 * token cannot reach them. The shim had no authentication at all and served these to anyone;
 * they list every order, payment and entry in the event, so the cutover must not carry that
 * property across with the paths.
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
import { FinanceModule } from '../src/finance/finance.module';

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
  imports: [FinanceModule],
  providers: [
    { provide: IDENTITY_PROVIDER, useValue: fake },
    AuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
})
class FinanceTestModule {}

let app: INestApplication;
let baseUrl: string;

const EVENT = randomUUID();
const SPORT = randomUUID();
const RULE_SET = randomUUID();
const RULE_VERSION = randomUUID();
const PRODUCT = randomUUID();
const ATHLETE = randomUUID();
const PROFILE = randomUUID();
const ENTRY = randomUUID();
const ORDER = randomUUID();
const LINE = randomUUID();
const INTENT = randomUUID();
const FINANCE_USER = randomUUID();

let financeToken: string;
let participantToken: string;

const get = (path: string, token: string) =>
  fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });

beforeAll(async () => {
  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1,$2,'Finance Live','2027-09-17','2027-09-26','2027-12-31')`,
    [EVENT, `finance-live-${EVENT.slice(0, 8)}`],
  );
  await pool.query(
    `INSERT INTO core.sport (id, event_id, code, name) VALUES ($1,$2,$3,'Finance Sport')`,
    [SPORT, EVENT, `fin-${EVENT.slice(0, 8)}`],
  );
  await pool.query(`INSERT INTO core.rule_set (id, event_id, sport_code) VALUES ($1,$2,$3)`, [
    RULE_SET,
    EVENT,
    `fin-${EVENT.slice(0, 8)}`,
  ]);
  await pool.query(
    `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status)
     VALUES ($1,$2,1,'2027-12-31', tstzrange(now(), NULL), 'draft')`,
    [RULE_VERSION, RULE_SET],
  );
  await pool.query(
    `INSERT INTO core.sport_entry_product (id, event_id, sport_id, name, participant_type, rule_set_id)
     VALUES ($1,$2,$3,'Finance Singles','individual',$4)`,
    [PRODUCT, EVENT, SPORT, RULE_SET],
  );
  for (const [person, name] of [
    [ATHLETE, 'Athlete'],
    [FINANCE_USER, 'Finance'],
  ] as const) {
    await pool.query(
      `INSERT INTO core.person (id, given_name, family_name, date_of_birth, profile_status)
       VALUES ($1,$2,'Live','1985-04-02','complete')`,
      [person, name],
    );
  }
  await pool.query(`INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1,$2,$3)`, [
    PROFILE,
    ATHLETE,
    EVENT,
  ]);
  await pool.query(
    `INSERT INTO core.registration_entry
       (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id, status)
     VALUES ($1,$2,$3,$4,'competitive',$5,'pending_payment')`,
    [ENTRY, EVENT, PROFILE, PRODUCT, RULE_VERSION],
  );
  await pool.query(
    `INSERT INTO core.registration_order
       (id, event_id, payer_person_id, kind, status, currency, net_minor, tax_minor, gross_minor)
     VALUES ($1,$2,$3,'individual','awaiting_payment','EUR',8197,1803,10000)`,
    [ORDER, EVENT, ATHLETE],
  );
  await pool.query(
    `INSERT INTO core.order_line
       (id, order_id, entry_id, kind, description, quantity, unit_net_minor,
        net_minor, tax_rate_bp, tax_minor, gross_minor)
     VALUES ($1,$2,$3,'entry_fee','Finance Singles',1,8197,8197,2200,1803,10000)`,
    [LINE, ORDER, ENTRY],
  );
  await pool.query(
    `INSERT INTO core.payment_intent
       (id, order_id, payer_person_id, psp, status, amount_minor, allocated_minor, currency,
        payment_method, idempotency_scope, idempotency_key, attempt_count, charge_count)
     VALUES ($1,$2,$3,'stub','settled',10000,10000,'EUR','card',$4,'finance-live-key',1,1)`,
    [INTENT, ORDER, ATHLETE, ATHLETE],
  );

  app = await NestFactory.create(FinanceTestModule, { logger: false });
  configureApp(app);
  await app.listen(0);
  baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  financeToken = fake.issueToken({ personId: FINANCE_USER, roles: ['finance'] });
  participantToken = fake.issueToken({ personId: ATHLETE, roles: ['participant'] });
});

afterAll(async () => {
  await app?.close();
  await pool.end();
});

describe('the property the shim did not have', () => {
  it('refuses a participant token on all three reads', async () => {
    // These list every order, payment and entry in the event. wms_api served them with no
    // authentication at all; carrying the paths across must not carry that across.
    for (const path of ['/v1/live/orders', '/v1/live/payments', '/v1/live/entries']) {
      const response = await get(path, participantToken);
      expect(response.status, path).toBe(403);
    }
  });

  it('refuses an unauthenticated request', async () => {
    const response = await fetch(`${baseUrl}/v1/live/orders`);
    expect(response.status).toBe(401);
  });
});

describe('shapes Finance already reads', () => {
  it('returns orders in the domain shape, not table rows', async () => {
    const body = (await (await get('/v1/live/orders', financeToken)).json()) as {
      items: Array<Record<string, unknown>>;
      total: number;
    };
    const order = body.items.find((row) => row.id === ORDER);
    expect(order).toBeDefined();
    // camelCase domain field names — the mismatch that blocked the journey endpoint's cutover
    expect(order).toMatchObject({
      registrationEntryId: ENTRY,
      currency: 'EUR',
      subtotalAmountMinor: 10000,
      totalAmountMinor: 10000,
      status: 'awaiting_payment',
      paymentId: INTENT,
    });
    expect(typeof order!.createdAt).toBe('string');
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  it('reports captured, not the storage word settled', async () => {
    const body = (await (await get('/v1/live/payments', financeToken)).json()) as {
      items: Array<Record<string, unknown>>;
    };
    const payment = body.items.find((row) => row.id === INTENT);
    expect(payment).toMatchObject({
      orderId: ORDER,
      registrationEntryId: ENTRY,
      amountMinor: 10000,
      status: 'captured',
      chargeCount: 1,
    });
  });

  it('returns entries with their sport resolved', async () => {
    const body = (await (await get('/v1/live/entries', financeToken)).json()) as {
      items: Array<Record<string, unknown>>;
    };
    const entry = body.items.find((row) => row.id === ENTRY);
    expect(entry).toMatchObject({
      eventId: EVENT,
      sportId: SPORT,
      athleteId: PROFILE,
      status: 'pending_payment',
    });
  });

  it('reports a truthful total so a capped page is visibly capped', async () => {
    // items.length < total is how the screen knows there is more. A total computed from
    // items.length would make truncation invisible, which is the failure mode being avoided.
    const body = (await (await get('/v1/live/orders', financeToken)).json()) as {
      items: unknown[];
      total: number;
    };
    expect(body.total).toBeGreaterThanOrEqual(body.items.length);
  });
});
