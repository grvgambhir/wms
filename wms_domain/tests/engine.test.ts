// Comprehensive rules-engine tests, ported from wms_participant
// (src/features/rules/engine.test.ts). Imports the public barrel so these
// exercise the same API consumers use. SportRule objects are inlined — the
// Expo sport-rules.json fixture is deliberately not imported (PHASE_B extract).
import { describe, expect, it } from 'vitest';
import type { CategoryBand, RosterMember, SportRule } from '../index';
import {
  ageOn,
  categoryImpact,
  DEFAULT_REFERENCE_DATE,
  deriveCategory,
  findBand,
} from '../index';

/** Individual swimming bands — same shape the original fixture used. */
const SWIM_INDIVIDUAL: SportRule = {
  id: 'rule_swim_individual',
  sport: 'Swimming',
  event: 'Individual',
  strategy: 'individual',
  referenceDate: '2027-12-31',
  version: 'v2.1',
  effectiveDate: '2026-09-01',
  status: 'active',
  bands: [
    { id: 'sw2529', name: '25–29', minAge: 25, maxAge: 29 },
    { id: 'sw3034', name: '30–34', minAge: 30, maxAge: 34 },
    { id: 'sw3539', name: '35–39', minAge: 35, maxAge: 39 },
    { id: 'sw4044', name: '40–44', minAge: 40, maxAge: 44 },
    { id: 'sw4549', name: '45–49', minAge: 45, maxAge: 49 },
    { id: 'sw5054', name: '50–54', minAge: 50, maxAge: 54 },
    { id: 'sw5559', name: '55–59', minAge: 55, maxAge: 59 },
    { id: 'sw100', name: '100+', minAge: 100, maxAge: null },
  ],
};

const TENNIS_DOUBLES: SportRule = {
  id: 'rule_tennis_doubles',
  sport: 'Tennis',
  event: "Men's Doubles",
  strategy: 'youngest-member',
  referenceDate: '2027-12-31',
  version: 'v2.1',
  effectiveDate: '2026-09-01',
  status: 'active',
  bands: [
    { id: 'td3034', name: "Men's Doubles 30–34", minAge: 30, maxAge: 34 },
    { id: 'td3539', name: "Men's Doubles 35–39", minAge: 35, maxAge: 39 },
    { id: 'td4044', name: "Men's Doubles 40–44", minAge: 40, maxAge: 44 },
    { id: 'td4549', name: "Men's Doubles 45–49", minAge: 45, maxAge: 49 },
    { id: 'td80', name: "Men's Doubles 80+ Open", minAge: 80, maxAge: null },
  ],
};

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

const SWIM_RELAY: SportRule = {
  id: 'rule_swim_relay',
  sport: 'Swimming',
  event: '4×50 Freestyle Relay',
  strategy: 'relay-aggregate',
  referenceDate: '2027-12-31',
  version: 'v2.1',
  effectiveDate: '2026-09-01',
  status: 'active',
  bands: [
    { id: 'rl100', name: '100–119', minAge: 100, maxAge: 119 },
    { id: 'rl120', name: '120–159', minAge: 120, maxAge: 159 },
    { id: 'rl160', name: '160–199', minAge: 160, maxAge: 199 },
    { id: 'rl200', name: '200–239', minAge: 200, maxAge: 239 },
    { id: 'rl240', name: '240–279', minAge: 240, maxAge: 279 },
    { id: 'rl280', name: '280+', minAge: 280, maxAge: null },
  ],
};

const DANIEL: RosterMember = { id: 'daniel', name: 'Daniel Harper', dob: '1985-03-15', role: 'captain' };
const MARCO: RosterMember = { id: 'marco', name: 'Marco Rossi', dob: '1988-09-22', role: 'partner' };
const BIANCHI: RosterMember = { id: 'luca', name: 'Luca Bianchi', dob: '1994-06-10', role: 'partner' };

const RELAY_TEAM: RosterMember[] = [
  { id: 's1', name: 'Swimmer 1', dob: '1985-03-15' },
  { id: 's2', name: 'Swimmer 2', dob: '1988-09-22' },
  { id: 's3', name: 'Swimmer 3', dob: '1982-06-01' },
  { id: 's4', name: 'Swimmer 4', dob: '1977-01-01' },
];

/** Rowers aged 46/45/44/43 + cox 30 — matches RFP crew-average demo. */
const ROWING_CREW_RFP: RosterMember[] = [
  { id: 'r1', name: 'Rower 1', dob: '1981-06-01' },
  { id: 'r2', name: 'Rower 2', dob: '1982-06-01' },
  { id: 'r3', name: 'Rower 3', dob: '1983-06-01' },
  { id: 'r4', name: 'Rower 4', dob: '1984-06-01' },
  { id: 'cox', name: 'Coxswain', dob: '1997-06-01', role: 'coxswain' },
];

describe('ageOn', () => {
  it('computes full years on the reference date (timezone-independent)', () => {
    expect(ageOn('1985-03-15', DEFAULT_REFERENCE_DATE)).toBe(42);
    expect(ageOn('1988-09-22', DEFAULT_REFERENCE_DATE)).toBe(39);
    expect(ageOn('1994-06-10', DEFAULT_REFERENCE_DATE)).toBe(33);
  });

  it('has not had birthday yet in the reference year', () => {
    expect(ageOn('1985-12-31', DEFAULT_REFERENCE_DATE)).toBe(42);
    expect(ageOn('1986-01-01', DEFAULT_REFERENCE_DATE)).toBe(41);
  });
});

