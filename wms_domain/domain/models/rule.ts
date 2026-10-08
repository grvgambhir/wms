// Masters sport rules — domain model (WS-B). The rules engine treats every sport
// rule as CONFIGURATION with a reference date, versioned bands and an audit-able
// derivation result — never hardcoded per sport. Backs RFP RUL-01..06, REG-02/03.
// The default age reference date for Como Lake 2027 is 31 December 2027 (RUL-02).

/** ISO calendar date, 'YYYY-MM-DD'. */
export type IsoDate = string;

/** How a category is derived from member age(s). */
export type TeamCalcStrategy =
  | 'individual' // single entrant — own age
  | 'youngest-member' // team category from the youngest player (basketball, tennis doubles)
  | 'crew-average' // average age, excluding configured roles (rowing, excl. coxswain)
  | 'relay-aggregate'; // sum of member ages (swimming relay)

export type RoundingPolicy = 'floor' | 'round' | 'ceil';

/** One age band. `maxAge: null` = open-ended upper (e.g. "100+"). */
export type CategoryBand = {
  id: string;
  name: string;
  minAge: number;
  maxAge: number | null;
};

/** A configured, versioned sport rule (RUL-01/05). */
export type SportRule = {
  id: string;
  sport: string;
  discipline?: string;
  event?: string;
  strategy: TeamCalcStrategy;
  /** Age reference date (RUL-02) — default 2027-12-31 for Como. */
  referenceDate: IsoDate;
  bands: CategoryBand[];
  /** Roster roles excluded from age math (e.g. ['coxswain'] for crew-average). */
  excludeRoles?: string[];
  /** Rounding for average-age strategies. Default 'floor'. */
  rounding?: RoundingPolicy;
  version: string; // e.g. 'v2.1'
  effectiveDate: IsoDate;
  status: 'active' | 'draft' | 'superseded';
};

/** A person on an entry/roster. */
export type RosterMember = {
  id: string;
  name: string;
  dob: IsoDate;
  role?: string; // 'captain' | 'coxswain' | 'partner' | ...
};

/** Per-member age used in a derivation (for display + audit, RUL-04). */
export type MemberAge = {
  id: string;
  name: string;
  age: number;
  excluded: boolean;
};

/** Result of deriving a category (RUL-04: keeps the inputs + method for audit). */
export type CategoryDerivation = {
  band: CategoryBand | null;
  categoryName: string;
  method: TeamCalcStrategy;
  referenceDate: IsoDate;
  /** Age value banded against (own / youngest / average / aggregate). */
  bandingAge: number;
  memberAges: MemberAge[];
  note?: string;
};

/** Impact of a roster/rule change (RUL-03: no silent reclassification). */
export type CategoryImpact = {
  changed: boolean;
  fromCategory: string;
  toCategory: string;
  fromBandingAge: number;
  toBandingAge: number;
  reason: string;
};

/** A published rule-register change. The OC publishes it from A04; affected
 * participants review its impact on their own entry before commit in P19. Shared
 * through the rules repository so the notice crosses the admin ↔ participant portals
 * against one governed rule version (RUL-03/05, no silent reclassification). */
export type RuleChangeNotice = {
  id: string;
  sport: string;
  event?: string;
  fromVersion: string;
  toVersion: string;
  fromStrategy: TeamCalcStrategy;
  toStrategy: TeamCalcStrategy;
  /** How many active registrations the admin's impact analysis flagged. */
  affectedCount: number;
  totalCount: number;
  /** ISO-8601 timestamp (UTC) the change was published. */
  occurredAt: string;
  status: 'published' | 'acknowledged';
  acknowledgedAt?: string;
};

export type PublishRuleChangeInput = {
  sport: string;
  event?: string;
  fromVersion: string;
  toVersion: string;
  fromStrategy: TeamCalcStrategy;
  toStrategy: TeamCalcStrategy;
  affectedCount: number;
  totalCount: number;
};
