// Masters rules engine (WS-B) — PURE functions, no UI/IO, fully unit-testable.
// This is the pass/fail differentiator (RFP §9.1.3 / §3.2): age reference date,
// youngest-member, crew-average (excl. coxswain) and relay-aggregate categories,
// plus change impact analysis (RUL-03). Deterministic — same inputs, same output.
import type {
  CategoryBand,
  CategoryDerivation,
  CategoryImpact,
  MemberAge,
  RosterMember,
  RoundingPolicy,
  SportRule,
} from '../../domain/models/rule';
import type {
  DimensionAggregation,
  DimensionResult,
  EligibilityPredicate,
  EntrantAttribute,
  EnumBand,
  MultiDimensionDerivation,
  RangeBand,
  RuleDimension,
  RuleEligibility,
} from '../../domain/models/ruleDimension';
import { selectFact } from '../../domain/models/ruleDimension';

/** Como Lake 2027 default age reference date (RUL-02). */
export const DEFAULT_REFERENCE_DATE = '2027-12-31';

/**
 * Full years old on the reference date. Parsed from Y-M-D components (no Date
 * object) so results are timezone-independent and deterministic.
 */
export function ageOn(dob: string, referenceDate: string): number {
  const [by, bm, bd] = dob.split('-').map(Number);
  const [ry, rm, rd] = referenceDate.split('-').map(Number);
  let age = ry - by;
  if (rm < bm || (rm === bm && rd < bd)) age -= 1;
  return age;
}

/** First band containing `age` (bands are non-overlapping; null maxAge = open). */
export function findBand(age: number, bands: CategoryBand[]): CategoryBand | null {
  return bands.find((b) => age >= b.minAge && (b.maxAge == null || age <= b.maxAge)) ?? null;
}

function applyRounding(value: number, policy: RoundingPolicy = 'floor'): number {
  if (policy === 'round') return Math.round(value);
  if (policy === 'ceil') return Math.ceil(value);
  return Math.floor(value);
}

function computeMemberAges(roster: RosterMember[], rule: SportRule): MemberAge[] {
  const excluded = new Set((rule.excludeRoles ?? []).map((r) => r.toLowerCase()));
  return roster.map((m) => ({
    id: m.id,
    name: m.name,
    age: ageOn(m.dob, rule.referenceDate),
    excluded: m.role ? excluded.has(m.role.toLowerCase()) : false,
  }));
}

/** Derive a category for an entry/roster under a sport rule. */
export function deriveCategory(roster: RosterMember[], rule: SportRule): CategoryDerivation {
  const memberAges = computeMemberAges(roster, rule);
  const included = memberAges.filter((a) => !a.excluded);
  const includedAges = included.map((a) => a.age);

  let bandingAge = 0;
  let note: string | undefined;

  switch (rule.strategy) {
    case 'individual':
      bandingAge = includedAges[0] ?? 0;
      break;
    case 'youngest-member':
      bandingAge = includedAges.length ? Math.min(...includedAges) : 0;
      note = 'Category set by the youngest included member';
      break;
    case 'crew-average': {
      const raw = includedAges.length
        ? includedAges.reduce((s, a) => s + a, 0) / includedAges.length
        : 0;
      bandingAge = applyRounding(raw, rule.rounding);
      const excludedCount = memberAges.length - included.length;
      note = `Average of ${included.length} member(s), excluding ${excludedCount} (raw ${raw.toFixed(1)})`;
      break;
    }
    case 'relay-aggregate':
      bandingAge = includedAges.reduce((s, a) => s + a, 0);
      note = 'Aggregate (sum) of member ages';
      break;
  }

  const band = findBand(bandingAge, rule.bands);
  return {
    band,
    categoryName: band?.name ?? 'No matching category',
    method: rule.strategy,
    referenceDate: rule.referenceDate,
    bandingAge,
    memberAges,
    note,
  };
}

/** Compare two derivations (RUL-03) — surfaces reclassification, never silent. */
export function categoryImpact(
  previous: CategoryDerivation,
  next: CategoryDerivation,
  reason: string,
): CategoryImpact {
  return {
    changed: previous.categoryName !== next.categoryName,
    fromCategory: previous.categoryName,
    toCategory: next.categoryName,
    fromBandingAge: previous.bandingAge,
    toBandingAge: next.bandingAge,
    reason,
  };
}

/** One person on a multi-dimension derivation roster (identity is the person, not a UI id). */
export type DerivationMember = {
  personId: string;
  dob: string;
  role?: string;
};

