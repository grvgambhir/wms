/**
 * Transaction helper. Commits on resolve, rolls back on throw, and passes the
 * transaction handle through so callers cannot accidentally use the pool mid-transaction.
 */
import type { Transaction } from 'kysely';
import { db } from './pool';
import type { DB } from './types';

export type DbTrx = Transaction<DB>;

export async function runInTransaction<T>(fn: (trx: DbTrx) => Promise<T>): Promise<T> {
  return db.transaction().execute(fn);
}
