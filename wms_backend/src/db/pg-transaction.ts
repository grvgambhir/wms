/**
 * pg-client transactions for IdempotencyService, whose Queryable is `query(sql, params)`
 * — Kysely's Transaction is a different shape and cannot be passed in.
 */
import type { Queryable } from '../common/idempotency/idempotency.service';
import { pool } from './pool';

export async function runPgTransaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // connection already gone
    }
    throw err;
  } finally {
    client.release();
  }
}
