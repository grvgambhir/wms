/**
 * CognitoIdentityProvider — real aws-jwt-verify against a local RSA JWKS.
 * Does not call AWS. AUTH_PROVIDER remains local for test/auth.spec.ts.
 */
import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import { generateKeyPairSync, randomUUID, type KeyObject } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { Roles } from '../src/auth/decorators/roles.decorator';
import { AuthGuard } from '../src/auth/guards/auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { CognitoIdentityProvider } from '../src/auth/identity/cognito.identity-provider';
import { IDENTITY_PROVIDER, InvalidTokenError } from '../src/auth/identity/identity-provider';
import { LoginRateLimiter } from '../src/auth/login-rate-limiter';
import { configureApp } from '../src/configure-app';
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

const REGION = 'eu-south-1';
const USER_POOL_ID = 'eu-south-1_LocalTest0';
const PARTICIPANT_CLIENT = 'localtestparticipantcli001';
const ADMIN_CLIENT = 'localtestadminclientid002';
const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`;
const KID_A = 'test-key-1';
const KID_B = 'test-key-2';

const { publicKey: publicA, privateKey: privateA } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const { privateKey: privateB } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

function jwkFrom(publicKey: KeyObject, kid: string): Record<string, string> {
  const jwk = publicKey.export({ format: 'jwk' });
  return {
    kty: jwk.kty ?? 'RSA',
    n: jwk.n ?? '',
    e: jwk.e ?? '',
    kid,
    use: 'sig',
    alg: 'RS256',
  };
}

let jwks: { keys: Array<Record<string, string>> };
let jwksServer: Server;
let jwksUrl = '';
let provider: CognitoIdentityProvider;
let app: INestApplication;
let baseUrl = '';

function signAccess(
  opts: {
    sub?: string;
    clientId?: string;
    tokenUse?: string;
    issuer?: string;
    kid?: string;
    key?: KeyObject;
    expiresIn?: number;
    notBefore?: number;
    extra?: Record<string, unknown>;
  } = {},
): string {
  const sub = opts.sub ?? randomUUID();
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub,
      token_use: opts.tokenUse ?? 'access',
      client_id: opts.clientId ?? PARTICIPANT_CLIENT,
      username: sub,
      version: 2,
      jti: randomUUID(),
      origin_jti: randomUUID(),
      auth_time: now,
      scope: 'aws.cognito.signin.user.admin',
      ...opts.extra,
    },
    opts.key ?? privateA,
    {
      algorithm: 'RS256',
      keyid: opts.kid ?? KID_A,
      issuer: opts.issuer ?? ISSUER,
      expiresIn: opts.expiresIn ?? 3600,
      ...(opts.notBefore !== undefined ? { notBefore: opts.notBefore } : {}),
    },
  );
}

function algNone(sub: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT', kid: KID_A })).toString(
    'base64url',
  );
  const payload = Buffer.from(
    JSON.stringify({
      sub,
      token_use: 'access',
      client_id: PARTICIPANT_CLIENT,
      iss: ISSUER,
      iat: now,
      exp: now + 3600,
    }),
  ).toString('base64url');
  return `${header}.${payload}.`;
}

function tamper(token: string): string {
  const parts = token.split('.');
  const header = parts[0];
  const payloadB64 = parts[1];
  const sig = parts[2];
  if (!header || !payloadB64 || !sig) throw new Error('token');
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as Record<
    string,
    unknown
  >;
  payload.sub = randomUUID();
  return `${header}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${sig}`;
}

function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

function bearer(accessToken: string): Record<string, string> {
  return { authorization: `Bearer ${accessToken}` };
}

async function me(token: string): Promise<Response> {
  return api('/v1/auth/me', { headers: bearer(token) });
}

function makeProvider(onFetch: () => void = () => undefined): CognitoIdentityProvider {
  return new CognitoIdentityProvider({
    region: REGION,
    userPoolId: USER_POOL_ID,
    clientIdParticipant: PARTICIPANT_CLIENT,
    clientIdAdmin: ADMIN_CLIENT,
    fetchJwks: async () => {
      onFetch();
      const res = await fetch(jwksUrl);
      if (!res.ok) throw new Error('jwks fetch failed');
      return res.arrayBuffer();
    },
  });
}

@Module({
  controllers: [AuthController, AuthProbeController, HealthController],
  providers: [
    { provide: IDENTITY_PROVIDER, useFactory: () => provider },
    LoginRateLimiter,
    AuthService,
    AuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
})
class CognitoAuthTestModule {}

beforeAll(async () => {
  jwks = { keys: [jwkFrom(publicA, KID_A)] };
  jwksServer = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(jwks));
  });
  await new Promise<void>((resolve) => {
    jwksServer.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = jwksServer.address() as AddressInfo;
  jwksUrl = `http://127.0.0.1:${addr.port}/.well-known/jwks.json`;

  provider = makeProvider();
  app = await NestFactory.create(CognitoAuthTestModule, { logger: false });
  configureApp(app);
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app.close();
  await new Promise<void>((resolve, reject) => {
    jwksServer.close((err) => (err ? reject(err) : resolve()));
  });
});

