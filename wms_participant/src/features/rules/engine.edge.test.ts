/// <reference types="jest" />
// Edge cases beyond engine.test.ts: relay-aggregate band edges, crew-average
// excludeRoles (coxswain), and age boundaries on the 31 Dec 2027 reference date.
import type { RosterMember, SportRule } from '@/domain/models/rule';
import { engineRuleById } from './engine.fixtures';
import { ageOn, DEFAULT_REFERENCE_DATE, deriveCategory, findBand } from './engine';

function ruleById(id: string) {
  return engineRuleById(id);
}

function member(id: string, dob: string, role?: string): RosterMember {
  return { id, name: id, dob, role };
}

/** Ages on 31 Dec 2027: 40, 39, 45, 36 → sum 160 (exact lower edge of 160–199). */
const RELAY_SUM_160: RosterMember[] = [
  member('a', '1987-12-31'),
  member('b', '1988-12-31'),
  member('c', '1982-12-31'),
  member('d', '1991-12-31'),
];

/** Ages 40+39+45+35 = 159 → 120–159. */
const RELAY_SUM_159: RosterMember[] = [
  member('a', '1987-12-31'),
  member('b', '1988-12-31'),
  member('c', '1982-12-31'),
  member('d', '1992-12-31'),
];

/** Ages 50+50+50+50 = 200 → 200–239. */
const RELAY_SUM_200: RosterMember[] = [
  member('a', '1977-12-31'),
  member('b', '1977-12-31'),
  member('c', '1977-12-31'),
  member('d', '1977-12-31'),
];

const ROWING_WITH_YOUNG_COX: RosterMember[] = [
  member('r1', '1981-06-01', 'rower'),
  member('r2', '1982-06-01', 'rower'),
  member('r3', '1983-06-01', 'rower'),
  member('r4', '1984-06-01', 'rower'),
  member('cox', '1997-06-01', 'coxswain'),
];

describe('DEFAULT_REFERENCE_DATE', () => {
  it('is 31 Dec 2027 (RUL-02)', () => {
    expect(DEFAULT_REFERENCE_DATE).toBe('2027-12-31');
  });
});

describe('ageOn — boundaries around 31 Dec 2027', () => {
  it('counts the birthday when it falls on the reference date', () => {
    expect(ageOn('1987-12-31', DEFAULT_REFERENCE_DATE)).toBe(40);
    expect(ageOn('1985-12-31', DEFAULT_REFERENCE_DATE)).toBe(42);
  });

  it('keeps the previous year when the birthday is 1 Jan after the reference date', () => {
    expect(ageOn('1988-01-01', DEFAULT_REFERENCE_DATE)).toBe(39);
    expect(ageOn('1986-01-01', DEFAULT_REFERENCE_DATE)).toBe(41);
  });

  it('is 42 for a 30 Dec 1985 birthday (already occurred in 2027)', () => {
    expect(ageOn('1985-12-30', DEFAULT_REFERENCE_DATE)).toBe(42);
  });
});

describe('deriveCategory — age-boundary banding on 31 Dec 2027', () => {
  const swim = ruleById('rule_swim_individual');

  it('places an athlete who turns 40 on 31 Dec 2027 into 40–44', () => {
    const result = deriveCategory([member('turns-40', '1987-12-31')], swim);
    expect(result.bandingAge).toBe(40);
    expect(result.categoryName).toBe('40–44');
  });

  it('places an athlete who turns 40 on 1 Jan 2028 into 35–39', () => {
    const result = deriveCategory([member('still-39', '1988-01-01')], swim);
    expect(result.bandingAge).toBe(39);
    expect(result.categoryName).toBe('35–39');
  });

  it('places maxAge 44 (turns 45 on 1 Jan 2028) in 40–44, and 45 on the ref date in 45–49', () => {
    const still44 = deriveCategory([member('still-44', '1983-01-01')], swim);
    const turns45 = deriveCategory([member('turns-45', '1982-12-31')], swim);
    expect(still44.bandingAge).toBe(44);
    expect(still44.categoryName).toBe('40–44');
    expect(turns45.bandingAge).toBe(45);
    expect(turns45.categoryName).toBe('45–49');
  });

  it('returns no matching category just below the youngest band (age 24 on 31 Dec 2027)', () => {
    const result = deriveCategory([member('too-young', '2003-01-01')], swim);
    expect(result.bandingAge).toBe(24);
    expect(findBand(24, swim.bands)).toBeNull();
    expect(result.categoryName).toBe('No matching category');
  });
});

