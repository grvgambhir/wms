/**
 * CLI for `npm run migrate:status`. Prints applied vs pending SQL migrations.
 */
import { Client } from 'pg';
import { env } from '../src/config/env';
import { getMigrationStatus } from '../src/db/migrations';

async function main(): Promise<void> {
  // The migrations table belongs to the owner; the application role has no grant on it.
  const client = new Client({
    connectionString: process.env.DATABASE_OWNER_URL ?? env.DATABASE_URL,
  });
  await client.connect();
  try {
    const status = await getMigrationStatus(client);
    console.log('Applied:', status.applied.length ? status.applied.join(', ') : '(none)');
    console.log('Pending:', status.pending.length ? status.pending.join(', ') : '(none)');
    console.log('Latest:', status.latest);
  } finally {
    await client.end();
  }
}

void main();
