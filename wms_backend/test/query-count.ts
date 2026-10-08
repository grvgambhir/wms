import { Client } from 'pg';
import { expect, vi } from 'vitest';

type CountCase = {
  label: string;
  small: () => Promise<number>;
  beforeLarge?: () => Promise<void>;
  large: () => Promise<number>;
  expectedSmall?: number;
  expectedLarge?: number;
};

async function countStatements(work: () => Promise<number>): Promise<{
  statements: number;
  items: number;
}> {
  // Pool.query ultimately calls Client.query; spying here counts both pool-level
  // statements and statements issued on an explicitly checked-out transaction client.
  const query = vi.spyOn(Client.prototype, 'query');
  try {
    const items = await work();
    return { statements: query.mock.calls.length, items };
  } finally {
    query.mockRestore();
  }
}

/**
 * Reusable BACKEND_DB_PLAN §6 assertion: growing a list from 10 to 200 items may
 * change rows returned, but it must not change the number of PostgreSQL statements.
 */
export async function expectFixedQueryCount(testCase: CountCase): Promise<void> {
  const small = await countStatements(testCase.small);
  if (testCase.expectedSmall !== undefined) {
    expect(small.items, `${testCase.label}: small fixture size`).toBe(testCase.expectedSmall);
  }

  await testCase.beforeLarge?.();
  const large = await countStatements(testCase.large);
  if (testCase.expectedLarge !== undefined) {
    expect(large.items, `${testCase.label}: large fixture size`).toBe(testCase.expectedLarge);
  }

  expect(small.statements, `${testCase.label}: small request issued no SQL`).toBeGreaterThan(0);
  expect(
    large.statements,
    `${testCase.label}: SQL count grew from ${small.statements} at 10 items`,
  ).toBe(small.statements);
}
