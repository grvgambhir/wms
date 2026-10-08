/** Local-dev passwords from the LOGIN migrations. Production must set its own. */
import { Pool } from 'pg';

export const LOCAL_APP_RW_PASSWORD = 'wms_app';
export const LOCAL_RESTRICTED_RW_PASSWORD = 'wms_restricted';

export function databaseUrlAs(url: string, user: string, password: string): string {
  const parsed = new URL(url);
  parsed.username = user;
  parsed.password = password;
  return parsed.toString();
}

let ownerPool: Pool | undefined;
let restrictedPool: Pool | undefined;

export function testOwnerPool(): Pool {
  const url = process.env.DATABASE_OWNER_URL;
  if (!url) throw new Error('DATABASE_OWNER_URL is required in tests');
  ownerPool ??= new Pool({ connectionString: url, max: 4 });
  return ownerPool;
}

export function testRestrictedPool(): Pool {
  const url = process.env.RESTRICTED_DATABASE_URL;
  if (!url) throw new Error('RESTRICTED_DATABASE_URL is required in tests');
  restrictedPool ??= new Pool({ connectionString: url, max: 3 });
  return restrictedPool;
}

/** SET LOCAL ROLE from the owner connection — app_rw cannot become classification_ro. */
export async function asDatabaseRole(role: string, sql: string, params: unknown[] = []) {
  const client = await testOwnerPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    return await client.query(sql, params);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

export async function closeTestAuxPools(): Promise<void> {
  const closing = [ownerPool?.end(), restrictedPool?.end()];
  ownerPool = undefined;
  restrictedPool = undefined;
  await Promise.all(closing);
}
