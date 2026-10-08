/**
 * Before this, a running instance could not be identified (`gitSha` was always null) and two log
 * lines could not be tied to one request. These tests pin the replacement: a request id on every
 * response and refusal, a build stamp on health, and counters an operator can read.
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
import { routeShape } from '../src/common/logging/request-logging.middleware';
import { configureApp } from '../src/configure-app';
import { HealthController, MetricsController } from '../src/health/health.controller';
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
  controllers: [HealthController, MetricsController],
  providers: [
    { provide: IDENTITY_PROVIDER, useValue: fake },
    AuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
})
class ObservabilityTestModule {}

let app: INestApplication;
let baseUrl: string;
let ocToken: string;
let participantToken: string;

const OC = randomUUID();
const PARTICIPANT = randomUUID();

beforeAll(async () => {
  for (const [id, name] of [
    [OC, 'Ops'],
    [PARTICIPANT, 'Athlete'],
  ] as const) {
    await pool.query(
      `INSERT INTO core.person (id, given_name, family_name, date_of_birth, profile_status)
       VALUES ($1, $2, 'Observed', '1980-01-01', 'complete')`,
      [id, name],
    );
  }
  ocToken = fake.issueToken({ personId: OC, roles: ['oc_admin'] });
  participantToken = fake.issueToken({ personId: PARTICIPANT, roles: ['participant'] });

  app = await NestFactory.create(ObservabilityTestModule, { logger: false });
  configureApp(app);
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app.close();
});

describe('request ids', () => {
  it('returns a request id on a successful response', async () => {
    const res = await fetch(`${baseUrl}/v1/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toMatch(/[0-9a-f-]{16,}/);
  });

  it('keeps an inbound request id so a proxy trace stays one trace', async () => {
    const res = await fetch(`${baseUrl}/v1/health`, {
      headers: { 'x-request-id': 'trace-from-the-edge' },
    });
    expect(res.headers.get('x-request-id')).toBe('trace-from-the-edge');
  });

  it('puts the request id in a refusal body, so it can be quoted in support', async () => {
    const res = await fetch(`${baseUrl}/v1/metrics`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { requestId?: string };
    expect(body.requestId).toBe(res.headers.get('x-request-id'));
  });
});

describe('build identification', () => {
  it('health reports the build that is running', async () => {
    const body = (await (await fetch(`${baseUrl}/v1/health`)).json()) as {
      version: string;
      buildId: string | null;
      builtAt: string | null;
    };
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    // `npm run build` stamps dist/build-info.json; an unbuilt checkout says null rather than lying.
    if (body.buildId !== null) {
      expect(body.buildId).toMatch(/^[0-9a-f]{12}$/);
      expect(body.builtAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });
});

describe('metrics', () => {
  it('counts requests by route shape and status class, and is OC-only', async () => {
    const forbidden = await fetch(`${baseUrl}/v1/metrics`, {
      headers: { authorization: `Bearer ${participantToken}` },
    });
    expect(forbidden.status).toBe(403);

    await fetch(`${baseUrl}/v1/health`);
    const res = await fetch(`${baseUrl}/v1/metrics`, {
      headers: { authorization: `Bearer ${ocToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      requests: number;
      byStatusClass: Record<string, number>;
      byRoute: Record<string, { count: number; totalMs: number; errors: number }>;
      uptimeSeconds: number;
    };
    expect(body.requests).toBeGreaterThan(0);
    expect(body.byStatusClass['2xx']).toBeGreaterThan(0);
    expect(body.byRoute['/v1/health']!.count).toBeGreaterThan(0);
    expect(body.byRoute['/v1/health']!.totalMs).toBeGreaterThan(0);
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('groups a route by its shape, not by the ids in it', () => {
    // Otherwise 20,000 entries produce 20,000 "routes" and the counters are useless.
    expect(routeShape(`/v1/registration-entries/${randomUUID()}?x=1`)).toBe(
      '/v1/registration-entries/:id',
    );
  });
});
