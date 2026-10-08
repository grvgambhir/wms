/**
 * Keyset pagination (BACKEND_DB_PLAN.md §5, §6).
 *
 * OFFSET is banned on any growable list. `OFFSET 10000` makes Postgres walk and discard
 * 10,000 rows, so page 200 of an admin queue is slower than page 1 for no reason at all.
 * Keyset paging is constant-time at any depth.
 *
 * The plan says "keyset on (created_at, id)" and separately that "UUIDv7 keys sort
 * chronologically, so id alone is a valid cursor". Both are true and they are not the same
 * design — writing this made the choice explicit:
 *
 *   We page on (created_at, id), not id alone.
 *
 * UUIDv7 embeds the generation timestamp, so id-only ordering matches insertion order.
 * But `created_at` is what the UI sorts and filters by, and for migrated rows — the ~15k
 * EOI records of REG-13 — `created_at` is the ORIGINAL registration time while the id is
 * generated at migration time. Those two orders disagree for exactly the rows Track D
 * imports. Paging on the id alone would show migrated participants in the order we
 * happened to import them, which is not a meaningful order to anyone.
 *
 * `id` remains in the key as the tiebreaker: `created_at` is not unique (a bulk insert
 * shares a timestamp), and a keyset without a unique tail either skips rows or repeats
 * them at the page boundary.
 */

export interface Cursor {
  /** ISO-8601 UTC — the `created_at` of the last row on the previous page. */
  at: string;
  /** UUID of that row. Breaks ties within the same timestamp. */
  id: string;
}

export interface Page<T> {
  items: T[];
  cursor?: string;
  /** Present only when explicitly requested; see `withTotal` in the plan's §5. */
  total?: number;
}

export type SortDirection = 'asc' | 'desc';

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

export class InvalidCursorError extends Error {
  readonly code = 'INVALID_CURSOR';
  constructor() {
    super('The pagination cursor is malformed or expired.');
    this.name = 'InvalidCursorError';
  }
}

/**
 * Cursors are opaque to clients: base64url of the tuple. Not encrypted — they carry no
 * secret, only a position the client already has — but opaque so nobody builds a client
 * that constructs them by hand and pins us to this shape forever.
 */
export function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.at}|${c.id}`, 'utf8').toString('base64url');
}

export function decodeCursor(raw: string | undefined): Cursor | undefined {
  if (!raw) return undefined;
  let decoded: string;
  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    throw new InvalidCursorError();
  }
  const sep = decoded.indexOf('|');
  if (sep <= 0) throw new InvalidCursorError();

  const at = decoded.slice(0, sep);
  const id = decoded.slice(sep + 1);

  // Validate rather than trust: a cursor reaches SQL, and a malformed one should be a
  // 400 at the edge, not a database error halfway through a query.
  if (Number.isNaN(Date.parse(at))) throw new InvalidCursorError();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new InvalidCursorError();
  }
  return { at, id };
}

export function clampLimit(requested: unknown): number {
  const n = typeof requested === 'string' ? Number.parseInt(requested, 10) : Number(requested);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.trunc(n), MAX_LIMIT);
}

export interface KeysetClause {
  /** `` AND (t.created_at, t.id) < ($1, $2) `` — empty string on the first page. */
  where: string;
  /** `` ORDER BY t.created_at DESC, t.id DESC `` */
  orderBy: string;
  /** `` LIMIT $3 `` — always fetches limit + 1 to detect a next page without a COUNT. */
  limit: number;
  params: unknown[];
}

/**
 * Builds the keyset fragment.
 *
 * Uses ROW COMPARISON — `(created_at, id) < ($1, $2)` — not the expanded
 * `created_at < $1 OR (created_at = $1 AND id < $2)`. Postgres can drive a composite index
 * directly from the row form; the expanded OR usually degrades into a bitmap scan, which
 * is the exact cost keyset paging exists to avoid.
 *
 * `nextParamIndex` lets the caller compose this after its own filters.
 */
export function keysetClause(args: {
  table: string;
  cursor?: Cursor;
  limit?: unknown;
  direction?: SortDirection;
  nextParamIndex?: number;
}): KeysetClause {
  const { table, cursor, direction = 'desc' } = args;
  const limit = clampLimit(args.limit);
  let i = args.nextParamIndex ?? 1;
  const params: unknown[] = [];

  let where = '';
  if (cursor) {
    const op = direction === 'desc' ? '<' : '>';
    where = ` AND (${table}.created_at, ${table}.id) ${op} ($${i}, $${i + 1})`;
    params.push(cursor.at, cursor.id);
    i += 2;
  }

  const dir = direction.toUpperCase();
  return {
    where,
    orderBy: ` ORDER BY ${table}.created_at ${dir}, ${table}.id ${dir}`,
    // limit + 1: the extra row tells us a next page exists. Asking COUNT(*) for that
    // is what makes an otherwise-fine admin list feel slow.
    limit: limit + 1,
    params,
  };
}

/** Trims the sentinel row and emits the cursor for the next page. */
export function toPage<T extends { id: string; created_at: Date | string }>(
  rows: T[],
  requestedLimit: unknown,
): Page<T> {
  const limit = clampLimit(requestedLimit);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  if (!hasMore || items.length === 0) return { items };

  const last = items[items.length - 1];
  if (!last) return { items };
  const at = last.created_at instanceof Date ? last.created_at.toISOString() : String(last.created_at);
  return { items, cursor: encodeCursor({ at, id: last.id }) };
}

/**
 * Required index for any table paged this way. Without it the ORDER BY sorts the whole
 * filtered set on every page and keyset paging buys nothing — the plan's <200ms admin-page
 * budget silently stops holding.
 *
 *   CREATE INDEX ON core.<table> (created_at DESC, id DESC);
 *   -- or, when a filter is always applied:
 *   CREATE INDEX ON core.<table> (<filter_col>, created_at DESC, id DESC);
 *
 * The filter column comes FIRST: a composite index is only usable from its leading edge.
 */
export const REQUIRED_INDEX_NOTE = '(filter_col, created_at DESC, id DESC)';
