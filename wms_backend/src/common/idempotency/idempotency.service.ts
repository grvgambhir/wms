/**
 * Idempotency for mutations (PAY-04, and every registration mutation in @wms/domain,
 * whose request types already carry `idempotencyKey`).
 *
 * WHY THIS FILE IS NOT OBVIOUS
 * ----------------------------
 * BACKEND_DB_PLAN.md §4.6 describes the pattern as "insert the key first, in the same
 * transaction as the work". That is correct ONLY when the work is confined to Postgres.
 * The moment a mutation has an external side effect — charging a card — a single
 * transaction cannot span it, because the PSP call commits outside the database and a
 * rollback cannot undo it.
 *
 * So there are two modes, and using the wrong one is the bug that double-charges:
 *
 *   LOCAL   the whole mutation is DB work. Key row and work share one transaction.
 *           A crash rolls back both, leaving no trace, and the retry is clean.
 *
 *   EXTERNAL the mutation calls out (Stripe). The key row is COMMITTED as `in_progress`
 *           BEFORE the call, so a crash mid-call leaves evidence that the attempt
 *           happened. Recovery is reconciliation against the PSP using the same key —
 *           never a blind retry. `resolveStuck()` below is that path.
 *
 * CONCURRENCY, precisely
 * ----------------------
 * Two requests arrive with the same key. The second INSERT blocks on the primary key
 * until the first transaction ends, then:
 *   - first committed  -> unique violation. We must ROLLBACK before reading, because a
 *                         failed statement poisons the transaction; the read of the
 *                         stored response happens in a NEW transaction.
 *   - first rolled back -> our INSERT succeeds and we proceed. Correct: nothing happened.
 *
 * We never wait on an `in_progress` row. Blocking would hold a connection for the length
 * of someone else's PSP call, and 2,000 concurrent claimants would exhaust the pool. A
 * duplicate that arrives mid-flight gets 409 + Retry-After.
 *
 * SCOPE — a security property, not a detail
 * -----------------------------------------
 * The key is scoped to the caller. A globally-namespaced key lets one caller guess or
 * collide with another's key and receive THAT CALLER'S stored response body, which for a
 * registration or payment is a personal-data leak. `scope` is the authenticated person's
 * id (or a signed session id for pre-auth flows). Two callers may legitimately use the
 * same client-generated key.
 */

import { createHash } from 'node:crypto';

/** Kysely/pg transaction handle — kept structural so this file has no framework import. */
export interface Queryable {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
}

export interface RunInTransaction {
  <T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
}

export type IdempotencyMode = 'local' | 'external';

export interface StoredResponse {
  status: number;
  body: unknown;
  /** Set only on the duplicate path; not persisted as part of the HTTP body. */
  replayed?: boolean;
}

interface KeyRow {
  scope: string;
  key: string;
  endpoint: string;
  request_hash: string;
  state: 'in_progress' | 'completed';
  response_status: number | null;
  response_body: unknown;
}

export class IdempotencyError extends Error {
  constructor(
    readonly code:
      'IDEMPOTENCY_KEY_REQUIRED' | 'IDEMPOTENCY_KEY_REUSED' | 'IDEMPOTENCY_IN_PROGRESS',
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'IdempotencyError';
  }
}

/** Stable hash of the request body, so the same key with a different body is caught. */
export function hashRequest(endpoint: string, body: unknown): string {
  return createHash('sha256')
    .update(`${endpoint}\n${canonicalJson(body)}`)
    .digest('hex');
}

/**
 * Deterministic JSON: object keys sorted at every level. `JSON.stringify` preserves
 * insertion order, so two semantically identical bodies can hash differently and a
 * legitimate retry would be rejected as a reuse.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

const UNIQUE_VIOLATION = '23505';
/** PRIMARY KEY (scope, key) on core.idempotency_key. */
const IDEMPOTENCY_KEY_PKEY = 'idempotency_key_pkey';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION
  );
}

/**
 * Only the idempotency-key primary key is a replay. A 23505 from a domain unique
 * index (one-claim-per-person, live entry, …) must reach the problem-details
 * filter — swallowing it here would turn a constraint refusal into a false replay.
 */
function isIdempotencyKeyCollision(err: unknown): boolean {
  if (!isUniqueViolation(err)) return false;
  const constraint = (err as { constraint?: string }).constraint;
  return constraint === IDEMPOTENCY_KEY_PKEY;
}

export class IdempotencyService {
  constructor(
    private readonly runInTransaction: RunInTransaction,
    private readonly pool: Queryable,
    /** How long an `in_progress` row may sit before `resolveStuck` may claim it. */
    private readonly staleAfterSeconds = 120,
  ) {}

