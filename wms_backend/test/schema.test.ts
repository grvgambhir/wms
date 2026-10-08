/**
 * Asserts the bootstrap migration created the four schemas on real Postgres.
 */
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool';
import { runInTransaction } from '../src/db/transaction';

describe('bootstrap migration', () => {
  it('creates core, restricted, ops and audit schemas', async () => {
    const result = await pool.query<{ schema_name: string }>(
      `SELECT schema_name
         FROM information_schema.schemata
        WHERE schema_name IN ('core', 'restricted', 'ops', 'audit')
        ORDER BY schema_name`,
    );
    expect(result.rows.map((row) => row.schema_name)).toEqual([
      'audit',
      'core',
      'ops',
      'restricted',
    ]);
  });

  it('runInTransaction rolls back on throw', async () => {
    await expect(
      runInTransaction(async (trx) => {
        await sql`INSERT INTO core.locale (code, name) VALUES ('zz-trx', 'Probe')`.execute(trx);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const leftover = await pool.query(
      `SELECT 1 FROM core.locale WHERE code = 'zz-trx'`,
    );
    expect(leftover.rows).toHaveLength(0);
  });
});
