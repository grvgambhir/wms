/**
 * GET/POST /v1/me/consents — append-only history, identity from the token.
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
class ConsentTestModule {}

let app: INestApplication;
let baseUrl: string;

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

async function insertPerson(): Promise<string> {
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO core.person (email, given_name, family_name, date_of_birth, profile_status)
     VALUES ($1, 'Consent', 'Tester', '1980-01-01', 'complete')
     RETURNING id`,
    [`consent.${randomUUID()}@example.com`],
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error('person insert failed');
  return id;
}

beforeAll(async () => {
  app = await NestFactory.create(ConsentTestModule, { logger: false });
  configureApp(app);
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app.close();
});

describe('me consents', () => {
  it('grant then withdraw then grant leaves a readable history', async () => {
    const personId = await insertPerson();
    const token = fake.issueToken({ personId, roles: ['participant'] });

    const empty = await api('/v1/me/consents', { headers: { authorization: `Bearer ${token}` } });
    expect(empty.status).toBe(200);
    const emptyBody = (await empty.json()) as {
      items: Array<{ kind: string; status: string; required: boolean }>;
    };
    expect(emptyBody.items).toHaveLength(5);
    expect(emptyBody.items.find((item) => item.kind === 'terms_and_conditions')?.status).toBe(
      'withdrawn',
    );
    expect(emptyBody.items.find((item) => item.kind === 'terms_and_conditions')?.required).toBe(
      true,
    );

    const grant = await api('/v1/me/consents', {
      method: 'POST',
      headers: mutationHeaders(token),
      body: JSON.stringify({ kind: 'terms_and_conditions', granted: true, version: 'T&C v1.2' }),
    });
    expect(grant.status).toBe(200);
    const granted = (await grant.json()) as { status: string; policyVersion: string };
    expect(granted.status).toBe('granted');
    expect(granted.policyVersion).toBe('T&C v1.2');

    const withdraw = await api('/v1/me/consents', {
      method: 'POST',
      headers: mutationHeaders(token),
      body: JSON.stringify({ kind: 'terms_and_conditions', granted: false, version: 'T&C v1.2' }),
    });
    expect(withdraw.status).toBe(200);
    expect(((await withdraw.json()) as { status: string }).status).toBe('withdrawn');

    const regrant = await api('/v1/me/consents', {
      method: 'POST',
      headers: mutationHeaders(token),
      body: JSON.stringify({ kind: 'terms_and_conditions', granted: true, version: 'T&C v1.2' }),
    });
    expect(regrant.status).toBe(200);
    expect(((await regrant.json()) as { status: string }).status).toBe('granted');

    const history = await pool.query<{ granted: boolean; version: string }>(
      `SELECT granted, version FROM core.consent
        WHERE person_id = $1 AND kind = 'terms_and_conditions'
        ORDER BY occurred_at`,
      [personId],
    );
    expect(history.rows.map((row) => row.granted)).toEqual([true, false, true]);
    expect(history.rows.every((row) => row.version === 'T&C v1.2')).toBe(true);
  });

  it('does not double-write on a repeated Idempotency-Key', async () => {
    const personId = await insertPerson();
    const token = fake.issueToken({ personId, roles: ['participant'] });
    const key = randomUUID();
    const payload = { kind: 'privacy_policy', granted: true, version: 'Privacy v3.0' };
    const first = await api('/v1/me/consents', {
      method: 'POST',
      headers: mutationHeaders(token, key),
      body: JSON.stringify(payload),
    });
    expect(first.status).toBe(200);
    const second = await api('/v1/me/consents', {
      method: 'POST',
      headers: mutationHeaders(token, key),
      body: JSON.stringify(payload),
    });
    expect(second.status).toBe(200);
    const count = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM core.consent
        WHERE person_id = $1 AND kind = 'privacy_policy'`,
      [personId],
    );
    expect(count.rows[0]?.n).toBe('1');
  });

  it('scopes reads and writes to the token person — asserted in SQL', async () => {
    const personA = await insertPerson();
    const personB = await insertPerson();
    const tokenA = fake.issueToken({ personId: personA, roles: ['participant'] });
    const tokenB = fake.issueToken({ personId: personB, roles: ['participant'] });

    const grant = await api('/v1/me/consents', {
      method: 'POST',
      headers: mutationHeaders(tokenA),
      body: JSON.stringify({
        kind: 'marketing_communications',
        granted: true,
        personId: personB,
      }),
    });
    expect(grant.status).toBe(200);

    const written = await pool.query<{ person_id: string }>(
      `SELECT person_id FROM core.consent
        WHERE kind = 'marketing_communications'
          AND person_id IN ($1, $2)`,
      [personA, personB],
    );
    expect(written.rows.map((row) => row.person_id)).toEqual([personA]);
    expect(written.rows.some((row) => row.person_id === personB)).toBe(false);

    const bList = await api('/v1/me/consents', {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(bList.status).toBe(200);
    const bBody = (await bList.json()) as {
      items: Array<{ kind: string; status: string; participantId: string }>;
    };
    expect(bBody.items.every((item) => item.participantId === personB)).toBe(true);
    expect(bBody.items.find((item) => item.kind === 'marketing_communications')?.status).toBe(
      'withdrawn',
    );

    const bWrite = await api('/v1/me/consents', {
      method: 'POST',
      headers: mutationHeaders(tokenB),
      body: JSON.stringify({ kind: 'marketing_communications', granted: true }),
    });
    expect(bWrite.status).toBe(200);
    const owners = await pool.query<{ person_id: string }>(
      `SELECT DISTINCT person_id FROM core.consent
        WHERE kind = 'marketing_communications'
          AND person_id IN ($1, $2)
        ORDER BY person_id`,
      [personA, personB],
    );
    expect(owners.rows.map((row) => row.person_id).sort()).toEqual([personA, personB].sort());
  });
});
