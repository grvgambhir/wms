/**
 * Temporary auth — real Postgres, throwaway database from globalSetup.
 */
import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { hash as argon2Hash } from 'argon2';
import { createHmac, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthModule } from '../src/auth/auth.module';
import { Roles } from '../src/auth/decorators/roles.decorator';
import { ARGON2_OPTIONS } from '../src/auth/identity/argon2-options';
import { LoginRateLimiter } from '../src/auth/login-rate-limiter';
import { configureApp } from '../src/configure-app';
import { env } from '../src/config/env';
import { pool } from '../src/db/pool';
import { HealthController } from '../src/health/health.controller';

@Controller('auth-probe')
class AuthProbeController {
  @Get('admin')
  @Roles('oc_admin')
  admin(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  imports: [AuthModule],
  controllers: [AuthProbeController, HealthController],
})
class AuthTestModule {}

const PASSWORD = 'correct-horse-battery';

let app: INestApplication;
let baseUrl: string;
let limiter: LoginRateLimiter;

async function insertUser(email: string, role: string, password = PASSWORD): Promise<string> {
  const hash = await argon2Hash(password, ARGON2_OPTIONS);
  const person = await pool.query<{ id: string }>(
    `INSERT INTO core.person (email, given_name, family_name, date_of_birth)
     VALUES ($1, 'Test', 'User', '1985-06-01')
     RETURNING id`,
    [email],
  );
  const id = person.rows[0]?.id;
  if (!id) throw new Error('person insert failed');
  await pool.query(
    `INSERT INTO core.user_credential (person_id, email, password_hash)
     VALUES ($1, $2, $3)`,
    [id, email, hash],
  );
  await pool.query(
    `INSERT INTO core.person_role (person_id, role_code, granted_by)
     VALUES ($1, $2, CASE WHEN $2 = 'participant' THEN $1 ELSE COALESCE((SELECT pr.person_id FROM core.person_role pr WHERE pr.role_code = 'oc_admin' LIMIT 1), $1) END)`,
    [id, role],
  );
  return id;
}

function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

