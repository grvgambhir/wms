/**
 * PLT-04 MFA guard: GetUser enrolment on the caller token, threshold of two
 * enrolled oc_admins, and the reset path. Fake identity + fake GetUser — no AWS.
 */
import { INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthGuard } from '../src/auth/guards/auth.guard';
import { MfaGuard } from '../src/auth/guards/mfa.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import {
  IDENTITY_PROVIDER,
  InvalidTokenError,
  type AuthenticatedIdentity,
  type IdentityProvider,
  type TokenPair,
} from '../src/auth/identity/identity-provider';
import { setCognitoUserAdminForTests } from '../src/auth/identity/cognito-user-admin';
import { configureApp } from '../src/configure-app';
import { pool } from '../src/db/pool';
import {
  CALLER_MFA_SOURCE,
  setCallerMfaSourceForTests,
  type CallerMfaSource,
  type CallerMfaState,
} from '../src/people/caller-mfa';
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

class MapMfaSource implements CallerMfaSource {
  readonly enrolled = new Set<string>();

  async inspect(accessToken: string): Promise<CallerMfaState> {
    return { enrolled: this.enrolled.has(accessToken), username: 'mfa-user@example.com' };
  }
}

const fake = new FakeIdentityProvider();
const mfaSource = new MapMfaSource();
const cognitoSignOut = { calls: 0 };
const cognitoSetMfa = { calls: [] as Array<{ username: string; enabled: boolean }> };

@Module({
  imports: [PeopleModule],
  providers: [
    { provide: IDENTITY_PROVIDER, useValue: fake },
    { provide: CALLER_MFA_SOURCE, useValue: mfaSource },
    AuthGuard,
    RolesGuard,
    MfaGuard,
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
    { provide: APP_GUARD, useExisting: MfaGuard },
  ],
})
class MfaTestModule {}

let app: INestApplication | undefined;
let baseUrl: string;
let adminA: string;
let adminB: string;
let participant: string;

function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

