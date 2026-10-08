// Multi-attribute rule configuration (RFP §3.2, gate §9.1.3).
//
// WHY THIS EXISTS ALONGSIDE `SportRule`
// -------------------------------------
// `SportRule` in rule.ts is `strategy + bands`, and it expresses AGE and nothing else.
// That covers four of the tender's ten Masters patterns. The other six — judo
// (age + weight + federation + belt), golf handicap, para classification, proficiency
// review, category combination, eligibility exclusions — have no home in it, and adding a
// `strategy` value per sport would be the per-sport code branching the RFP forbids.
//
// The generalisation comes from the engine itself. `deriveCategory()` does exactly two
// things: it aggregates a number off the roster, then bands it. The four "strategies" are
// four AGGREGATION FUNCTIONS OVER ONE ATTRIBUTE. So:
//
//     Age is one dimension, not the model.
//
// A rule carries an ordered list of dimensions; each derives a value from the entrant and
// maps it to a band; the category is the tuple of matched bands. The existing four
// strategies are the single-age-dimension case, so nothing already working changes.

import type { IsoDate, RoundingPolicy } from './rule';

/** How a dimension's value is derived across the roster. */
export type DimensionAggregation = 'self' | 'min' | 'max' | 'mean' | 'sum';

/**
 * Age, weight and handicap sit on a number line. Belt rank, para class and proficiency
 * grade do not. A single min/max shape cannot express both — which is precisely why six
 * patterns were previously unreachable.
 */
export type BandKind = 'range' | 'enum';

export type RangeBand = {
  id: string;
  name: string;
  min: number;
  /** `null` = open-ended upper, e.g. "100+". */
  max: number | null;
};

export type EnumBand = {
  id: string;
  name: string;
  codes: string[];
};

export type RuleDimension = {
  id: string;
  ruleVersionId: string;
  /** Position in the category tuple. */
  ordinal: number;
  /** Key into the attribute dictionary — `age`, `weight_kg`, `belt_rank`, … */
  attribute: string;
  aggregation: DimensionAggregation;
  /** Roles excluded from the aggregate, e.g. `['coxswain']`. */
  excludeRoles?: string[];
  /**
   * Rounding is an AGE concept. Applying integer floor/round/ceil to a golf handicap
   * (-2.4) or a judo weight (73.6 kg) corrupts the fact rather than banding it, so it is
   * legal only when `valueScale` is 0.
   */
  rounding: RoundingPolicy | 'none';
  valueScale: number;
  bandKind: BandKind;
  bands: RangeBand[] | EnumBand[];
};

/**
 * Eligibility decides whether an entrant may enter AT ALL. Deliberately not a dimension:
 * modelling exclusions as bands would have been the tempting shortcut and the wrong one.
 */
export type EligibilityPredicate =
  | 'min_age'
  | 'max_age'
  | 'federation_member'
  | 'licence_valid'
  | 'class_not_expired'
  | 'grade_in'
  | 'attribute_in'
  | 'attribute_range'
  | 'not_in_list';

export type EligibilitySeverity = 'blocks' | 'requires_evidence' | 'warns';

export type RuleEligibility = {
  id: string;
  ruleVersionId: string;
  ordinal: number;
  predicate: EligibilityPredicate;
  params: Record<string, unknown>;
  severity: EligibilitySeverity;
  /**
   * An i18n KEY, never a message. PLT-02 makes bilingual a launch requirement, and a rule
   * that hardcodes an English refusal reason cannot be shown to an Italian entrant.
   */
  messageKey: string;
};

/** The typed dictionary. Without it `attribute` is free text and units are undeclared. */
export type AttributeType = {
  name: string;
  valueKind: 'numeric' | 'enum';
  unit?: string;
  scale: number;
  allowedCodes?: string[];
  requiresVerification: boolean;
};

/**
 * A fact about an entrant, scoped and versioned.
 *
 * One athlete holds licences from different federations, a proficiency review per sport,
 * and class determinations from different authorities. One value per person per event
 * collapses all of that into a single row and loses which fact a rule actually consumed.
 */
export type EntrantAttributeStatus = 'declared' | 'verified' | 'rejected' | 'expired';

export type EntrantAttribute = {
  id: string;
  eventId: string;
  personId: string;
  attribute: string;
  /** `undefined` = applies across sports. */
  sportCode?: string;
  /** Federation, classifier or other issuing authority. */
  issuer?: string;
  versionNo: number;
  numericValue?: number;
  textValue?: string;
  /**
   * A DECLARED fact and a VERIFIED one are different things, and a rule says which it
   * needs. Collapsing them is how an unverified self-reported handicap silently becomes
   * an eligibility decision.
   */
  status: EntrantAttributeStatus;
  verifiedBy?: string;
  verifiedAt?: string;
  validFrom?: IsoDate;
  validUntil?: IsoDate;
  evidenceId?: string;
  supersededBy?: string;
  recordedAt: string;
};

/** One dimension's contribution to a derived category — kept for audit (RUL-04). */
export type DimensionResult = {
  attribute: string;
  /** The aggregated input, before banding. */
  value: number | string;
  bandId?: string;
  bandName?: string;
  /** Which fact was consumed, so a disputed decision can be reconstructed exactly. */
  attributeId?: string;
};

/** The full multi-dimension derivation. The tuple of band names IS the category. */
export type MultiDimensionDerivation = {
  ruleVersionId: string;
  referenceDate: IsoDate;
  dimensions: DimensionResult[];
  categoryName: string;
  /** Unmet eligibility predicates. Non-empty means the entrant may not enter. */
  blockedBy: Array<{ predicate: EligibilityPredicate; messageKey: string }>;
};

/** Is a fact usable by a rule right now? */
export function isUsableFact(
  fact: Pick<EntrantAttribute, 'status' | 'validUntil' | 'supersededBy'>,
  on: IsoDate,
  requireVerified: boolean,
): boolean {
  if (fact.supersededBy) return false;
  if (fact.status === 'rejected' || fact.status === 'expired') return false;
  if (requireVerified && fact.status !== 'verified') return false;
  if (fact.validUntil && fact.validUntil < on) return false;
  return true;
}

/**
 * Picks the fact a rule should consume. Prefers the most specific scope — a sport-specific
 * fact beats a general one — then the highest version. Returns `null` rather than guessing
 * when nothing qualifies: a missing fact must surface as "cannot evaluate", never as a
 * default that quietly produces a category.
 */
export function selectFact(
  facts: readonly EntrantAttribute[],
  attribute: string,
  on: IsoDate,
  opts: { sportCode?: string; issuer?: string; requireVerified?: boolean } = {},
): EntrantAttribute | null {
  const usable = facts.filter(
    (f) =>
      f.attribute === attribute &&
      isUsableFact(f, on, opts.requireVerified ?? false) &&
      (opts.sportCode === undefined || f.sportCode === undefined || f.sportCode === opts.sportCode) &&
      (opts.issuer === undefined || f.issuer === undefined || f.issuer === opts.issuer),
  );
  if (usable.length === 0) return null;

  return usable.reduce((best, f) => {
    const score = (x: EntrantAttribute) => (x.sportCode ? 2 : 0) + (x.issuer ? 1 : 0);
    if (score(f) !== score(best)) return score(f) > score(best) ? f : best;
    return f.versionNo > best.versionNo ? f : best;
  });
}
