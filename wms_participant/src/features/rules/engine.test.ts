/// <reference types="jest" />
// Unit tests for the Masters rules engine (RFP §3.2 / §9.1.3).
// Uses inlined algorithm bands — no bypassing deriveCategory/findBand.
import type { CategoryBand, RosterMember } from '@/domain/models/rule';
import { engineRuleById } from './engine.fixtures';
import {
  ageOn,
  categoryImpact,
  DEFAULT_REFERENCE_DATE,
  deriveCategory,
  findBand,
} from './engine';

function ruleById(id: string) {
  return engineRuleById(id);
}

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
  const swimBands = ruleById('rule_swim_individual').bands;

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
  const rule = ruleById('rule_swim_individual');

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
  const rule = ruleById('rule_tennis_doubles');

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
  const rule = ruleById('rule_rowing_coxed_four');

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
  const rule = ruleById('rule_swim_relay');

  it('sums member ages and bands the aggregate (demo relay → 160–199)', () => {
    const result = deriveCategory(RELAY_TEAM, rule);
    expect(result.method).toBe('relay-aggregate');
    expect(result.bandingAge).toBe(176); // 42+39+45+50
    expect(result.categoryName).toBe('160–199');
    expect(result.note).toContain('Aggregate');
  });
});

describe('categoryImpact (RUL-03)', () => {
  const tennisRule = ruleById('rule_tennis_doubles');

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
