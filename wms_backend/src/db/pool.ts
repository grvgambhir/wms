/**
 * Ordinary pg.Pool and Kysely instance for the process (`app_rw`).
 * Restricted evidence uses a separate pool that authenticates as
 * `restricted_rw` — that pool is created only by the evidence module.
 * Pool size comes from config; callers that need a transaction use runInTransaction.
 */
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { env } from '../config/env';
import type { DB } from './types';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
});

export const db = new Kysely<DB>({
  dialect: new PostgresDialect({ pool }),
});

/** Closes the Kysely instance and the underlying pool. Used on process shutdown. */
export async function closeDb(): Promise<void> {
  await db.destroy();
}