describe('deriveCategory — relay-aggregate sum banding', () => {
  const relay = ruleById('rule_swim_relay');

  it('bands the exact lower edge of 160–199', () => {
    const result = deriveCategory(RELAY_SUM_160, relay);
    expect(result.method).toBe('relay-aggregate');
    expect(result.bandingAge).toBe(160);
    expect(result.categoryName).toBe('160–199');
    expect(result.note).toContain('Aggregate');
  });

  it('drops into 120–159 when the sum is one below the 160 edge', () => {
    const result = deriveCategory(RELAY_SUM_159, relay);
    expect(result.bandingAge).toBe(159);
    expect(result.categoryName).toBe('120–159');
  });

  it('bands the exact lower edge of 200–239', () => {
    const result = deriveCategory(RELAY_SUM_200, relay);
    expect(result.bandingAge).toBe(200);
    expect(result.categoryName).toBe('200–239');
  });

  it('bands an open-ended 280+ aggregate', () => {
    const seniors = [
      member('a', '1957-12-31'),
      member('b', '1957-12-31'),
      member('c', '1957-12-31'),
      member('d', '1957-12-31'),
    ];
    const result = deriveCategory(seniors, relay);
    expect(result.bandingAge).toBe(280);
    expect(result.categoryName).toBe('280+');
  });
});

describe('deriveCategory — crew-average excluding configured roles', () => {
  const rowing = ruleById('rule_rowing_coxed_four');

  it('excludes coxswain from the average even when the role casing differs', () => {
    const mixedCase: RosterMember[] = ROWING_WITH_YOUNG_COX.map((m) =>
      m.role === 'coxswain' ? { ...m, role: 'Coxswain' } : m,
    );
    const result = deriveCategory(mixedCase, rowing);
    const cox = result.memberAges.find((m) => m.id === 'cox');
    expect(cox?.excluded).toBe(true);
    expect(cox?.age).toBe(30);
    expect(result.memberAges.filter((m) => !m.excluded)).toHaveLength(4);
    expect(result.bandingAge).toBe(44); // floor((46+45+44+43)/4) = floor(44.5)
    expect(result.categoryName).toBe('Category C (43–49)');
    expect(result.note).toContain('excluding 1');
  });

  it('includes the coxswain when excludeRoles does not list that role — average drops a band', () => {
    const noExclude: SportRule = { ...rowing, excludeRoles: [] };
    const result = deriveCategory(ROWING_WITH_YOUNG_COX, noExclude);
    const cox = result.memberAges.find((m) => m.id === 'cox');
    expect(cox?.excluded).toBe(false);
    // (46+45+44+43+30)/5 = 41.6 → floor 41 → Category B
    expect(result.bandingAge).toBe(41);
    expect(result.categoryName).toBe('Category B (36–42)');
    expect(result.note).toContain('excluding 0');
  });

  it('honours a configured excludeRoles list other than coxswain', () => {
    const excludeCaptain: SportRule = { ...rowing, excludeRoles: ['captain'] };
    const roster: RosterMember[] = [
      member('r1', '1981-06-01', 'rower'),
      member('r2', '1982-06-01', 'captain'),
      member('cox', '1997-06-01', 'coxswain'),
    ];
    const result = deriveCategory(roster, excludeCaptain);
    expect(result.memberAges.find((m) => m.id === 'r2')?.excluded).toBe(true);
    expect(result.memberAges.find((m) => m.id === 'cox')?.excluded).toBe(false);
    // included: 46 + 30 = 76 / 2 = 38 → Category B
    expect(result.bandingAge).toBe(38);
    expect(result.categoryName).toBe('Category B (36–42)');
  });
});
