/**
 * Accreditation desk on the real database. Gates are configuration
 * (`accreditation_gate.requires`); issuing names the unmet gate.
 */
import { INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccreditationModule } from '../src/accreditation/accreditation.module';
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
  imports: [AccreditationModule],
  providers: [
    { provide: IDENTITY_PROVIDER, useValue: fake },
    AuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
})
class AccreditationTestModule {}

let app: INestApplication;
let baseUrl: string;

const EVENT = randomUUID();
const ATHLETE = randomUUID();
const OTHER = randomUUID();
const OC = randomUUID();
const READY = randomUUID();
const BLOCKED = randomUUID();

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

async function boot(): Promise<void> {
  app = await NestFactory.create(AccreditationTestModule, { logger: false });
  configureApp(app);
  await app.listen(0);
  baseUrl = await app.getUrl();
}

async function seedGraph(): Promise<void> {
  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1, 'como-acc', 'Como Lake 2027', '2027-09-17', '2027-09-26', '2027-12-31')`,
    [EVENT],
  );
  await pool.query(
    `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth, nationality)
     VALUES ($1, $2, 'Dana', 'Athlete', '1985-03-14', 'GB'),
            ($3, $4, 'Omar', 'Other', '1988-07-02', 'IT'),
            ($5, $6, 'Oc', 'Staff', '1970-01-01', 'IT')`,
    [ATHLETE, `acc.${ATHLETE}@example.com`, OTHER, `acc.${OTHER}@example.com`, OC, `oc.${OC}@example.com`],
  );
  await pool.query(
    `INSERT INTO core.accreditation_gate (event_id, role, requires)
     VALUES ($1, 'Athlete', '{photo,eligibility}')`,
    [EVENT],
  );
  await pool.query(
    `INSERT INTO core.accreditation
       (id, event_id, person_id, role, sport_name, zones, photo_status, eligibility_status,
        status, valid_from, valid_until)
     VALUES
       ($1, $3, $4, 'Athlete', 'Tennis', '{"field-of-play","athlete-lounge"}', 'approved', 'approved',
        'pending', '2027-09-17', '2027-09-26'),
       ($2, $3, $5, 'Athlete', 'Tennis', '{"field-of-play"}', 'approved', 'pending',
        'pending', '2027-09-17', '2027-09-26')`,
    [READY, BLOCKED, EVENT, ATHLETE, OTHER],
  );
}

beforeAll(async () => {
  await seedGraph();
  await boot();
});

afterAll(async () => {
  if (app) await app.close();
});

describe('gates are data', () => {
  it('changing gate configuration changes the issue outcome with no code change', async () => {
    const oc = fake.issueToken({ personId: OC, roles: ['oc_staff'] });

    const refused = await api(`/v1/accreditations/${BLOCKED}/issue`, {
      method: 'POST',
      headers: mutationHeaders(oc),
    });
    expect(refused.status).toBe(422);
    const refusedBody = (await refused.json()) as { code: string; errors?: { gate?: string; gates?: string } };
    expect(refusedBody.code).toBe('NOT_ELIGIBLE_TO_ISSUE');
    expect(refusedBody.errors?.gate).toBe('eligibility');
    expect(refusedBody.errors?.gates).toContain('eligibility');

    await pool.query(
      `UPDATE core.accreditation_gate SET requires = '{photo}' WHERE event_id = $1 AND role = 'Athlete'`,
      [EVENT],
    );

    const allowed = await api(`/v1/accreditations/${BLOCKED}/issue`, {
      method: 'POST',
      headers: mutationHeaders(oc),
    });
    expect(allowed.status).toBe(200);
    const allowedBody = (await allowed.json()) as { record: { id: string; status: string; badgeNumber?: string } };
    expect(allowedBody.record.id).toBe(BLOCKED);
    expect(allowedBody.record.status).toBe('issued');
    expect(allowedBody.record.badgeNumber).toMatch(/^COMO27-\d{6}$/);

    await pool.query(
      `UPDATE core.accreditation_gate SET requires = '{photo,eligibility}' WHERE event_id = $1 AND role = 'Athlete'`,
      [EVENT],
    );
  });
});

describe('own pass vs desk queue', () => {
  it('a participant can read their own pass and is refused the desk queue', async () => {
    const athlete = fake.issueToken({ personId: ATHLETE, roles: ['participant'] });
    const oc = fake.issueToken({ personId: OC, roles: ['oc_staff'] });

    const own = await api('/v1/me/accreditation', {
      headers: { authorization: `Bearer ${athlete}` },
    });
    expect(own.status).toBe(200);
    const pass = (await own.json()) as { id: string; athleteId: string };
    expect(pass.athleteId).toBe(ATHLETE);

    const scoped = await pool.query<{ id: string; person_id: string }>(
      `SELECT id, person_id FROM core.accreditation WHERE person_id = $1`,
      [ATHLETE],
    );
    expect(scoped.rows.every((row) => row.person_id === ATHLETE)).toBe(true);
    expect(scoped.rows.some((row) => row.id === pass.id)).toBe(true);

    const otherOwned = await pool.query<{ id: string }>(
      `SELECT id FROM core.accreditation WHERE id = $1 AND person_id = $2`,
      [BLOCKED, ATHLETE],
    );
    expect(otherOwned.rows).toHaveLength(0);

    const deskAsParticipant = await api('/v1/accreditation-desk', {
      headers: { authorization: `Bearer ${athlete}` },
    });
    expect(deskAsParticipant.status).toBe(403);

    const desk = await api('/v1/accreditation-desk', {
      headers: { authorization: `Bearer ${oc}` },
    });
    expect(desk.status).toBe(200);
    const overview = (await desk.json()) as { records: { items: Array<{ id: string }>; total: number } };
    expect(overview.records.total).toBeGreaterThanOrEqual(2);
    expect(overview.records.items.some((item) => item.id === BLOCKED)).toBe(true);
  });
});

describe('issue, revoke, reissue', () => {
  it('leaves a readable history with actor and reason', async () => {
    const oc = fake.issueToken({ personId: OC, roles: ['oc_staff'] });

    const issued = await api(`/v1/accreditations/${READY}/issue`, {
      method: 'POST',
      headers: mutationHeaders(oc),
    });
    expect(issued.status).toBe(200);
    const issuedBody = (await issued.json()) as {
      record: { status: string; badgeNumber?: string; athleteId: string };
    };
    expect(issuedBody.record.status).toBe('issued');
    const firstBadge = issuedBody.record.badgeNumber;
    expect(firstBadge).toMatch(/^COMO27-\d{6}$/);

    const stored = await pool.query<{ qr_value: string | null; given_name: string; email: string | null }>(
      `SELECT a.qr_value, p.given_name, p.email
         FROM core.accreditation a
         JOIN core.person p ON p.id = a.person_id
        WHERE a.id = $1`,
      [READY],
    );
    const qr = stored.rows[0]?.qr_value ?? '';
    expect(qr).toMatch(/^[0-9a-f-]{36}$/i);
    expect(qr.toLowerCase()).not.toContain((stored.rows[0]?.given_name ?? '').toLowerCase());
    expect(qr).not.toContain(stored.rows[0]?.email ?? 'never');

    const revoked = await api(`/v1/accreditations/${READY}/revoke`, {
      method: 'POST',
      headers: mutationHeaders(oc),
      body: JSON.stringify({ reason: 'accreditation.revoked.lost_badge' }),
    });
    expect(revoked.status).toBe(200);
    expect(((await revoked.json()) as { record: { status: string; revokedReason?: string } }).record.revokedReason).toBe(
      'accreditation.revoked.lost_badge',
    );

    const reissued = await api(`/v1/accreditations/${READY}/reissue`, {
      method: 'POST',
      headers: mutationHeaders(oc),
    });
    expect(reissued.status).toBe(200);
    const reissuedBody = (await reissued.json()) as { record: { status: string; badgeNumber?: string } };
    expect(reissuedBody.record.status).toBe('issued');
    expect(reissuedBody.record.badgeNumber).toMatch(/^COMO27-\d{6}$/);
    expect(reissuedBody.record.badgeNumber).not.toBe(firstBadge);

    const history = await pool.query<{ action: string; actor_id: string; after: unknown }>(
      `SELECT action, actor_id, after
         FROM audit.activity_log
        WHERE subject_id = $1 AND subject_type = 'accreditation'
        ORDER BY occurred_at`,
      [READY],
    );
    expect(history.rows.map((row) => row.action)).toEqual([
      'accreditation.issue',
      'accreditation.revoke',
      'accreditation.reissue',
    ]);
    expect(history.rows.every((row) => row.actor_id === OC)).toBe(true);
    expect(JSON.stringify(history.rows[1]?.after)).toContain('accreditation.revoked.lost_badge');
  });
});

describe('restart survival', () => {
  it('an issued badge is still there after the process restarts', async () => {
    const athlete = fake.issueToken({ personId: ATHLETE, roles: ['participant'] });
    const oc = fake.issueToken({ personId: OC, roles: ['oc_staff'] });

    const before = await api('/v1/me/accreditation', {
      headers: { authorization: `Bearer ${athlete}` },
    });
    const beforeBody = (await before.json()) as { id: string; status: string; badgeNumber?: string };
    expect(beforeBody.status).toBe('issued');
    const badge = beforeBody.badgeNumber;
    expect(badge).toBeTruthy();

    await app.close();
    await boot();

    const afterPass = await api('/v1/me/accreditation', {
      headers: { authorization: `Bearer ${athlete}` },
    });
    expect(afterPass.status).toBe(200);
    const afterBody = (await afterPass.json()) as { status: string; badgeNumber?: string };
    expect(afterBody.status).toBe('issued');
    expect(afterBody.badgeNumber).toBe(badge);

    const desk = await api('/v1/accreditation-desk', {
      headers: { authorization: `Bearer ${oc}` },
    });
    const overview = (await desk.json()) as { records: { items: Array<{ id: string; badgeNumber?: string }> } };
    expect(overview.records.items.find((item) => item.id === READY)?.badgeNumber).toBe(badge);
  });
});