async function insertPerson(email: string, role: string): Promise<string> {
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO core.person (email, given_name, family_name, date_of_birth, profile_status)
     VALUES ($1, 'Mfa', $2, '1980-01-01', 'complete')
     RETURNING id`,
    [email, role],
  );
  const id = inserted.rows[0]!.id;
  await pool.query(
    `INSERT INTO core.person_role (person_id, role_code, granted_by)
     VALUES ($1, $2, CASE WHEN $2 = 'participant' THEN $1 ELSE COALESCE((SELECT pr.person_id FROM core.person_role pr WHERE pr.role_code = 'oc_admin' LIMIT 1), $1) END)`,
    [id, role],
  );
  return id;
}

beforeAll(async () => {
  setCallerMfaSourceForTests(mfaSource);
  setCognitoUserAdminForTests({
    createInvitedUser: async () => ({ sub: 'sub' }),
    resendInvitation: async () => undefined,
    deleteUser: async () => undefined,
    setSoftwareTokenMfa: async (args) => {
      cognitoSetMfa.calls.push(args);
    },
    globalSignOut: async () => {
      cognitoSignOut.calls += 1;
    },
  });
  adminA = await insertPerson(`mfa.a.${randomUUID()}@example.com`, 'oc_admin');
  adminB = await insertPerson(`mfa.b.${randomUUID()}@example.com`, 'oc_admin');
  participant = await insertPerson(`mfa.p.${randomUUID()}@example.com`, 'participant');
  app = await NestFactory.create(MfaTestModule, { logger: false });
  configureApp(app);
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  setCallerMfaSourceForTests(undefined);
  setCognitoUserAdminForTests(undefined);
  await app?.close();
});

describe('OC MFA threshold', () => {
  it('stays off with one enrolled oc_admin and turns on at two', async () => {
    await pool.query(`UPDATE core.person SET mfa_enrolled_at = now() WHERE id = $1`, [adminA]);
    await pool.query(`UPDATE core.person SET mfa_enrolled_at = NULL WHERE id = $1`, [adminB]);
    const oc = fake.issueToken({ personId: adminA, roles: ['oc_admin'] });
    const athlete = fake.issueToken({ personId: participant, roles: ['participant'] });

    const me = await api('/v1/me', { headers: { authorization: `Bearer ${oc}` } });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as {
      mfa: { enrolled: boolean; enforcementActive: boolean; enrolledOcAdminCount: number };
    };
    expect(meBody.mfa.enrolled).toBe(true);
    expect(meBody.mfa.enforcementActive).toBe(false);
    expect(meBody.mfa.enrolledOcAdminCount).toBe(1);

    const allowed = await api('/v1/admin/people', { headers: { authorization: `Bearer ${oc}` } });
    expect(allowed.status).toBe(200);

    await pool.query(`UPDATE core.person SET mfa_enrolled_at = now() WHERE id = $1`, [adminB]);
    const refused = await api('/v1/admin/people', { headers: { authorization: `Bearer ${oc}` } });
    expect(refused.status).toBe(403);
    const refusedBody = (await refused.json()) as { code: string };
    expect(refusedBody.code).toBe('MFA_REQUIRED');

    const stillOk = await api('/v1/me', { headers: { authorization: `Bearer ${athlete}` } });
    expect(stillOk.status).toBe(200);

    mfaSource.enrolled.add(oc);
    const enrolledOk = await api('/v1/admin/people', { headers: { authorization: `Bearer ${oc}` } });
    expect(enrolledOk.status).toBe(200);
  });
});

describe('MFA complete, disable, and reset', () => {
  it('records enrolment, signs out globally, and refuses a self-reset', async () => {
    const token = fake.issueToken({ personId: participant, roles: ['participant'] });
    mfaSource.enrolled.add(token);
    const before = cognitoSignOut.calls;
    const complete = await api('/v1/me/mfa/complete', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(complete.status).toBe(200);
    expect(cognitoSignOut.calls).toBe(before + 1);
    const enrolled = await pool.query<{ at: Date | null }>(
      `SELECT mfa_enrolled_at AS at FROM core.person WHERE id = $1`,
      [participant],
    );
    expect(enrolled.rows[0]?.at).not.toBeNull();

    const oc = fake.issueToken({ personId: adminA, roles: ['oc_admin'] });
    mfaSource.enrolled.add(oc);
    const self = await api(`/v1/admin/people/${adminA}/mfa/reset`, {
      method: 'POST',
      headers: { authorization: `Bearer ${oc}` },
    });
    expect(self.status).toBe(403);
    const selfBody = (await self.json()) as { code: string };
    expect(selfBody.code).toBe('MFA_SELF_RESET');

    const reset = await api(`/v1/admin/people/${adminB}/mfa/reset`, {
      method: 'POST',
      headers: { authorization: `Bearer ${oc}` },
    });
    expect(reset.status).toBe(200);
    expect(cognitoSetMfa.calls.some((call) => call.enabled === false)).toBe(true);
    const audit = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM audit.activity_log
        WHERE action = 'user.mfa_reset' AND subject_id = $1 AND actor_id = $2`,
      [adminB, adminA],
    );
    expect(Number(audit.rows[0]?.n)).toBeGreaterThanOrEqual(1);

    const ocDisable = await api('/v1/me/mfa/disable', {
      method: 'POST',
      headers: { authorization: `Bearer ${oc}` },
    });
    expect(ocDisable.status).toBe(403);

    const disable = await api('/v1/me/mfa/disable', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(disable.status).toBe(200);
    const cleared = await pool.query<{ at: Date | null }>(
      `SELECT mfa_enrolled_at AS at FROM core.person WHERE id = $1`,
      [participant],
    );
    expect(cleared.rows[0]?.at).toBeNull();
  });
});
