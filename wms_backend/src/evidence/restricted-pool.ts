/**
 * Restricted evidence authenticates as restricted_rw. The ordinary pool must
 * never be used as a fallback — that would undo the boundary silently.
 *
 * Only RestrictedEvidenceService may inject the pool token. A second consumer
 * is a conversation, not a refactor.
 */
import { Pool } from 'pg';
import { env } from '../config/env';

export const RESTRICTED_POOL = Symbol('RestrictedPool');

export const RESTRICTED_POOL_MAX = 3;

const MISSING_URL =
  'RESTRICTED_DATABASE_URL is required because the restricted evidence module is enabled. There is no fallback to DATABASE_URL.';

const MUST_BE_RESTRICTED_RW =
  'RESTRICTED_DATABASE_URL must authenticate as restricted_rw. There is no fallback to DATABASE_URL.';

export function restrictedDatabaseUrlOrThrow(url: string | undefined): string {
  if (!url) {
    throw new Error(MISSING_URL);
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('RESTRICTED_DATABASE_URL must be a postgres:// or postgresql:// URL');
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('RESTRICTED_DATABASE_URL must be a postgres:// or postgresql:// URL');
  }
  if (decodeURIComponent(parsed.username) !== 'restricted_rw') {
    throw new Error(MUST_BE_RESTRICTED_RW);
  }
  return url;
}

export function createRestrictedPool(url: string | undefined = env.RESTRICTED_DATABASE_URL): Pool {
  return new Pool({
    connectionString: restrictedDatabaseUrlOrThrow(url),
    max: RESTRICTED_POOL_MAX,
  });
}