  /**
   * Run `work` at most once for (scope, key).
   *
   * `work` receives the transaction handle in LOCAL mode so its writes commit atomically
   * with the key row. In EXTERNAL mode it receives the pool: the key is already committed,
   * and the caller is responsible for passing the same key to the external system.
   */
  async execute<T extends StoredResponse>(
    args: {
      scope: string;
      key: string;
      endpoint: string;
      body: unknown;
      mode: IdempotencyMode;
    },
    work: (db: Queryable) => Promise<T>,
  ): Promise<T> {
    const { scope, key, endpoint, body, mode } = args;
    if (!key) {
      throw new IdempotencyError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'This mutation requires an Idempotency-Key header.',
      );
    }
    const requestHash = hashRequest(endpoint, body);

    if (mode === 'local') return this.executeLocal(scope, key, endpoint, requestHash, work);
    return this.executeExternal(scope, key, endpoint, requestHash, work);
  }

  // -- LOCAL: key row and work share one transaction ------------------------------------

  private async executeLocal<T extends StoredResponse>(
    scope: string,
    key: string,
    endpoint: string,
    requestHash: string,
    work: (db: Queryable) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.runInTransaction(async (tx) => {
        await this.claim(tx, scope, key, endpoint, requestHash);
        const result = await work(tx);
        await this.complete(tx, scope, key, result);
        return result;
      });
    } catch (err) {
      if (!isIdempotencyKeyCollision(err)) throw err;
      // The transaction is already rolled back; read the winner's row on a fresh one.
      return (await this.replay(scope, key, requestHash)) as T;
    }
  }

  // -- EXTERNAL: key committed before the outside call ----------------------------------

  private async executeExternal<T extends StoredResponse>(
    scope: string,
    key: string,
    endpoint: string,
    requestHash: string,
    work: (db: Queryable) => Promise<T>,
  ): Promise<T> {
    try {
      await this.runInTransaction((tx) => this.claim(tx, scope, key, endpoint, requestHash));
    } catch (err) {
      if (!isIdempotencyKeyCollision(err)) throw err;
      return (await this.replay(scope, key, requestHash)) as T;
    }

    // The claim is committed. From here a crash leaves an `in_progress` row on purpose:
    // it is the evidence that an external attempt may have happened, and the only safe
    // recovery is reconciliation, not a retry.
    const result = await work(this.pool);
    await this.runInTransaction((tx) => this.complete(tx, scope, key, result));
    return result;
  }

  // -- shared -----------------------------------------------------------------------------

  private async claim(
    tx: Queryable,
    scope: string,
    key: string,
    endpoint: string,
    requestHash: string,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO core.idempotency_key (scope, key, endpoint, request_hash, state)
       VALUES ($1, $2, $3, $4, 'in_progress')`,
      [scope, key, endpoint, requestHash],
    );
  }

  private async complete(
    tx: Queryable,
    scope: string,
    key: string,
    result: StoredResponse,
  ): Promise<void> {
    await tx.query(
      `UPDATE core.idempotency_key
          SET state = 'completed',
              response_status = $3,
              response_body = $4,
              completed_at = now()
        WHERE scope = $1 AND key = $2`,
      [scope, key, result.status, JSON.stringify(result.body)],
    );
  }

  /**
   * The duplicate path. Deliberately strict: a stored response is only replayed to a
   * request that is byte-for-byte the same operation.
   */
  private async replay(scope: string, key: string, requestHash: string): Promise<StoredResponse> {
    const { rows } = await this.pool.query<KeyRow>(
      `SELECT scope, key, endpoint, request_hash, state, response_status, response_body
         FROM core.idempotency_key
        WHERE scope = $1 AND key = $2`,
      [scope, key],
    );
    const row = rows[0];

    // The winner rolled back between our violation and this read: nothing happened, and
    // the caller may safely try again.
    if (!row) {
      throw new IdempotencyError(
        'IDEMPOTENCY_IN_PROGRESS',
        'A concurrent request using this key did not complete. Retry.',
        1,
      );
    }

    // Same key, different operation. Never replay — the caller would receive a response
    // for a request it did not make.
    if (row.request_hash !== requestHash) {
      throw new IdempotencyError(
        'IDEMPOTENCY_KEY_REUSED',
        'This Idempotency-Key was already used for a different request.',
      );
    }

    if (row.state === 'in_progress') {
      throw new IdempotencyError(
        'IDEMPOTENCY_IN_PROGRESS',
        'An identical request is still in flight. Retry shortly.',
        2,
      );
    }

    return { status: row.response_status ?? 200, body: row.response_body, replayed: true };
  }

  /**
   * Reconciliation hook for EXTERNAL mode. Returns keys whose external attempt may have
   * happened but was never recorded — a payment worker resolves each against the PSP
   * using the same key. Never auto-completes them: only the PSP knows the truth.
   */
  async findStuck(limit = 100): Promise<Array<{ scope: string; key: string; endpoint: string }>> {
    const { rows } = await this.pool.query<{ scope: string; key: string; endpoint: string }>(
      `SELECT scope, key, endpoint
         FROM core.idempotency_key
        WHERE state = 'in_progress'
          AND created_at < now() - make_interval(secs => $1)
        ORDER BY created_at
        LIMIT $2`,
      [this.staleAfterSeconds, limit],
    );
    return rows;
  }
}
