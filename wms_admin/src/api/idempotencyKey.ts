/**
 * One key per USER INTENT — a click — not per (record, action).
 *
 * A key built from the record and the action (`refund-${settlementId}`) is identical on the
 * second refund of that settlement, the second cancel of that entry, the second revoke of that
 * badge. The backend is right to treat a repeated key as a retry and replay the first
 * response — so the screen shows success while nothing happened. Reuse a key only to retry the
 * same click after a network failure.
 */
export function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}
