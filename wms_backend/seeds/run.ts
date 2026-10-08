/**
 * CLI for `npm run seed` / `npm run seed:reset`.
 * Refuses NODE_ENV=production. Does not live in migrations/.
 */
import { Pool } from 'pg';
import { resetDemo, seedDemo } from './demo';
import { applySeedLogins } from './seed-logins';
import {
  restoreIdentities,
  snapshotIdentities,
  type IdentitySnapshot,
} from './preserve-identities';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed when NODE_ENV=production');
    process.exit(1);
  }
  // Seeding truncates, inserts across every schema and restores identities: owner work, not
  // something the least-privilege application role can or should do.
  const url = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_OWNER_URL (or DATABASE_URL) is required');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url, max: 4 });
  const reset = process.argv.includes('--reset');
  try {
    let identities: IdentitySnapshot | null = null;
    if (reset) {
      // Real Cognito logins and their role grants survive the reset — see preserve-identities.ts.
      identities = await snapshotIdentities(pool);
      await resetDemo(pool);
      console.log('Demo tables truncated');
    }
    await seedDemo(pool);
    console.log('Como Lake 2027 demo seed loaded');
    if (identities) await restoreIdentities(pool, identities);
    // Last, so .env is authoritative over whatever the snapshot brought back.
    await applySeedLogins(pool);
  } finally {
    await pool.end();
  }
}

void main();
