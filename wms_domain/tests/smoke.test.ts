// Smoke test: prove the extracted engine + lifecycle still behave correctly
// outside the Expo app, without pulling in the app mock-data hub (left out
// of this extract — PHASE_B_DOMAIN_AUDIT.md "needs a design decision").
import { describe, expect, it } from 'vitest';
import type { RosterMember, SportRule } from '../index';
import { canTransition, deriveCategory } from '../index';

const DANIEL: RosterMember = {
  id: 'daniel',
  name: 'Daniel Harper',
  dob: '1985-03-15',
  role: 'captain',
};

/** Minimal individual swimming rule — same banding-age math as the Expo engine tests. */
const SWIM_INDIVIDUAL: SportRule = {
  id: 'rule_swim_individual',
  sport: 'swimming',
  strategy: 'individual',
  referenceDate: '2027-12-31',
  bands: [{ id: 'sw4044', name: '40–44', minAge: 40, maxAge: 44 }],
  version: 'v1',
  effectiveDate: '2026-01-01',
  status: 'active',
};

describe('@wms/domain smoke', () => {
  it('deriveCategory bands Daniel Harper (dob 1985-03-15) into 40–44 on 2027-12-31', () => {
    const result = deriveCategory([DANIEL], SWIM_INDIVIDUAL);
    expect(result.method).toBe('individual');
    expect(result.bandingAge).toBe(42);
    expect(result.categoryName).toBe('40–44');
    expect(result.band?.id).toBe('sw4044');
  });

  it('canTransition allows draft → withdrawn and rejects draft → confirmed', () => {
    expect(canTransition('draft', 'withdrawn')).toBe(true);
    expect(canTransition('draft', 'confirmed')).toBe(false);
  });
});
