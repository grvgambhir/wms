/**
 * Structural contract for RegistrationJourneySnapshot. The old spot-check on
 * `entry.id` is why a snake_case jsonb blob shipped as the journey.
 */
import { expect } from 'vitest';

export const JOURNEY_SNAPSHOT_KEYS = [
  'event',
  'athlete',
  'sports',
  'sportEntryProducts',
  'partners',
  'rules',
  'documents',
  'entry',
  'fees',
  'quotas',
  'waitlist',
  'order',
  'payment',
] as const;

const ENTRY_KEYS = [
  'id',
  'athleteId',
  'eventId',
  'sportId',
  'sportEntryProductId',
  'grade',
  'ruleId',
  'ruleVersion',
  'evidenceStatus',
  'status',
  'statusHistory',
  'createdAt',
  'updatedAt',
] as const;

const QUOTA_KEYS = ['id', 'eventId', 'sportEntryProductId', 'capacity', 'confirmed', 'reserved', 'status', 'updatedAt'];

const FORBIDDEN_TOP_LEVEL = ['products', 'pools', 'statusHistory', 'sport_entry_products'];

function assertCamelCaseKeys(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertCamelCaseKeys(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    expect(key, path).not.toMatch(/_/);
    assertCamelCaseKeys(child, path ? `${path}.${key}` : key);
  }
}

function asPage(value: unknown, name: string): { items: unknown[]; total: number } {
  expect(value, name).toEqual(expect.objectContaining({ items: expect.any(Array), total: expect.any(Number) }));
  const page = value as { items: unknown[]; total: number };
  expect(page.total, `${name}.total`).toBe(page.items.length);
  return page;
}

export function assertJourneySnapshotShape(
  body: unknown,
  expected: { entryId: string; athleteId: string; eventId: string; sportId: string; productId: string },
): void {
  expect(body).toEqual(expect.any(Object));
  const snap = body as Record<string, unknown>;
  expect(Object.keys(snap).sort()).toEqual([...JOURNEY_SNAPSHOT_KEYS].sort());
  for (const forbidden of FORBIDDEN_TOP_LEVEL) {
    expect(snap).not.toHaveProperty(forbidden);
  }
  assertCamelCaseKeys(snap, 'snapshot');

  const event = snap.event as Record<string, unknown>;
  expect(event.id).toBe(expected.eventId);
  expect(event).toHaveProperty('startDate');
  expect(event).toHaveProperty('sportIds');
  expect(event).not.toHaveProperty('starts_on');

  const athlete = snap.athlete as Record<string, unknown>;
  expect(athlete.id).toBe(expected.athleteId);
  expect(athlete).toHaveProperty('firstName');
  expect(athlete).toHaveProperty('lastName');
  expect(athlete).not.toHaveProperty('given_name');

  for (const pageName of ['sports', 'sportEntryProducts', 'partners', 'rules', 'documents', 'fees', 'quotas'] as const) {
    asPage(snap[pageName], pageName);
  }

  const sports = asPage(snap.sports, 'sports');
  expect(sports.items.some((item) => (item as { id: string }).id === expected.sportId)).toBe(true);

  const products = asPage(snap.sportEntryProducts, 'sportEntryProducts');
  expect(products.items.some((item) => (item as { id: string }).id === expected.productId)).toBe(true);
  expect((products.items[0] as Record<string, unknown> | undefined)?.sportId ?? expected.sportId).toBeTruthy();
  expect(products.items[0] as Record<string, unknown> | undefined).not.toHaveProperty('sport_id');

  const entry = snap.entry as Record<string, unknown>;
  for (const key of ENTRY_KEYS) {
    expect(entry, 'entry').toHaveProperty(key);
  }
  expect(entry.id).toBe(expected.entryId);
  expect(entry.athleteId).toBe(expected.athleteId);
  expect(entry.eventId).toBe(expected.eventId);
  expect(entry.sportId).toBe(expected.sportId);
  expect(entry.sportEntryProductId).toBe(expected.productId);
  expect(entry).not.toHaveProperty('athlete_profile_id');
  expect(entry).not.toHaveProperty('sport_entry_product_id');

  const history = entry.statusHistory;
  expect(Array.isArray(history)).toBe(true);
  expect((history as unknown[]).length).toBeGreaterThan(0);
  const first = (history as Record<string, unknown>[])[0]!;
  expect(first).toHaveProperty('status');
  expect(first).toHaveProperty('actor');
  expect(first).toHaveProperty('occurredAt');
  expect(first).not.toHaveProperty('to_status');
  expect(first).not.toHaveProperty('actor_kind');
  expect(first).not.toHaveProperty('occurred_at');

  const quotas = asPage(snap.quotas, 'quotas');
  expect(quotas.items.length).toBeGreaterThan(0);
  const quota = quotas.items[0] as Record<string, unknown>;
  for (const key of QUOTA_KEYS) {
    expect(quota, 'quotas.items[0]').toHaveProperty(key);
  }
  expect(quota.status === 'available' || quota.status === 'full' || quota.status === 'reserved').toBe(true);
  expect(quota).not.toHaveProperty('scopeKind');
  expect(quota).not.toHaveProperty('scope_kind');
  expect(quota).not.toHaveProperty('allocation');
  expect(quota).not.toHaveProperty('parentPoolId');
  expect(quota).not.toHaveProperty('unit');

  expect(snap).toHaveProperty('waitlist');
  expect(snap).toHaveProperty('order');
  expect(snap).toHaveProperty('payment');
}
