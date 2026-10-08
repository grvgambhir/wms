/**
 * Registration mutation guarantees against real PostgreSQL. These deliberately exercise
 * the repository transactions and the Nest route; sequential mocks cannot prove the two
 * failure modes this task exists to close (oversell and cross-participant mutation).
 */
import { INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import { TRANSITIONS, type JourneyEntryStatus } from '@wms/domain';
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
import type { Queryable } from '../src/common/idempotency/idempotency.service';
import { configureApp } from '../src/configure-app';
import { pool as appPool } from '../src/db/pool';
import { StubPaymentProvider } from '../src/registration/payment-provider';
import { PostgresRegistrationJourneyRepository } from '../src/registration/postgres-registration-journey.repository';
import { RegistrationMutations } from '../src/registration/registration-mutations';
import { RegistrationModule } from '../src/registration/registration.module';

const EVENT = randomUUID();
const SPORT = randomUUID();
const RULE_SET = randomUUID();
const RULE_VERSION = randomUUID();
const TAX = randomUUID();

const CLAIM_PRODUCT = randomUUID();
const CLAIM_POOL = randomUUID();
const SPORT_POOL = randomUUID();
const PAYMENT_PRODUCT = randomUUID();
const PAYMENT_POOL = randomUUID();
const WAITLIST_PRODUCT = randomUUID();
const WAITLIST_POOL = randomUUID();
const EVIDENCE_PRODUCT = randomUUID();
const EVIDENCE_POOL = randomUUID();

const ALICE = randomUUID();
const BOB = randomUUID();
const CAROL = randomUUID();
const DAVE = randomUUID();
const ERIN = randomUUID();
const ADMIN = randomUUID();
const ALICE_PROFILE = randomUUID();
const BOB_PROFILE = randomUUID();
const CAROL_PROFILE = randomUUID();
const DAVE_PROFILE = randomUUID();
const ERIN_PROFILE = randomUUID();
const ALICE_ENTRY = randomUUID();
const BOB_ENTRY = randomUUID();
const CAROL_ENTRY = randomUUID();
const DAVE_ENTRY = randomUUID();
const ERIN_ENTRY = randomUUID();
const WAITLIST = randomUUID();

let pool: Pool;
let mutations: RegistrationMutations;
let repository: PostgresRegistrationJourneyRepository;

async function seed(): Promise<void> {
  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1,$2,'Mutation Test','2027-09-17','2027-09-26','2027-12-31')`,
    [EVENT, `mutation-${EVENT}`],
  );
  await pool.query(
    `INSERT INTO core.sport (id, event_id, code, name) VALUES ($1,$2,'mutation-sport','Mutation Sport')`,
    [SPORT, EVENT],
  );
  await pool.query(
    `INSERT INTO core.rule_set (id, event_id, sport_code) VALUES ($1,$2,'mutation-sport')`,
    [RULE_SET, EVENT],
  );
  await pool.query(
    `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status)
     VALUES ($1,$2,1,'2027-12-31',tstzrange('2026-01-01',NULL),'draft')`,
    [RULE_VERSION, RULE_SET],
  );
  await pool.query(
    `INSERT INTO core.tax_rule
       (id, event_id, name, rate_bp, rounding, basis, effective, status)
     VALUES ($1,$2,'IVA 22',2200,'half_up','inclusive',tstzrange('2026-01-01',NULL),'active')`,
    [TAX, EVENT],
  );

  for (const [id, name, evidence] of [
    [CLAIM_PRODUCT, 'One place', false],
    [PAYMENT_PRODUCT, 'Payment', false],
    [WAITLIST_PRODUCT, 'Waitlist', false],
    [EVIDENCE_PRODUCT, 'Evidence', true],
  ] as const) {
    await pool.query(
      `INSERT INTO core.sport_entry_product
         (id,event_id,sport_id,name,participant_type,rule_set_id,requires_evidence)
       VALUES ($1,$2,$3,$4,'individual',$5,$6)`,
      [id, EVENT, SPORT, name, RULE_SET, evidence],
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
      `INSERT INTO core.fee
         (event_id,sport_entry_product_id,grade,currency,base_amount_minor,service_amount_minor,effective)
       VALUES ($1,$2,'competitive','EUR',9000,1000,tstzrange('2026-01-01',NULL))`,
      [EVENT, id],
    );
  }

  await pool.query(
    `INSERT INTO core.quota_pool (id,event_id,name,scope_kind,scope_ref,capacity)
     VALUES ($1,$2,'Sport parent','sport',$3,20)`,
    [SPORT_POOL, EVENT, SPORT],
  );
  for (const [id, product, name, capacity, confirmed] of [
    [CLAIM_POOL, CLAIM_PRODUCT, 'One place', 1, 0],
    [PAYMENT_POOL, PAYMENT_PRODUCT, 'Payment places', 5, 0],
    [WAITLIST_POOL, WAITLIST_PRODUCT, 'Waitlist place', 1, 1],
    [EVIDENCE_POOL, EVIDENCE_PRODUCT, 'Evidence places', 5, 0],
  ] as const) {
    await pool.query(
      `INSERT INTO core.quota_pool
         (id,event_id,name,scope_kind,scope_ref,parent_pool_id,capacity,confirmed)
       VALUES ($1,$2,$3,'product',$4,$5,$6,$7)`,
      [id, EVENT, name, product, SPORT_POOL, capacity, confirmed],
    );
  }

  for (const [person, profile, name] of [
    [ALICE, ALICE_PROFILE, 'Alice'],
    [BOB, BOB_PROFILE, 'Bob'],
    [CAROL, CAROL_PROFILE, 'Carol'],
    [DAVE, DAVE_PROFILE, 'Dave'],
    [ERIN, ERIN_PROFILE, 'Erin'],
    [ADMIN, randomUUID(), 'Admin'],
  ] as const) {
    await pool.query(
      `INSERT INTO core.person (id,email,given_name,family_name,date_of_birth)
       VALUES ($1,$2,$3,'Mutation','1985-04-02')`,
      [person, `${person}@example.com`, name],
    );
    if (person !== ADMIN) {
      await pool.query(
        `INSERT INTO core.athlete_profile (id,person_id,event_id) VALUES ($1,$2,$3)`,
        [profile, person, EVENT],
      );
    }
  }

  for (const [entry, profile, product] of [
    [ALICE_ENTRY, ALICE_PROFILE, CLAIM_PRODUCT],
    [BOB_ENTRY, BOB_PROFILE, CLAIM_PRODUCT],
    [CAROL_ENTRY, CAROL_PROFILE, WAITLIST_PRODUCT],
    [DAVE_ENTRY, DAVE_PROFILE, PAYMENT_PRODUCT],
    [ERIN_ENTRY, ERIN_PROFILE, EVIDENCE_PRODUCT],
  ] as const) {
    await pool.query(
      `INSERT INTO core.registration_entry
         (id,event_id,athlete_profile_id,sport_entry_product_id,grade,rule_version_id,status)
       VALUES ($1,$2,$3,$4,'competitive',$5,'draft')`,
      [entry, EVENT, profile, product, RULE_VERSION],
    );
  }
  await pool.query(
    `INSERT INTO core.waitlist_entry (id,quota_pool_id,entry_id,status)
     VALUES ($1,$2,$3,'eligible')`,
    [WAITLIST, WAITLIST_POOL, CAROL_ENTRY],
  );
}

beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL as string, max: 12 });
  mutations = new RegistrationMutations(pool);
  repository = new PostgresRegistrationJourneyRepository(pool);
  await seed();
});

afterAll(async () => {
  await pool.end();
});

describe('quota claim', () => {
  it('admits one of two real concurrent transactions when one place remains', async () => {
    const save = (entry: string, person: string) =>
      repository.saveEntry({
        registrationEntryId: entry,
        sportEntryProductId: CLAIM_PRODUCT,
        grade: 'competitive',
        idempotencyKey: randomUUID(),
        actorId: person,
        scope: person,
      });

    const outcomes = await Promise.allSettled([save(ALICE_ENTRY, ALICE), save(BOB_ENTRY, BOB)]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const refusal = outcomes.find((result) => result.status === 'rejected');
    expect(refusal).toMatchObject({ status: 'rejected', reason: { code: 'QUOTA_FULL' } });

    const quota = await pool.query<{ reserved: number }>(
      `SELECT reserved FROM core.quota_pool WHERE id = $1`,
      [CLAIM_POOL],
    );
    expect(quota.rows[0]?.reserved).toBe(1);
    const consumed = await pool.query<{ count: string }>(
      `SELECT count(*)::text FROM core.entry_quota_consumption WHERE quota_pool_id = $1`,
      [CLAIM_POOL],
    );
    expect(consumed.rows[0]?.count).toBe('1');
  });

  it('locks discovered parent and product pools in id order', async () => {
    await pool.query(
      `DELETE FROM core.entry_quota_consumption
        WHERE quota_pool_id = ANY($1::uuid[])`,
      [[CLAIM_POOL, SPORT_POOL]],
    );
    await pool.query(
      `UPDATE core.quota_pool SET reserved = 0, confirmed = 0
        WHERE id = ANY($1::uuid[])`,
      [[CLAIM_POOL, SPORT_POOL]],
    );
    const client = await pool.connect();
    const observed: string[] = [];
    try {
      await client.query('BEGIN');
      const recording: Queryable = {
        query: async <T>(sql: string, params?: readonly unknown[]) => {
          const result = await client.query(sql, params as unknown[] | undefined);
          if (
            sql.includes('FROM core.quota_pool') &&
            sql.includes('ORDER BY id') &&
            sql.includes('FOR UPDATE')
          ) {
            observed.push(...(result.rows as Array<{ id: string }>).map((row) => row.id));
          }
          return { rows: result.rows as T[] };
        },
      };
      await mutations.claimQuotaForEntry(recording, BOB_ENTRY);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    expect(observed).toEqual([...observed].sort());
    expect(new Set(observed)).toEqual(new Set([CLAIM_POOL, SPORT_POOL]));
  });

  it('leaves a real entry eligible to join the waitlist on QUOTA_FULL (REG-09)', async () => {
    // Before this, nothing ever wrote a fresh core.waitlist_entry row for a real athlete — only
    // the seed script did (the existing WAITLIST fixture above is one such row, inserted by
    // hand). A genuinely new registration attempt against an exhausted pool had no row for its
    // own "join waitlist" button to act on. WAITLIST_POOL is already 1/1 from seed().
    const frank = randomUUID();
    const frankProfile = randomUUID();
    const frankEntry = randomUUID();
    await pool.query(
      `INSERT INTO core.person (id,email,given_name,family_name,date_of_birth)
       VALUES ($1,$2,'Frank','Mutation','1985-04-02')`,
      [frank, `${frank}@example.com`],
    );
    await pool.query(`INSERT INTO core.athlete_profile (id,person_id,event_id) VALUES ($1,$2,$3)`, [
      frankProfile,
      frank,
      EVENT,
    ]);
    await pool.query(
      `INSERT INTO core.registration_entry
         (id,event_id,athlete_profile_id,sport_entry_product_id,grade,rule_version_id,status)
       VALUES ($1,$2,$3,$4,'competitive',$5,'draft')`,
      [frankEntry, EVENT, frankProfile, WAITLIST_PRODUCT, RULE_VERSION],
    );

    await expect(
      repository.saveEntry({
        registrationEntryId: frankEntry,
        sportEntryProductId: WAITLIST_PRODUCT,
        grade: 'competitive',
        idempotencyKey: randomUUID(),
        actorId: frank,
        scope: frank,
      }),
    ).rejects.toMatchObject({ code: 'QUOTA_FULL' });

    const row = await pool.query<{ id: string; status: string; position: number | null }>(
      `SELECT id, status, position FROM core.waitlist_entry WHERE quota_pool_id = $1 AND entry_id = $2`,
      [WAITLIST_POOL, frankEntry],
    );
    expect(row.rows[0]).toMatchObject({ status: 'eligible', position: null });

    // And the row is real enough for the existing join mutation to pick up and advance —
    // the whole point, since that mutation already worked, it just never had anything to act on.
    const joined = await repository.joinWaitlist({
      waitlistId: row.rows[0]!.id,
      idempotencyKey: randomUUID(),
      actorId: frank,
      scope: frank,
      requireOwner: true,
    });
    expect(joined.waitlist.status).toBe('waiting');
    expect(joined.entry.status).toBe('waitlisted');
  });
});

describe('REG-11 guarded writer', () => {
  it('has PostgreSQL refuse every non-configured state/actor edge', async () => {
    const statuses = Object.keys(TRANSITIONS) as JourneyEntryStatus[];
    const actors = ['participant', 'admin', 'system'] as const;
    for (const from of statuses) {
      await pool.query(`UPDATE core.registration_entry SET status = $2 WHERE id = $1`, [
        CAROL_ENTRY,
        from,
      ]);
      for (const to of statuses) {
        for (const actor of actors) {
          const legal = TRANSITIONS[from].some((edge) => edge.to === to && edge.actor === actor);
          if (legal) continue;
          await expect(
            pool.query(
              `INSERT INTO core.entry_status_event
                 (entry_id,from_status,to_status,actor_kind,reason)
               VALUES ($1,$2,$3,$4,'illegal-test')`,
              [CAROL_ENTRY, from, to, actor],
            ),
          ).rejects.toMatchObject({ code: '23514', constraint: 'entry_status_transition_allowed' });
        }
      }
    }
    await pool.query(`UPDATE core.registration_entry SET status = 'draft' WHERE id = $1`, [
      CAROL_ENTRY,
    ]);
  });
});

describe('waitlist mutations', () => {
  it('joins, reserves all pools for an expiring offer, releases, and claims through the common path', async () => {
    const participant = { actorId: CAROL, scope: CAROL, requireOwner: true };
    const joined = await repository.joinWaitlist({
      waitlistId: WAITLIST,
      idempotencyKey: randomUUID(),
      ...participant,
    });
    expect(joined.waitlist.status).toBe('waiting');
    expect(joined.entry.status).toBe('waitlisted');

    await pool.query(`UPDATE core.quota_pool SET confirmed = 0 WHERE id = $1`, [WAITLIST_POOL]);
    const admin = { actorId: ADMIN, scope: ADMIN, requireOwner: false };
    const offered = await repository.releaseWaitlistOffer({
      waitlistId: WAITLIST,
      idempotencyKey: randomUUID(),
      ...admin,
    });
    expect(offered.waitlist.status).toBe('offered');
    expect(offered.waitlist.offerExpiresAt).toBeTruthy();

    const expired = await repository.expireWaitlistOffer({
      waitlistId: WAITLIST,
      idempotencyKey: randomUUID(),
      ...admin,
    });
    expect(expired.waitlist.status).toBe('expired');
    expect(expired.quota.reserved).toBe(0);

    await repository.releaseWaitlistOffer({
      waitlistId: WAITLIST,
      idempotencyKey: randomUUID(),
      ...admin,
    });
    const claimed = await repository.claimWaitlistOffer({
      waitlistId: WAITLIST,
      idempotencyKey: randomUUID(),
      ...participant,
    });
    expect(claimed.waitlist.status).toBe('claimed');
    expect(claimed.entry.status).toBe('pending_payment');
    expect(claimed.quota.reserved).toBe(1);

    // CAROL_ENTRY was seeded straight into 'draft' — it never went through a successful
    // saveEntry, so before this fix there was no order row for claim to find (it only ever
    // UPDATEd one). Checkout needs a real order regardless of which path got the entry here.
    const order = await pool.query<{ status: string; gross_minor: string }>(
      `SELECT o.status, o.gross_minor
         FROM core.registration_order o
         JOIN core.order_line ol ON ol.order_id = o.id
        WHERE ol.entry_id = $1`,
      [CAROL_ENTRY],
    );
    expect(order.rows[0]).toMatchObject({ status: 'pending_payment', gross_minor: '10000' });
  });
});

describe('evidence and payment', () => {
  it('uses the guarded system transition for evidence approval', async () => {
    const saved = await repository.saveEntry({
      registrationEntryId: ERIN_ENTRY,
      sportEntryProductId: EVIDENCE_PRODUCT,
      grade: 'competitive',
      idempotencyKey: randomUUID(),
      actorId: ERIN,
      scope: ERIN,
    });
    expect(saved.entry.status).toBe('pending_evidence');
    const approved = await repository.updateEvidenceStatus({
      registrationEntryId: ERIN_ENTRY,
      evidenceStatus: 'approved',
      actorId: ERIN,
      scope: ERIN,
    });
    expect(approved.status).toBe('pending_payment');
    expect(approved.statusHistory?.at(-1)).toMatchObject({
      actor: 'system',
      status: 'pending_payment',
    });
  });

  it('commits the external key before the PSP seam and charges once on replay', async () => {
    const provider = new StubPaymentProvider();
    const repo = new PostgresRegistrationJourneyRepository(pool, undefined, provider);
    const saved = await repo.saveEntry({
      registrationEntryId: DAVE_ENTRY,
      sportEntryProductId: PAYMENT_PRODUCT,
      grade: 'competitive',
      idempotencyKey: randomUUID(),
      actorId: DAVE,
      scope: DAVE,
    });
    const key = randomUUID();
    const input = {
      orderId: saved.order!.id,
      idempotencyKey: key,
      method: 'card' as const,
      simulateFirstAttemptTimeout: false,
      actorId: DAVE,
      scope: DAVE,
    };
    const first = await repo.payOrder(input);
    const replay = await repo.payOrder(input);

    expect(first.payment.status).toBe('captured');
    expect(first.order.status).toBe('paid');
    expect(first.entry.status).toBe('confirmed');
    expect(first.order.totalAmountMinor).toBe(10_000);
    expect(provider.callCount).toBe(1);
    expect(replay).toEqual(first);

    const keyState = await pool.query<{ state: string; before_intent: boolean }>(
      `SELECT k.state, k.created_at <= pi.created_at AS before_intent
         FROM core.idempotency_key k JOIN core.payment_intent pi
           ON pi.idempotency_scope = k.scope AND pi.idempotency_key = k.key
        WHERE k.scope = $1 AND k.key = $2`,
      [DAVE, key],
    );
    expect(keyState.rows[0]).toEqual({ state: 'completed', before_intent: true });
  });
});

class FakeIdentityProvider implements IdentityProvider {
  private readonly tokens = new Map<string, AuthenticatedIdentity>();

  token(identity: AuthenticatedIdentity): string {
    const token = `mutation.${randomUUID()}`;
    this.tokens.set(token, identity);
    return token;
  }

  authenticate(): Promise<AuthenticatedIdentity | null> {
    return Promise.resolve(null);
  }
  issue(): Promise<TokenPair> {
    throw new InvalidTokenError();
  }
  verify(token: string): Promise<AuthenticatedIdentity> {
    const identity = this.tokens.get(token);
    if (!identity) throw new InvalidTokenError();
    return Promise.resolve(identity);
  }
  refresh(): Promise<TokenPair> {
    throw new InvalidTokenError();
  }
  revoke(): Promise<void> {
    return Promise.resolve();
  }
}

const fakeIdentity = new FakeIdentityProvider();

@Module({
  imports: [RegistrationModule],
  providers: [
    { provide: IDENTITY_PROVIDER, useValue: fakeIdentity },
    AuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
})
class RegistrationMutationHttpModule {}

describe('HTTP ownership', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(RegistrationMutationHttpModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it("does not let a participant transition another participant's entry", async () => {
    const bob = fakeIdentity.token({ personId: BOB, roles: ['participant'] });
    const response = await fetch(
      `${baseUrl}/v1/registration-entries/${ALICE_ENTRY}/status/withdraw`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${bob}`,
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
        },
        body: JSON.stringify({ toStatus: 'withdrawn', actor: 'participant', reason: 'not mine' }),
      },
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'REGISTRATION_ENTRY_NOT_FOUND' });
  });
});

// Keep the imported singleton live in this worker: RegistrationModule uses it for HTTP.
void appPool;
