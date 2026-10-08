/**
 * Runs in each vitest worker. Points DATABASE_URL at the throwaway DB created
 * in globalSetup *before* any src/ import (env.ts parses once).
 */
import { existsSync } from 'node:fs';
import { afterAll, inject } from 'vitest';
import { databaseUrlAs, LOCAL_RESTRICTED_RW_PASSWORD } from './db-url';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

// Provided by globalSetup for THIS run — see the note there on why this is not a file.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.DATABASE_OWNER_URL = inject('ownerDatabaseUrl');
process.env.RESTRICTED_DATABASE_URL = databaseUrlAs(
  process.env.DATABASE_URL,
  'restricted_rw',
  LOCAL_RESTRICTED_RW_PASSWORD,
);
process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT ?? '3050';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'error';
// CI supplies the commit SHA. Keep the contract observable in local tests too.
process.env.GIT_SHA = process.env.GIT_SHA ?? 'test-git-sha';
// Harness-only. env.ts has no JWT_SECRET default; production boot still fails if unset.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = 'test-jwt-secret-not-for-production-use';
}
// Existing auth.spec.ts is the local provider. Cognito tests construct their own provider.
process.env.AUTH_PROVIDER = 'local';

afterAll(async () => {
  try {
    const { closeDb } = await import('../src/db/pool');
    await closeDb();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log('Test pool close:', message);
  }
  try {
    const { closeTestAuxPools } = await import('./db-url');
    await closeTestAuxPools();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log('Test aux pool close:', message);
  }
});
