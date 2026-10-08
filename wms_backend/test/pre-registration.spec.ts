/**
 * GET/POST /v1/me/pre-registrations — masked lookup, identity from the token.
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
import { PeopleModule } from '../src/people/people.module';

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
  imports: [PeopleModule],
  providers: [
    { provide: IDENTITY_PROVIDER, useValue: fake },
    AuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
})
class PreRegistrationTestModule {}

let app: INestApplication;
let baseUrl: string;
let eventId: string;

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

async function insertPerson(email = `prereg.${randomUUID()}@example.com`): Promise<string> {
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO core.person (email, given_name, family_name, date_of_birth, profile_status)
     VALUES ($1, 'Claim', 'Tester', '1980-01-01', 'complete')
     RETURNING id`,
    [email],
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error('person insert failed');
  return id;
}

async function insertPreRegistration(args: {
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: string;
  reference?: string;
  status?: 'unclaimed' | 'claimed';
  claimedBy?: string;
}): Promise<string> {
  const reference = args.reference ?? `TEST-EOI-${randomUUID().slice(0, 8)}`;
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO core.pre_registration
       (event_id, reference, first_name, last_name, email, date_of_birth,
        nationality, intended_sports, source_list, status, claimed_by, claimed_at,
        migration_batch)
     VALUES ($1, $2, $3, $4, $5, $6, 'GB', ARRAY['Tennis'], 'legacy-test',
             $7, $8, $9, $10)
     RETURNING id`,
    [
      eventId,
      reference,
      args.firstName,
      args.lastName,
      args.email,
      args.dateOfBirth,
      args.status ?? 'unclaimed',
      args.claimedBy ?? null,
      args.status === 'claimed' ? new Date().toISOString() : null,
      randomUUID(),
    ],
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error('pre-registration insert failed');
  return id;
}

beforeAll(async () => {
  const event = await pool.query<{ id: string }>(`SELECT core.current_event_id() AS id`);
  if (event.rows[0]?.id) {
    eventId = event.rows[0].id;
  } else {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO core.event (slug, name, starts_on, ends_on, age_reference_date, status)
       VALUES ($1, 'Pre-registration Event', '2027-09-17', '2027-09-26', '2027-12-31', 'registration_open')
       RETURNING id`,
      [`prereg-${randomUUID()}`],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error('event insert failed');
    eventId = id;
  }

  app = await NestFactory.create(PreRegistrationTestModule, { logger: false });
  configureApp(app);
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app.close();
});

describe('me pre-registrations', () => {
  it('looks up by reference or email and never returns the full name or exact DOB', async () => {
    const personId = await insertPerson();
    const token = fake.issueToken({ personId, roles: ['participant'] });
    const reference = `TEST-EOI-${randomUUID().slice(0, 8)}`;
    const email = `zelda.${randomUUID().slice(0, 8)}@example.com`;
    await insertPreRegistration({
      firstName: 'Zelda',
      lastName: 'Quxworth',
      email,
      dateOfBirth: '1966-07-04',
      reference,
    });

    const byRef = await api(`/v1/me/pre-registrations?query=${encodeURIComponent(reference)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(byRef.status).toBe(200);
    const refBody = (await byRef.json()) as {
      outcome: string;
      preview: Record<string, unknown>;
    };
    expect(refBody.outcome).toBe('found');
    expect(refBody.preview.maskedName).toBe('Z••• Q•••');
    expect(refBody.preview.maskedEmail).toBe(`z••••@example.com`);
    expect(refBody.preview.birthYear).toBe(1966);
    expect(refBody.preview).not.toHaveProperty('dateOfBirth');
    expect(refBody.preview).not.toHaveProperty('firstName');
    expect(refBody.preview).not.toHaveProperty('lastName');
    expect(refBody.preview).not.toHaveProperty('email');
    const previewJson = JSON.stringify(refBody.preview);
    expect(previewJson).not.toMatch(/1966-07-04/);
    expect(previewJson).not.toContain('Zelda Quxworth');
    expect(previewJson).not.toContain(email);

    const byEmail = await api(
      `/v1/me/pre-registrations?query=${encodeURIComponent(email.toUpperCase())}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(byEmail.status).toBe(200);
    expect(((await byEmail.json()) as { outcome: string }).outcome).toBe('found');

    const missing = await api('/v1/me/pre-registrations?query=no-such-record', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(missing.status).toBe(200);
    const missingBody = (await missing.json()) as { outcome: string; preview?: unknown };
    expect(missingBody.outcome).toBe('not_found');
    expect(missingBody).not.toHaveProperty('preview');
  });

  it('keeps found, already_claimed, and not_found distinguishable', async () => {
    const personId = await insertPerson();
    const token = fake.issueToken({ personId, roles: ['participant'] });
    const claimant = await insertPerson();
    const openRef = `TEST-EOI-${randomUUID().slice(0, 8)}`;
    const claimedRef = `TEST-EOI-${randomUUID().slice(0, 8)}`;
    await insertPreRegistration({
      firstName: 'Open',
      lastName: 'Record',
      email: `open.${randomUUID()}@example.com`,
      dateOfBirth: '1985-03-14',
      reference: openRef,
    });
    await insertPreRegistration({
      firstName: 'Giulia',
      lastName: 'Moretti',
      email: `claimed.${randomUUID()}@example.com`,
      dateOfBirth: '1990-01-11',
      reference: claimedRef,
      status: 'claimed',
      claimedBy: claimant,
    });

    const found = await api(`/v1/me/pre-registrations?query=${encodeURIComponent(openRef)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const already = await api(`/v1/me/pre-registrations?query=${encodeURIComponent(claimedRef)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const missing = await api('/v1/me/pre-registrations?query=   ', {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(((await found.json()) as { outcome: string }).outcome).toBe('found');
    const alreadyBody = (await already.json()) as {
      outcome: string;
      preview: { maskedName: string; status: string };
    };
    expect(alreadyBody.outcome).toBe('already_claimed');
    expect(alreadyBody.preview.maskedName).toBe('G••• M•••');
    expect(alreadyBody.preview.status).toBe('claimed');
    expect(((await missing.json()) as { outcome: string }).outcome).toBe('not_found');
  });

  it('refuses a second claim by the same person via the unique index', async () => {
    const personId = await insertPerson();
    const token = fake.issueToken({ personId, roles: ['participant'] });
    const firstId = await insertPreRegistration({
      firstName: 'First',
      lastName: 'Eoi',
      email: `first.${randomUUID()}@example.com`,
      dateOfBirth: '1982-02-02',
    });
    const secondId = await insertPreRegistration({
      firstName: 'Second',
      lastName: 'Eoi',
      email: `second.${randomUUID()}@example.com`,
      dateOfBirth: '1983-03-03',
    });

    const first = await api(`/v1/me/pre-registrations/${firstId}/claim`, {
      method: 'POST',
      headers: mutationHeaders(token),
      body: JSON.stringify({}),
    });
    expect(first.status).toBe(200);

    const second = await api(`/v1/me/pre-registrations/${secondId}/claim`, {
      method: 'POST',
      headers: mutationHeaders(token),
      body: JSON.stringify({}),
    });
    expect(second.status).toBe(409);
    const problem = (await second.json()) as { code: string };
    expect(problem.code).toBe('ONE_CLAIM_PER_PERSON');

    const held = await pool.query<{ id: string; claimed_by: string }>(
      `SELECT id, claimed_by::text AS claimed_by
         FROM core.pre_registration
        WHERE claimed_by = $1`,
      [personId],
    );
    expect(held.rows).toHaveLength(1);
    expect(held.rows[0]?.id).toBe(firstId);
    expect(held.rows[0]?.claimed_by).toBe(personId);
  });

  it('does not double-write on a repeated Idempotency-Key', async () => {
    const personId = await insertPerson();
    const token = fake.issueToken({ personId, roles: ['participant'] });
    const recordId = await insertPreRegistration({
      firstName: 'Idem',
      lastName: 'Potent',
      email: `idem.${randomUUID()}@example.com`,
      dateOfBirth: '1979-09-09',
    });
    const key = randomUUID();

    const first = await api(`/v1/me/pre-registrations/${recordId}/claim`, {
      method: 'POST',
      headers: mutationHeaders(token, key),
      body: JSON.stringify({}),
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      alreadyClaimed: boolean;
      record: { claimedAt?: string; firstName: string };
    };
    expect(firstBody.alreadyClaimed).toBe(false);
    expect(firstBody.record.firstName).toBe('Idem');

    const second = await api(`/v1/me/pre-registrations/${recordId}/claim`, {
      method: 'POST',
      headers: mutationHeaders(token, key),
      body: JSON.stringify({}),
    });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as {
      alreadyClaimed: boolean;
      record: { claimedAt?: string };
    };
    expect(secondBody.alreadyClaimed).toBe(false);
    expect(secondBody.record.claimedAt).toBe(firstBody.record.claimedAt);

    const count = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM core.pre_registration WHERE id = $1 AND status = 'claimed'`,
      [recordId],
    );
    expect(count.rows[0]?.n).toBe('1');
  });

  it('claims with the token person even when the body names someone else — asserted in SQL', async () => {
    const personA = await insertPerson();
    const personB = await insertPerson();
    const tokenA = fake.issueToken({ personId: personA, roles: ['participant'] });
    const recordId = await insertPreRegistration({
      firstName: 'Owned',
      lastName: 'ByA',
      email: `owned.${randomUUID()}@example.com`,
      dateOfBirth: '1984-04-04',
    });

    const claim = await api(`/v1/me/pre-registrations/${recordId}/claim`, {
      method: 'POST',
      headers: mutationHeaders(tokenA),
      body: JSON.stringify({ personId: personB, claimedBy: personB, claimed_by: personB }),
    });
    expect(claim.status).toBe(200);

    const row = await pool.query<{ claimed_by: string; status: string }>(
      `SELECT claimed_by::text AS claimed_by, status
         FROM core.pre_registration
        WHERE id = $1`,
      [recordId],
    );
    expect(row.rows[0]?.status).toBe('claimed');
    expect(row.rows[0]?.claimed_by).toBe(personA);
    expect(row.rows[0]?.claimed_by).not.toBe(personB);
  });
});