describe('findBand', () => {
  const swimBands = SWIM_INDIVIDUAL.bands;

  it('matches exact minAge boundary', () => {
    const band = findBand(40, swimBands);
    expect(band?.name).toBe('40–44');
    expect(band?.minAge).toBe(40);
  });

  it('matches exact maxAge boundary', () => {
    const band = findBand(44, swimBands);
    expect(band?.name).toBe('40–44');
    expect(band?.maxAge).toBe(44);
  });

  it('matches open-ended band when maxAge is null', () => {
    const band = findBand(100, swimBands);
    expect(band?.name).toBe('100+');
    expect(band?.maxAge).toBeNull();
  });

  it('returns null when no band contains the age', () => {
    expect(findBand(24, swimBands)).toBeNull();
  });

  it('uses custom bands without hardcoding engine logic', () => {
    const custom: CategoryBand[] = [
      { id: 'a', name: 'A', minAge: 10, maxAge: 19 },
      { id: 'b', name: 'B', minAge: 20, maxAge: null },
    ];
    expect(findBand(10, custom)?.name).toBe('A');
    expect(findBand(19, custom)?.name).toBe('A');
    expect(findBand(20, custom)?.name).toBe('B');
    expect(findBand(999, custom)?.name).toBe('B');
  });
});

describe('deriveCategory — individual', () => {
  const rule = SWIM_INDIVIDUAL;

  it('bands a single entrant by own age (Daniel Harper → 40–44)', () => {
    const result = deriveCategory([DANIEL], rule);
    expect(result.method).toBe('individual');
    expect(result.bandingAge).toBe(42);
    expect(result.categoryName).toBe('40–44');
    expect(result.band?.id).toBe('sw4044');
    expect(result.memberAges).toHaveLength(1);
    expect(result.memberAges[0].age).toBe(42);
    expect(result.memberAges[0].excluded).toBe(false);
  });
});

describe('deriveCategory — youngest-member (tennis doubles)', () => {
  const rule = TENNIS_DOUBLES;

  it('uses youngest included member — Harper + Rossi → 35–39', () => {
    const result = deriveCategory([DANIEL, MARCO], rule);
    expect(result.method).toBe('youngest-member');
    expect(result.bandingAge).toBe(39);
    expect(result.categoryName).toBe("Men's Doubles 35–39");
    expect(result.note).toContain('youngest');
  });

  it('recalculates when a younger partner is added — Harper + Bianchi → 30–34', () => {
    const result = deriveCategory([DANIEL, BIANCHI], rule);
    expect(result.bandingAge).toBe(33);
    expect(result.categoryName).toBe("Men's Doubles 30–34");
  });
});

describe('deriveCategory — crew-average (rowing coxed four)', () => {
  const rule = ROWING_COXED_FOUR;

  it('averages rowers, excludes coxswain, floors to Category C', () => {
    const result = deriveCategory(ROWING_CREW_RFP, rule);
    const includedAges = result.memberAges.filter((m) => !m.excluded).map((m) => m.age);
    expect(includedAges).toEqual([46, 45, 44, 43]);
    expect(result.memberAges.find((m) => m.id === 'cox')?.excluded).toBe(true);
    expect(result.bandingAge).toBe(44); // floor(44.5)
    expect(result.categoryName).toBe('Category C (43–49)');
    expect(result.note).toContain('excluding 1');
  });

  it('reclassifies when a rower substitution lowers the average to Category B', () => {
    const substituted: RosterMember[] = [
      { id: 'r1', name: 'Rower 1', dob: '1989-06-01' }, // age 38 → avg 42
      { id: 'r2', name: 'Rower 2', dob: '1982-06-01' },
      { id: 'r3', name: 'Rower 3', dob: '1983-06-01' },
      { id: 'r4', name: 'Rower 4', dob: '1984-06-01' },
      { id: 'cox', name: 'Coxswain', dob: '1997-06-01', role: 'coxswain' },
    ];
    const result = deriveCategory(substituted, rule);
    expect(result.bandingAge).toBe(42); // floor(42.5)
    expect(result.categoryName).toBe('Category B (36–42)');
  });
});

describe('deriveCategory — relay-aggregate', () => {
  const rule = SWIM_RELAY;

  it('sums member ages and bands the aggregate (demo relay → 160–199)', () => {
    const result = deriveCategory(RELAY_TEAM, rule);
    expect(result.method).toBe('relay-aggregate');
    expect(result.bandingAge).toBe(176); // 42+39+45+50
    expect(result.categoryName).toBe('160–199');
    expect(result.note).toContain('Aggregate');
  });
});

describe('categoryImpact (RUL-03)', () => {
  const tennisRule = TENNIS_DOUBLES;

  it('reports unchanged when category stays the same', () => {
    const prev = deriveCategory([DANIEL, MARCO], tennisRule);
    const next = deriveCategory([DANIEL, MARCO], tennisRule);
    const impact = categoryImpact(prev, next, 'No roster change');
    expect(impact.changed).toBe(false);
    expect(impact.fromCategory).toBe("Men's Doubles 35–39");
    expect(impact.toCategory).toBe("Men's Doubles 35–39");
    expect(impact.fromBandingAge).toBe(39);
    expect(impact.toBandingAge).toBe(39);
    expect(impact.reason).toBe('No roster change');
  });

  it('reports changed with from/to fields when a younger partner is added', () => {
    const prev = deriveCategory([DANIEL, MARCO], tennisRule);
    const next = deriveCategory([DANIEL, MARCO, BIANCHI], tennisRule);
    const impact = categoryImpact(prev, next, 'Added a younger partner to the roster');
    expect(impact.changed).toBe(true);
    expect(impact.fromCategory).toBe("Men's Doubles 35–39");
    expect(impact.toCategory).toBe("Men's Doubles 30–34");
    expect(impact.fromBandingAge).toBe(39);
    expect(impact.toBandingAge).toBe(33);
    expect(impact.reason).toBe('Added a younger partner to the roster');
  });
});
