import { describe, expect, it } from 'vitest';
import type { EntrantAttribute, RuleDimension, RuleEligibility } from '../index';
import { DEFAULT_REFERENCE_DATE, deriveMultiDimension } from '../index';

const PERSON = 'person-judo';
const VERSION = 'rule-version-judo';
const WEIGHT_FACT = 'fact-weight';
const BELT_FACT = 'fact-belt';

function fact(
  partial: Pick<EntrantAttribute, 'id' | 'personId' | 'attribute'> & Partial<EntrantAttribute>,
): EntrantAttribute {
  return {
    eventId: 'event-1',
    versionNo: 1,
    status: 'verified',
    recordedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

const JUDO_DIMENSIONS: RuleDimension[] = [
  {
    id: 'dim-age',
    ruleVersionId: VERSION,
    ordinal: 1,
    attribute: 'age',
    aggregation: 'self',
    rounding: 'floor',
    valueScale: 0,
    bandKind: 'range',
    bands: [{ id: 'm30', name: 'M30', min: 30, max: 34 }],
  },
  {
    id: 'dim-weight',
    ruleVersionId: VERSION,
    ordinal: 2,
    attribute: 'weight_kg',
    aggregation: 'self',
    rounding: 'none',
    valueScale: 1,
    bandKind: 'range',
    bands: [{ id: 'u73', name: '-73kg', min: 0, max: 73 }],
  },
  {
    id: 'dim-belt',
    ruleVersionId: VERSION,
    ordinal: 3,
    attribute: 'belt_rank',
    aggregation: 'self',
    rounding: 'none',
    valueScale: 0,
    bandKind: 'enum',
    bands: [{ id: 'dan', name: 'Dan grades', codes: ['1dan', '2dan', '3dan'] }],
  },
];

describe('deriveMultiDimension — judo (age + decimal weight + belt enum)', () => {
  it('derives the tuple and records which fact each non-age dimension consumed', () => {
    const result = deriveMultiDimension({
      ruleVersionId: VERSION,
      referenceDate: DEFAULT_REFERENCE_DATE,
      dimensions: JUDO_DIMENSIONS,
      eligibility: [],
      roster: [{ personId: PERSON, dob: '1995-06-01' }],
      facts: [
        fact({
          id: WEIGHT_FACT,
          personId: PERSON,
          attribute: 'weight_kg',
          numericValue: 72.4,
          status: 'verified',
        }),
        fact({
          id: BELT_FACT,
          personId: PERSON,
          attribute: 'belt_rank',
          textValue: '2dan',
          status: 'verified',
        }),
      ],
      requireVerified: { weight_kg: true, belt_rank: true },
    });

    expect(result.ruleVersionId).toBe(VERSION);
    expect(result.categoryName).toBe('M30 / -73kg / Dan grades');
    expect(result.blockedBy).toEqual([]);
    expect(result.dimensions).toEqual([
      { attribute: 'age', value: 32, bandId: 'm30', bandName: 'M30' },
      {
        attribute: 'weight_kg',
        value: 72.4,
        bandId: 'u73',
        bandName: '-73kg',
        attributeId: WEIGHT_FACT,
      },
      {
        attribute: 'belt_rank',
        value: '2dan',
        bandId: 'dan',
        bandName: 'Dan grades',
        attributeId: BELT_FACT,
      },
    ]);
  });

  it('does not guess a weight band when the fact is missing', () => {
    const result = deriveMultiDimension({
      ruleVersionId: VERSION,
      referenceDate: DEFAULT_REFERENCE_DATE,
      dimensions: JUDO_DIMENSIONS,
      eligibility: [],
      roster: [{ personId: PERSON, dob: '1995-06-01' }],
      facts: [
        fact({
          id: BELT_FACT,
          personId: PERSON,
          attribute: 'belt_rank',
          textValue: '2dan',
          status: 'verified',
        }),
      ],
      requireVerified: { weight_kg: true, belt_rank: true },
    });
    expect(result.dimensions[1]).toMatchObject({ attribute: 'weight_kg', value: '' });
    expect(result.dimensions[1]?.bandId).toBeUndefined();
    expect(result.blockedBy).toContainEqual({
      predicate: 'attribute_in',
      messageKey: 'eligibility.cannot_evaluate',
    });
  });
});

describe('deriveMultiDimension — eligibility keys (PLT-02)', () => {
  const minAge: RuleEligibility = {
    id: 'el-min',
    ruleVersionId: VERSION,
    ordinal: 1,
    predicate: 'min_age',
    params: { min: 35 },
    severity: 'blocks',
    messageKey: 'eligibility.min_age',
  };

  it('returns the i18n key, never a sentence, when a blocking predicate fails', () => {
    const result = deriveMultiDimension({
      ruleVersionId: VERSION,
      referenceDate: DEFAULT_REFERENCE_DATE,
      dimensions: [JUDO_DIMENSIONS[0]!],
      eligibility: [minAge],
      roster: [{ personId: PERSON, dob: '1995-06-01' }],
      facts: [],
    });
    expect(result.dimensions[0]?.bandName).toBe('M30');
    expect(result.blockedBy).toEqual([{ predicate: 'min_age', messageKey: 'eligibility.min_age' }]);
    expect(result.blockedBy[0]?.messageKey.includes(' ')).toBe(false);
  });
});