describe('Cognito identity provider', () => {
  it('links a person on the first valid access token and records the app client', async () => {
    const sub = randomUUID();
    const res = await me(signAccess({ sub, clientId: PARTICIPANT_CLIENT }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      givenName: string;
      familyName: string;
      roles: string[];
    };
    expect(body.givenName).toBe('Pending');
    expect(body.familyName).toBe('User');
    expect(body.roles).toEqual([]);

    const row = await pool.query<{ idp_subject: string | null; email: string | null }>(
      `SELECT idp_subject, email::text AS email FROM core.person WHERE id = $1`,
      [body.id],
    );
    expect(row.rows[0]?.idp_subject).toBe(sub);
    expect(row.rows[0]?.email).toBeNull();

    const identity = await provider.verify(signAccess({ sub, clientId: PARTICIPANT_CLIENT }));
    expect(identity.personId).toBe(body.id);
    expect(identity.client).toBe('participant');
  });

  it('records the admin client without linking on email', async () => {
    const email = `desk.${randomUUID()}@example.com`;
    const desk = await pool.query<{ id: string }>(
      `INSERT INTO core.person (email, given_name, family_name, date_of_birth)
       VALUES ($1, 'Desk', 'Created', '1980-01-01')
       RETURNING id`,
      [email],
    );
    const deskId = desk.rows[0]?.id;
    if (!deskId) throw new Error('desk person insert failed');

    const sub = randomUUID();
    const identity = await provider.verify(signAccess({ sub, clientId: ADMIN_CLIENT }));
    expect(identity.client).toBe('admin');
    expect(identity.personId).not.toBe(deskId);

    const deskRow = await pool.query<{ idp_subject: string | null }>(
      `SELECT idp_subject FROM core.person WHERE id = $1`,
      [deskId],
    );
    expect(deskRow.rows[0]?.idp_subject).toBeNull();
  });

  it('reads roles from person_role, not from token claims', async () => {
    const sub = randomUUID();
    const person = await pool.query<{ id: string }>(
      `INSERT INTO core.person (idp_subject, given_name, family_name, date_of_birth)
       VALUES ($1, 'Role', 'User', '1980-01-01')
       RETURNING id`,
      [sub],
    );
    const personId = person.rows[0]?.id;
    if (!personId) throw new Error('person insert failed');
    await pool.query(
      `INSERT INTO core.person_role (person_id, role_code, granted_by)
       VALUES ($1, 'oc_admin', COALESCE((SELECT pr.person_id FROM core.person_role pr WHERE pr.role_code = 'oc_admin' LIMIT 1), $1))`,
      [personId],
    );

    const token = signAccess({
      sub,
      extra: { roles: ['participant'], 'cognito:groups': ['finance'] },
    });
    const allowed = await api('/v1/auth-probe/admin', { headers: bearer(token) });
    expect(allowed.status).toBe(200);

    const meRes = await me(token);
    const meBody = (await meRes.json()) as { roles: string[] };
    expect(meBody.roles).toEqual(['oc_admin']);
    expect(meBody.roles).not.toContain('participant');
    expect(meBody.roles).not.toContain('finance');
  });

  it('rejects token groups when the database has no matching role', async () => {
    const sub = randomUUID();
    await pool.query(
      `INSERT INTO core.person (idp_subject, given_name, family_name, date_of_birth)
       VALUES ($1, 'No', 'Role', '1980-01-01')`,
      [sub],
    );
    const token = signAccess({
      sub,
      extra: { roles: ['oc_admin'], 'cognito:groups': ['oc_admin'] },
    });
    const res = await api('/v1/auth-probe/admin', { headers: bearer(token) });
    expect(res.status).toBe(403);
  });

  it('returns the same 401 body for every verification failure', async () => {
    const sub = randomUUID();
    const validShape = signAccess({ sub });
    const failures = await Promise.all([
      me(
        signAccess({
          sub,
          issuer: 'https://cognito-idp.eu-south-1.amazonaws.com/eu-south-1_Other1',
        }),
      ),
      me(signAccess({ sub, clientId: 'not-one-of-our-clients-0001' })),
      me(signAccess({ sub, tokenUse: 'id' })),
      me(signAccess({ sub, expiresIn: -60 })),
      me(tamper(validShape)),
      me(algNone(sub)),
      me(signAccess({ sub, kid: KID_B, key: privateB })),
      me(signAccess({ sub, notBefore: 3600 })),
    ]);
    for (const res of failures) {
      expect(res.status).toBe(401);
    }
    // Every refusal carries its own request id; nothing else may differ between them, or the
    // body itself would tell an attacker which check failed.
    const bodies = await Promise.all(
      failures.map(async (res) => {
        const { requestId: _ignored, ...rest } = (await res.json()) as Record<string, unknown>;
        return JSON.stringify(rest);
      }),
    );
    expect(new Set(bodies).size).toBe(1);
  });

  it('unknown kid triggers exactly one JWKS refetch, then rejects', async () => {
    let fetches = 0;
    const isolated = makeProvider(() => {
      fetches += 1;
    });
    await isolated.verify(signAccess({ sub: randomUUID() }));
    expect(fetches).toBe(1);

    const before = fetches;
    await expect(
      isolated.verify(signAccess({ sub: randomUUID(), kid: KID_B, key: privateB })),
    ).rejects.toBeInstanceOf(InvalidTokenError);
    expect(fetches - before).toBe(1);

    await expect(
      isolated.verify(signAccess({ sub: randomUUID(), kid: KID_B, key: privateB })),
    ).rejects.toBeInstanceOf(InvalidTokenError);
    expect(fetches - before).toBe(1);
  });

  it('does not issue or refresh tokens — that is Cognito', async () => {
    const login = await api('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'anyone@example.com', password: 'nope' }),
    });
    expect(login.status).toBe(401);
    const refresh = await api('/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: 'cognito-would-hold-this' }),
    });
    expect(refresh.status).toBe(401);
  });
});