function login(email: string, password: string): Promise<Response> {
  return api('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

function bearer(accessToken: string): Record<string, string> {
  return { authorization: `Bearer ${accessToken}` };
}

function forgeJwt(header: object, payload: object, secret: string): string {
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

beforeAll(async () => {
  app = await NestFactory.create(AuthTestModule, { logger: false });
  configureApp(app);
  await app.listen(0);
  baseUrl = await app.getUrl();
  limiter = app.get(LoginRateLimiter);
});

beforeEach(() => {
  limiter.reset();
});

afterAll(async () => {
  await app.close();
});

/** Problem bodies now carry a per-request id; compare everything else. */
async function withoutRequestId(res: Response): Promise<Record<string, unknown>> {
  const { requestId: _ignored, ...rest } = (await res.json()) as Record<string, unknown>;
  return rest;
}

describe('temporary auth', () => {
  it('logs in a known user and returns tokens without email or name', async () => {
    const email = 'auth.login.ok@example.com';
    const personId = await insertUser(email, 'participant');
    const res = await login(email, PASSWORD);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accessToken: string; refreshToken: string };
    expect(body.accessToken.length).toBeGreaterThan(20);
    expect(body.refreshToken.length).toBeGreaterThan(20);

    const payload = jwt.decode(body.accessToken) as Record<string, unknown>;
    expect(payload.sub).toBe(personId);
    expect(payload.roles).toEqual(['participant']);
    expect(payload.jti).toEqual(expect.any(String));
    expect(payload.iat).toEqual(expect.any(Number));
    expect(payload.exp).toEqual(expect.any(Number));
    expect(payload).not.toHaveProperty('email');
    expect(payload).not.toHaveProperty('name');
    expect(payload).not.toHaveProperty('givenName');
  });

  it('rejects a wrong password', async () => {
    const email = 'auth.login.badpw@example.com';
    await insertUser(email, 'participant');
    const res = await login(email, 'definitely-wrong');
    expect(res.status).toBe(401);
  });

  it('returns the same status and body for unknown email and wrong password', async () => {
    const email = 'auth.login.same@example.com';
    await insertUser(email, 'participant');
    const unknown = await login('auth.nosuch.user@example.com', 'definitely-wrong');
    const wrong = await login(email, 'definitely-wrong');
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    // The request id differs per request by design; the rest of the body must not.
    expect(await withoutRequestId(unknown)).toEqual(await withoutRequestId(wrong));
  });

  it('rejects an expired access token', async () => {
    const personId = await insertUser('auth.expired@example.com', 'participant');
    const token = jwt.sign(
      { sub: personId, roles: ['participant'], jti: randomUUID() },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: -1 },
    );
    const res = await api(' /v1/auth/me'.trim(), { headers: bearer(token) });
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const personId = await insertUser('auth.wrongsecret@example.com', 'participant');
    const token = jwt.sign(
      { sub: personId, roles: ['participant'], jti: randomUUID() },
      'other-secret-not-the-real-one-at-all!!',
      { algorithm: 'HS256', expiresIn: '15m' },
    );
    const res = await api('/v1/auth/me', { headers: bearer(token) });
    expect(res.status).toBe(401);
  });

  it('rejects a token with a tampered alg header', async () => {
    const personId = await insertUser('auth.tamperalg@example.com', 'participant');
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: personId,
      roles: ['participant'],
      jti: randomUUID(),
      iat: now,
      exp: now + 900,
    };
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.`;
    const rs256 = forgeJwt({ alg: 'RS256', typ: 'JWT' }, payload, env.JWT_SECRET);
    expect((await api('/v1/auth/me', { headers: bearer(none) })).status).toBe(401);
    expect((await api('/v1/auth/me', { headers: bearer(rs256) })).status).toBe(401);
  });

  it('rotates the refresh token and revokes the family on reuse', async () => {
    const email = 'auth.refresh@example.com';
    await insertUser(email, 'participant');
    const first = (await (await login(email, PASSWORD)).json()) as {
      accessToken: string;
      refreshToken: string;
    };

    const rotatedRes = await api('/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: first.refreshToken }),
    });
    expect(rotatedRes.status).toBe(200);
    const rotated = (await rotatedRes.json()) as { accessToken: string; refreshToken: string };
    expect(rotated.refreshToken).not.toBe(first.refreshToken);
    expect(rotated.accessToken).not.toBe(first.accessToken);

    const reuse = await api('/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: first.refreshToken }),
    });
    expect(reuse.status).toBe(401);

    const newAlsoDead = await api('/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: rotated.refreshToken }),
    });
    expect(newAlsoDead.status).toBe(401);
  });

  it('rejects a participant on @Roles(oc_admin) with 403', async () => {
    const email = 'auth.roles.participant@example.com';
    await insertUser(email, 'participant');
    const { accessToken } = (await (await login(email, PASSWORD)).json()) as {
      accessToken: string;
    };
    const res = await api('/v1/auth-probe/admin', { headers: bearer(accessToken) });
    expect(res.status).toBe(403);
  });

  it('allows an oc_admin through @Roles(oc_admin)', async () => {
    const email = 'auth.roles.admin@example.com';
    await insertUser(email, 'oc_admin');
    const { accessToken } = (await (await login(email, PASSWORD)).json()) as {
      accessToken: string;
    };
    const res = await api('/v1/auth-probe/admin', { headers: bearer(accessToken) });
    expect(res.status).toBe(200);
  });

  it('returns 401 for a route with no @Public and no token', async () => {
    const res = await api('/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('rate-limits login at the 6th attempt', async () => {
    const email = 'auth.ratelimit@example.com';
    await insertUser(email, 'participant');
    const attempts = [];
    for (let i = 0; i < 6; i += 1) {
      attempts.push(await login(email, 'wrong-password'));
    }
    expect(attempts.slice(0, 5).every((res) => res.status === 401)).toBe(true);
    const sixth = attempts[5];
    expect(sixth?.status).toBe(429);
  });

  it('keeps /v1/health public', async () => {
    const res = await api('/v1/health');
    expect(res.status).toBe(200);
  });

  it('answers a CORS preflight from the participant web origin', async () => {
    const res = await api('/v1/me/profile', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:8081',
        'Access-Control-Request-Method': 'PATCH',
        'Access-Control-Request-Headers': 'authorization,content-type,idempotency-key',
      },
    });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:8081');
    const allowHeaders = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase();
    expect(allowHeaders).toContain('authorization');
    expect(allowHeaders).toContain('idempotency-key');
  });
});
