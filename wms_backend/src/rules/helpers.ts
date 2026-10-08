import type { Queryable } from '../common/idempotency/idempotency.service';
import { refuse } from '../people/refuse';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export function asIsoDate(value: Date | string | null | undefined): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function asNumber(value: string | number | null | undefined): number | undefined {
  if (value == null) return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function rethrowFrozen(err: unknown): never {
  const message = err instanceof Error ? err.message : '';
  if (/frozen/i.test(message)) refuse('RULE_VERSION_FROZEN', 'rules.version.frozen');
  throw err;
}

export async function contentHash(db: Queryable, versionId: string): Promise<string> {
  const { rows } = await db.query<{ hash: string }>(
    `SELECT encode(sha256(convert_to(
              coalesce((SELECT string_agg(d.ordinal || ':' || d.attribute || ':' || d.bands::text, '|'
                                          ORDER BY d.ordinal)
                          FROM core.rule_dimension d WHERE d.rule_version_id = $1), '')
           || '#'
           || coalesce((SELECT string_agg(e.ordinal || ':' || e.predicate || ':' || e.params::text, '|'
                                          ORDER BY e.ordinal)
                          FROM core.rule_eligibility e WHERE e.rule_version_id = $1), ''),
              'UTF8')), 'hex') AS hash`,
    [versionId],
  );
  return rows[0]?.hash ?? '';
}