export type DeriveMultiInput = {
  ruleVersionId: string;
  referenceDate: string;
  dimensions: readonly RuleDimension[];
  eligibility: readonly RuleEligibility[];
  roster: readonly DerivationMember[];
  facts: readonly EntrantAttribute[];
  /** `attribute_type.requires_verification` keyed by attribute name. */
  requireVerified?: Readonly<Record<string, boolean>>;
  sportCode?: string;
};

export function findRangeBand(value: number, bands: readonly RangeBand[]): RangeBand | null {
  return bands.find((b) => value >= b.min && (b.max == null || value <= b.max)) ?? null;
}

export function findEnumBand(code: string, bands: readonly EnumBand[]): EnumBand | null {
  return bands.find((b) => b.codes.includes(code)) ?? null;
}

function includedMembers(
  roster: readonly DerivationMember[],
  excludeRoles: readonly string[] | undefined,
): DerivationMember[] {
  const excluded = new Set((excludeRoles ?? []).map((r) => r.toLowerCase()));
  return roster.filter((m) => !m.role || !excluded.has(m.role.toLowerCase()));
}

function aggregateNumbers(
  values: number[],
  aggregation: DimensionAggregation,
  rounding: RoundingPolicy | 'none',
): number | null {
  if (values.length === 0) return null;
  let raw: number;
  switch (aggregation) {
    case 'min':
      raw = Math.min(...values);
      break;
    case 'max':
      raw = Math.max(...values);
      break;
    case 'mean':
      raw = values.reduce((sum, v) => sum + v, 0) / values.length;
      break;
    case 'sum':
      raw = values.reduce((sum, v) => sum + v, 0);
      break;
    default:
      raw = values[0] ?? 0;
  }
  if (rounding === 'none') return raw;
  return applyRounding(raw, rounding);
}

function asRangeBands(bands: RuleDimension['bands']): RangeBand[] {
  return bands as RangeBand[];
}

function asEnumBands(bands: RuleDimension['bands']): EnumBand[] {
  return bands as EnumBand[];
}

