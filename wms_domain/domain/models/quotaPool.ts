// Quota allocation — the storage-side model (REG-09, §2.2.4).
//
// WHY THIS EXISTS ALONGSIDE `EntryQuota`
// --------------------------------------
// `EntryQuota` in registrationJourney.ts models ONE capacity per (product, category), and
// an entry pointed at exactly one of them. The tender asks for more than that: "quotas,
// reserved allocations, release waves, local/international quota dimensions" (REG-09), with
// control "at sport, discipline, event, category and venue" (§2.2.4). An entry routinely
// consumes SEVERAL caps at once — a sport-wide cap and a venue allocation, say — and the
// old shape cannot express that because it can only point at one.
//
// So the two are not rivals. `QuotaPool` is what is STORED; `EntryQuota` stays as what the
// participant UI READS — the availability of the pool that actually binds. Screens asking
// "how many places are left?" keep working unchanged, and nothing has to pretend a nested
// set of caps is a single number.

import type { PaginatedResponse } from './api';

/** Where a pool's capacity applies. */
export type QuotaScopeKind =
  | 'event'
  | 'sport'
  | 'discipline'
  | 'product'
  | 'category'
  | 'venue';

/** Why a pool exists — the tender's "reserved allocations" and "local/international". */
export type QuotaAllocation =
  | 'general'
  | 'local'
  | 'international'
  | 'sponsor'
  | 'reserved'
  | 'wildcard';

/**
 * What one unit of capacity IS. "Capacity 60" is meaningless until this is fixed, and
 * teams-vs-athletes is exactly where an oversell hides.
 */
export type QuotaUnit = 'athlete' | 'team' | 'entry' | 'seat';

export type QuotaPool = {
  id: string;
  eventId: string;
  name: string;
  scopeKind: QuotaScopeKind;
  /** The code or id at that scope — a sport code, a product id, a venue code. */
  scopeRef?: string;
  allocation: QuotaAllocation;
  /** Pools nest: a venue pool inside a sport cap. Both are consumed by one entry. */
  parentPoolId?: string;
  unit: QuotaUnit;
  capacity: number;
  confirmed: number;
  reserved: number;
  /** Release waves — a tranche that opens, and optionally closes, on a schedule. */
  releaseFrom?: string;
  releaseUntil?: string;
  /** Who may draw on it (nationality, grade, …). Evaluated, never trusted from the client. */
  eligibility?: Record<string, unknown>;
  updatedAt: string;
};

export type QuotaConsumptionState = 'reserved' | 'confirmed' | 'released';

/** One entry's hold on one pool. An entry has a SET of these, not a single quota id. */
export type EntryQuotaConsumption = {
  entryId: string;
  quotaPoolId: string;
  units: number;
  state: QuotaConsumptionState;
  /** An abandoned checkout must not hold a seat for ever. */
  expiresAt?: string;
  createdAt: string;
};

/** Everything one entry currently holds, with the pool that actually binds it. */
export type EntryAllocation = {
  entryId: string;
  consumptions: EntryQuotaConsumption[];
  pools: PaginatedResponse<QuotaPool>;
  /**
   * The pool with the least headroom — what the UI should show and what a "full" message
   * must name. With a sport cap of 100 over a product pool of 60, the binding pool is the
   * product one, and reporting the sport cap would tell the participant the wrong story.
   */
  bindingPoolId?: string;
};

/** Remaining places in a pool. Never negative — the database CHECK guarantees it. */
export function headroom(pool: Pick<QuotaPool, 'capacity' | 'confirmed' | 'reserved'>): number {
  return Math.max(0, pool.capacity - pool.confirmed - pool.reserved);
}

/**
 * The pool that will refuse first. Returns `null` for an empty set rather than guessing,
 * because "no applicable pool" and "a pool with no room" are different situations and the
 * caller must not conflate them.
 */
export function bindingPool(pools: readonly QuotaPool[]): QuotaPool | null {
  if (pools.length === 0) return null;
  return pools.reduce((tightest, p) => (headroom(p) < headroom(tightest) ? p : tightest));
}

/**
 * Is a pool open right now? A release wave that has not opened is not the same as a full
 * one, and the participant needs to be told which.
 */
export function isPoolOpen(pool: QuotaPool, at: string): boolean {
  if (pool.releaseFrom && at < pool.releaseFrom) return false;
  if (pool.releaseUntil && at >= pool.releaseUntil) return false;
  return true;
}

/**
 * Locking order for a claim. Deterministic by id — locking pools in the order the
 * application happened to resolve them is how two concurrent claimants deadlock on a
 * shared parent cap.
 */
export function lockOrder(poolIds: readonly string[]): string[] {
  return [...new Set(poolIds)].sort();
}
