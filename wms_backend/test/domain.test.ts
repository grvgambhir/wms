/**
 * Proves @wms/domain resolves through the file: symlink with real engine output.
 * Cases copied from wms_domain/tests/engine.test.ts and statusLifecycle.ts.
 */
import { allowedTransitions, deriveCategory } from '@wms/domain';
import type { RosterMember, SportRule } from '@wms/domain';
import { describe, expect, it } from 'vitest';

const ROWING_COXED_FOUR: SportRule = {
  id: 'rule_rowing_coxed_four',
  sport: 'Rowing',
  event: 'Coxed Four',
  strategy: 'crew-average',
  excludeRoles: ['coxswain'],
  rounding: 'floor',
  referenceDate: '2027-12-31',
  version: 'v2.1',
  effectiveDate: '2026-09-01',
  status: 'active',
  bands: [
    { id: 'rwA', name: 'Category A (27–35)', minAge: 27, maxAge: 35 },
    { id: 'rwB', name: 'Category B (36–42)', minAge: 36, maxAge: 42 },
    { id: 'rwC', name: 'Category C (43–49)', minAge: 43, maxAge: 49 },
    { id: 'rwD', name: 'Category D (50–54)', minAge: 50, maxAge: 54 },
    { id: 'rwE', name: 'Category E (55–59)', minAge: 55, maxAge: 59 },
  ],
};

/** Rowers aged 46/45/44/43 + cox 30 — matches RFP crew-average demo. */
const ROWING_CREW_RFP: RosterMember[] = [
  { id: 'r1', name: 'Rower 1', dob: '1981-06-01' },
  { id: 'r2', name: 'Rower 2', dob: '1982-06-01' },
  { id: 'r3', name: 'Rower 3', dob: '1983-06-01' },
  { id: 'r4', name: 'Rower 4', dob: '1984-06-01' },
  { id: 'cox', name: 'Coxswain', dob: '1997-06-01', role: 'coxswain' },
];

describe('@wms/domain wiring', () => {
  it('deriveCategory averages rowers, excludes coxswain, floors to Category C', () => {
    const result = deriveCategory(ROWING_CREW_RFP, ROWING_COXED_FOUR);
    const includedAges = result.memberAges.filter((m) => !m.excluded).map((m) => m.age);
    expect(includedAges).toEqual([46, 45, 44, 43]);
    expect(result.memberAges.find((m) => m.id === 'cox')?.excluded).toBe(true);
    expect(result.bandingAge).toBe(44); // floor(44.5)
    expect(result.categoryName).toBe('Category C (43–49)');
    expect(result.note).toContain('excluding 1');
  });

  it('allowedTransitions from draft lists participant withdraw and not confirmed', () => {
    const participant = allowedTransitions('draft', 'participant');
    expect(participant.map((t) => t.to)).toEqual(['withdrawn']);
    const all = allowedTransitions('draft').map((t) => t.to);
    expect(all).toContain('withdrawn');
    expect(all).not.toContain('confirmed');
  });
});
