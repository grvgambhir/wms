/**
 * A real Nest boot, not a mocked module. This is deliberately part of the
 * normal suite because DI/factory failures are otherwise invisible to unit
 * tests that never instantiate AppModule.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

let app: INestApplication;
let baseUrl: string;

describe('application boot smoke', () => {
  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    app.enableShutdownHooks();
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') throw new Error('Smoke-test server did not bind a TCP port.');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('starts the real module graph and reports a live, ready service', async () => {
    const [health, ready] = await Promise.all([
      fetch(`${baseUrl}/v1/health`),
      fetch(`${baseUrl}/v1/ready`),
    ]);

    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, db: 'ok', gitSha: 'test-git-sha' });
    expect(ready.status).toBe(200);
    expect(await ready.json()).toMatchObject({ ok: true, db: 'ok', migrations: 'latest' });
  });

  it('fails boot when the required restricted connection is removed', () => {
    // env.ts loads .env from the child process CWD. A fresh temporary CWD
    // lets this exercise the same real AppModule without mutating this run.
    // Keep this below the backend root so Node can resolve the project's tsx
    // loader, while still ensuring env.ts cannot find the root .env file.
    const cwd = mkdtempSync(join(process.cwd(), 'test/.boot-smoke-'));
    try {
      const output = execFileSync(
        process.execPath,
        ['--import', 'tsx', join(process.cwd(), 'test/boot-smoke-missing-env-child.ts')],
        {
          cwd,
          env: {
            ...process.env,
            DATABASE_URL: 'postgres://app_rw:wms_app@127.0.0.1:5432/wms_test',
            PORT: '3051',
            NODE_ENV: 'test',
            LOG_LEVEL: 'error',
            AUTH_PROVIDER: 'local',
            JWT_SECRET: 'test-jwt-secret-not-for-production-use',
            GIT_SHA: 'test-git-sha',
            RESTRICTED_DATABASE_URL: '',
          },
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      throw new Error(`Expected boot to fail, but it succeeded: ${output}`);
    } catch (error: unknown) {
      const details =
        error instanceof Error
          ? [
              error.message,
              String((error as { stdout?: string }).stdout ?? ''),
              String((error as { stderr?: string }).stderr ?? ''),
            ].join('\n')
          : String(error);
      expect(details).toContain(
        'RESTRICTED_DATABASE_URL is required because the restricted evidence module is enabled',
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
