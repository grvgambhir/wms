/**
 * Compare on-disk SQL migrations against the `pgmigrations` table so /v1/ready
 * and `npm run migrate:status` share one definition of "latest".
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export type Querier = {
  query: (sql: string) => Promise<{ rows: Array<{ name: string }> }>;
};

export type MigrationStatus = {
  applied: string[];
  pending: string[];
  latest: boolean;
};

const MIGRATIONS_DIR = join(__dirname, '../../migrations');

export function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .map((file) => file.replace(/\.sql$/, ''))
    .sort();
}

export async function getMigrationStatus(querier: Querier): Promise<MigrationStatus> {
  const files = listMigrationFiles();
  let applied: string[] = [];
  try {
    const result = await querier.query('SELECT name FROM pgmigrations ORDER BY run_on, id');
    applied = result.rows.map((row) => row.name);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes('pgmigrations')) {
      throw err;
    }
  }
  const appliedSet = new Set(applied);
  const pending = files.filter((name) => !appliedSet.has(name));
  return { applied, pending, latest: pending.length === 0 && applied.length === files.length };
}