function paramNumber(params: Record<string, unknown>, key: string): number | undefined {
  const value = params[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function paramStrings(params: Record<string, unknown>, key: string): string[] {
  const value = params[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function eligibilityUnmet(
  rule: RuleEligibility,
  roster: readonly DerivationMember[],
  facts: readonly EntrantAttribute[],
  on: string,
  sportCode: string | undefined,
  requireVerifiedByAttribute: Readonly<Record<string, boolean>>,
): boolean {
  const person = roster[0];
  if (!person) return true;
  switch (rule.predicate) {
    case 'min_age': {
      const min = paramNumber(rule.params, 'min') ?? paramNumber(rule.params, 'minAge');
      if (min == null) return true;
      return roster.some((m) => ageOn(m.dob, on) < min);
    }
    case 'max_age': {
      const max = paramNumber(rule.params, 'max') ?? paramNumber(rule.params, 'maxAge');
      if (max == null) return true;
      return roster.some((m) => ageOn(m.dob, on) > max);
    }
    case 'federation_member':
    case 'licence_valid':
    case 'class_not_expired': {
      const attribute =
        (typeof rule.params.attribute === 'string' && rule.params.attribute) ||
        (rule.predicate === 'class_not_expired' ? 'para_class' : 'proficiency_grade');
      const fact = selectFact(facts, attribute, on, {
        sportCode,
        requireVerified: requireVerifiedByAttribute[attribute] ?? false,
      });
      if (!fact || fact.personId !== person.personId) return true;
      if (rule.predicate !== 'federation_member' && fact.validUntil && fact.validUntil < on) return true;
      return false;
    }
    case 'grade_in':
    case 'attribute_in': {
      const attribute =
        (typeof rule.params.attribute === 'string' && rule.params.attribute) || 'proficiency_grade';
      const allowed = paramStrings(rule.params, 'codes').concat(paramStrings(rule.params, 'values'));
      const fact = selectFact(facts, attribute, on, {
        sportCode,
        requireVerified: requireVerifiedByAttribute[attribute] ?? false,
      });
      if (!fact || fact.personId !== person.personId) return true;
      const value = fact.textValue ?? (fact.numericValue != null ? String(fact.numericValue) : '');
      return !allowed.includes(value);
    }
    case 'attribute_range': {
      const attribute =
        (typeof rule.params.attribute === 'string' && rule.params.attribute) || 'weight_kg';
      const min = paramNumber(rule.params, 'min');
      const max = paramNumber(rule.params, 'max');
      const fact = selectFact(facts, attribute, on, {
        sportCode,
        requireVerified: requireVerifiedByAttribute[attribute] ?? false,
      });
      if (!fact || fact.personId !== person.personId || fact.numericValue == null) return true;
      return (min != null && fact.numericValue < min) || (max != null && fact.numericValue > max);
    }
    case 'not_in_list': {
      const attribute =
        (typeof rule.params.attribute === 'string' && rule.params.attribute) || 'proficiency_grade';
      const banned = paramStrings(rule.params, 'values').concat(paramStrings(rule.params, 'codes'));
      const fact = selectFact(facts, attribute, on, {
        sportCode,
        requireVerified: requireVerifiedByAttribute[attribute] ?? false,
      });
      if (!fact || fact.personId !== person.personId) return false;
      const value = fact.textValue ?? (fact.numericValue != null ? String(fact.numericValue) : '');
      return banned.includes(value);
    }
    default:
      return true;
  }
}

function deriveOneDimension(
  dimension: RuleDimension,
  roster: readonly DerivationMember[],
  facts: readonly EntrantAttribute[],
  on: string,
  requireVerified: Readonly<Record<string, boolean>>,
  sportCode: string | undefined,
): DimensionResult {
  const members = includedMembers(roster, dimension.excludeRoles);
  const verified = requireVerified[dimension.attribute] ?? false;

  if (dimension.attribute === 'age') {
    const ages = members.map((m) => ageOn(m.dob, on));
    const value = aggregateNumbers(ages, dimension.aggregation, dimension.rounding);
    if (value == null) return { attribute: 'age', value: '' };
    const band = dimension.bandKind === 'range' ? findRangeBand(value, asRangeBands(dimension.bands)) : null;
    return {
      attribute: 'age',
      value,
      bandId: band?.id,
      bandName: band?.name,
    };
  }

  if (dimension.bandKind === 'range') {
    const values: number[] = [];
    let consumed: EntrantAttribute | null = null;
    for (const member of members) {
      const fact = selectFact(
        facts.filter((f) => f.personId === member.personId),
        dimension.attribute,
        on,
        { sportCode, requireVerified: verified },
      );
      if (fact?.numericValue == null) {
        if (dimension.aggregation === 'self') {
          return { attribute: dimension.attribute, value: '' };
        }
        continue;
      }
      values.push(fact.numericValue);
      consumed = fact;
      if (dimension.aggregation === 'self') break;
    }
    const value = aggregateNumbers(values, dimension.aggregation, dimension.rounding);
    if (value == null) return { attribute: dimension.attribute, value: '' };
    const band = findRangeBand(value, asRangeBands(dimension.bands));
    return {
      attribute: dimension.attribute,
      value,
      bandId: band?.id,
      bandName: band?.name,
      attributeId: consumed?.id,
    };
  }

  const person = members[0] ?? roster[0];
  if (!person) return { attribute: dimension.attribute, value: '' };
  const fact = selectFact(
    facts.filter((f) => f.personId === person.personId),
    dimension.attribute,
    on,
    { sportCode, requireVerified: verified },
  );
  if (!fact?.textValue) return { attribute: dimension.attribute, value: '' };
  const band = findEnumBand(fact.textValue, asEnumBands(dimension.bands));
  return {
    attribute: dimension.attribute,
    value: fact.textValue,
    bandId: band?.id,
    bandName: band?.name,
    attributeId: fact.id,
  };
}

/**
 * Full multi-dimension derivation (RUL-04). Age is one dimension of several.
 * A missing fact produces no band and no guessed default. Eligibility refusals
 * are i18n keys, never sentences.
 */
export function deriveMultiDimension(input: DeriveMultiInput): MultiDimensionDerivation {
  const ordered = [...input.dimensions].sort((a, b) => a.ordinal - b.ordinal);
  const dimensions = ordered.map((dimension) =>
    deriveOneDimension(
      dimension,
      input.roster,
      input.facts,
      input.referenceDate,
      input.requireVerified ?? {},
      input.sportCode,
    ),
  );

  const blockedBy: Array<{ predicate: EligibilityPredicate; messageKey: string }> = [];
  for (const rule of [...input.eligibility].sort((a, b) => a.ordinal - b.ordinal)) {
    if (rule.severity !== 'blocks') continue;
    if (
      eligibilityUnmet(
        rule,
        input.roster,
        input.facts,
        input.referenceDate,
        input.sportCode,
        input.requireVerified ?? {},
      )
    ) {
      blockedBy.push({ predicate: rule.predicate, messageKey: rule.messageKey });
    }
  }

  for (const result of dimensions) {
    if (result.value === '' || result.bandId == null) {
      blockedBy.push({ predicate: 'attribute_in', messageKey: 'eligibility.cannot_evaluate' });
      break;
    }
  }

  return {
    ruleVersionId: input.ruleVersionId,
    referenceDate: input.referenceDate,
    dimensions,
    categoryName: dimensions
      .map((d) => d.bandName)
      .filter((name): name is string => Boolean(name))
      .join(' / '),
    blockedBy,
  };
}
