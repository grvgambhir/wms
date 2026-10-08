/**
 * One throwaway Postgres database per vitest run.
 *
 * The URL reaches the workers through vitest's `provide`/`inject` channel rather than a file.
 * It used to be written to `test/.tmp-database-url`, which worked for one run and silently
 * broke two: the path is fixed, so a second concurrent suite overwrote the first one's URL and
 * its workers then ran against the other run's database. The failures looked like flaky tests.
 * `provide` is scoped to the run, so concurrent suites cannot see each other's value.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import type { TestProject } from 'vitest/node';
import { databaseUrlAs, LOCAL_APP_RW_PASSWORD } from './db-url';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    ownerDatabaseUrl: string;
  }
}

function withDatabase(url: string, dbName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

export default async function globalSetup(project: TestProject): Promise<() => Promise<void>> {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
  const ownerUrl = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;
  if (!ownerUrl) {
    throw new Error('DATABASE_OWNER_URL is required to run tests (copy .env.example to .env)');
  }

  const dbName = `wms_test_${process.pid}_${Date.now()}`;
  const testOwnerUrl = withDatabase(ownerUrl, dbName);
  const testApplicationUrl = databaseUrlAs(testOwnerUrl, 'app_rw', LOCAL_APP_RW_PASSWORD);
  const migrateBin = join(process.cwd(), 'node_modules/node-pg-migrate/bin/node-pg-migrate.js');

  const admin = new Client({ connectionString: ownerUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  execFileSync(process.execPath, [migrateBin, 'up', '-m', 'migrations'], {
    env: { ...process.env, DATABASE_URL: testOwnerUrl },
    stdio: 'inherit',
  });

  // Tests exercise the application as app_rw. The owner is only used to make
  // and migrate the throwaway database, exactly as in production operations.
  // Role-switching assertions (classification_ro, accommodation_ro) still need
  // the owner — those roles are NOLOGIN and app_rw is not a member.
  project.provide('databaseUrl', testApplicationUrl);
  project.provide('ownerDatabaseUrl', testOwnerUrl);

  return async () => {
    const drop = new Client({ connectionString: ownerUrl });
    await drop.connect();
    await drop.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await drop.end();
  };
}
