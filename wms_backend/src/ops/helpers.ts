import type { Queryable } from '../common/idempotency/idempotency.service';
import { refuse } from '../people/refuse';

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function headerKey(headers: { [key: string]: string | string[] | undefined }): string {
  const raw = headers['idempotency-key'];
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0].trim();
  return '';
}

export function requireUuid(value: string | undefined, key: string): string {
  if (!value || !UUID_RE.test(value)) refuse('VALIDATION_ERROR', key);
  return value;
}

export function asIso(value: Date | string | null | undefined): string {
  if (value == null) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function personName(db: Queryable, personId: string): Promise<string> {
  const { rows } = await db.query<{ given_name: string; family_name: string }>(
    `SELECT given_name, family_name FROM core.person WHERE id = $1`,
    [personId],
  );
  const row = rows[0];
  return row ? `${row.given_name} ${row.family_name}`.trim() : personId;
}
