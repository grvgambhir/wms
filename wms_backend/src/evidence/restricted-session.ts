/**
 * Restricted schema access. `restricted` is a permission boundary (PRV-04):
 * the connection that reads it must *authenticate* as `restricted_rw`.
 * SET ROLE from app_rw is not a boundary — anything that can execute SQL as
 * app_rw would then be one statement from medical records.
 *
 * Callers pass the restricted pool (injected only into the restricted evidence
 * module). Each call is its own transaction so the read and its access_log
 * row commit or roll back together.
 */
import type { Pool } from 'pg';
import type { Queryable } from '../common/idempotency/idempotency.service';

export async function runRestricted<T>(
  restrictedPool: Pool,
  fn: (tx: Queryable) => Promise<T>,
): Promise<T> {
  const client = await restrictedPool.connect();
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
