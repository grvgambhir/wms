import type {
  DimensionAggregation,
  EntrantAttribute,
  MultiDimensionDerivation,
  RoundingPolicy,
  RuleDimension,
  RuleEligibility,
  SportRule,
  TeamCalcStrategy,
} from '@wms/domain';
import { deriveMultiDimension } from '@wms/domain';
import type { Queryable } from '../common/idempotency/idempotency.service';
import { asIsoDate, asNumber } from './helpers';

export type VersionRow = {
  id: string;
  rule_set_id: string;
  event_id: string;
  sport_code: string;
  event_name: string | null;
  sport_name: string;
  version_no: number;
  reference_date: string;
  status: string;
  reason: string | null;
  effective_from: string;
  published_at: Date | string | null;
};

type DimensionRow = {
  id: string;
  rule_version_id: string;
  ordinal: number;
  attribute: string;
  aggregation: string;
  exclude_roles: string[];
  rounding: string;
  value_scale: number;
  band_kind: string;
  bands: unknown;
};

type EligibilityRow = {
  id: string;
  rule_version_id: string;
  ordinal: number;
  predicate: string;
  params: unknown;
  severity: string;
  message_key: string;
};

export type LoadedVersion = {
  header: VersionRow;
  dimensions: RuleDimension[];
  eligibility: RuleEligibility[];
  requireVerified: Record<string, boolean>;
};

export function aggregationToStrategy(aggregation: string): TeamCalcStrategy {
  if (aggregation === 'min') return 'youngest-member';
  if (aggregation === 'mean') return 'crew-average';
  if (aggregation === 'sum') return 'relay-aggregate';
  return 'individual';
}

export function strategyToAggregation(strategy: string): DimensionAggregation {
  if (strategy === 'youngest-member') return 'min';
  if (strategy === 'crew-average') return 'mean';
  if (strategy === 'relay-aggregate') return 'sum';
  return 'self';
}

function asRounding(value: string): RoundingPolicy | 'none' {
  if (value === 'round' || value === 'ceil' || value === 'none') return value;
  return 'floor';
}

export function toSportRule(header: VersionRow, age: RuleDimension | undefined): SportRule {
  const rangeBands = (age?.bands ?? []) as Array<{
    id: string;
    name: string;
    min: number;
    max: number | null;
  }>;
  return {
    id: header.id,
    sport: header.sport_name,
    event: header.event_name ?? undefined,
    strategy: aggregationToStrategy(age?.aggregation ?? 'self'),
    referenceDate: header.reference_date,
    bands: rangeBands.map((b) => ({
      id: b.id,
      name: b.name,
      minAge: b.min,
      maxAge: b.max,
    })),
    excludeRoles: age?.excludeRoles,
    rounding: age && age.rounding !== 'none' ? age.rounding : undefined,
    version: header.reason ?? `v${header.version_no}.0`,
    effectiveDate: header.effective_from.slice(0, 10),
    status: header.status as SportRule['status'],
  };
}

function toDimension(row: DimensionRow): RuleDimension {
  return {
    id: row.id,
    ruleVersionId: row.rule_version_id,
    ordinal: row.ordinal,
    attribute: row.attribute,
    aggregation: row.aggregation as DimensionAggregation,
    excludeRoles: row.exclude_roles,
    rounding: asRounding(row.rounding),
    valueScale: row.value_scale,
    bandKind: row.band_kind === 'enum' ? 'enum' : 'range',
    bands: Array.isArray(row.bands) ? (row.bands as RuleDimension['bands']) : [],
  };
}

function toEligibility(row: EligibilityRow): RuleEligibility {
  return {
    id: row.id,
    ruleVersionId: row.rule_version_id,
    ordinal: row.ordinal,
    predicate: row.predicate as RuleEligibility['predicate'],
    params:
      row.params && typeof row.params === 'object' ? (row.params as Record<string, unknown>) : {},
    severity: row.severity as RuleEligibility['severity'],
    messageKey: row.message_key,
  };
}

const VERSION_SELECT = `
  SELECT rv.id, rv.rule_set_id, rs.event_id, rs.sport_code, rs.event_name,
         coalesce(s.name, rs.sport_code) AS sport_name,
         rv.version_no, rv.reference_date::text AS reference_date, rv.status, rv.reason,
         lower(rv.effective)::text AS effective_from, rv.published_at
    FROM core.rule_version rv
    JOIN core.rule_set rs ON rs.id = rv.rule_set_id
    LEFT JOIN core.sport s ON s.event_id = rs.event_id AND s.code = rs.sport_code`;

export async function loadVersion(db: Queryable, versionId: string): Promise<LoadedVersion | null> {
  const header = await db.query<VersionRow>(`${VERSION_SELECT} WHERE rv.id = $1`, [versionId]);
  const row = header.rows[0];
  if (!row) return null;
  return hydrate(db, row);
}

export async function loadActiveForSet(
  db: Queryable,
  ruleSetId: string,
): Promise<LoadedVersion | null> {
  const header = await db.query<VersionRow>(
    `${VERSION_SELECT} WHERE rv.rule_set_id = $1 AND rv.status = 'active' LIMIT 1`,
    [ruleSetId],
  );
  const row = header.rows[0];
  if (!row) return null;
  return hydrate(db, row);
}

export async function listActiveVersions(
  db: Queryable,
  filter: { sport?: string; event?: string },
): Promise<LoadedVersion[]> {
  const header = await db.query<VersionRow>(
    `${VERSION_SELECT}
      WHERE rv.status = 'active'
        AND ($1::text IS NULL OR lower(s.name) = lower($1) OR lower(rs.sport_code) = lower($1))
        AND ($2::text IS NULL OR lower(coalesce(rs.event_name, '')) = lower($2))
      ORDER BY s.name, rs.event_name, rv.version_no`,
    [filter.sport ?? null, filter.event ?? null],
  );
  const loaded: LoadedVersion[] = [];
  for (const row of header.rows) {
    loaded.push(await hydrate(db, row));
  }
  return loaded;
}

async function hydrate(db: Queryable, header: VersionRow): Promise<LoadedVersion> {
  const dims = await db.query<DimensionRow>(
    `SELECT id, rule_version_id, ordinal, attribute, aggregation, exclude_roles,
            rounding, value_scale, band_kind, bands
       FROM core.rule_dimension WHERE rule_version_id = $1 ORDER BY ordinal`,
    [header.id],
  );
  const elig = await db.query<EligibilityRow>(
    `SELECT id, rule_version_id, ordinal, predicate, params, severity, message_key
       FROM core.rule_eligibility WHERE rule_version_id = $1 ORDER BY ordinal`,
    [header.id],
  );
  const types = await db.query<{ name: string; requires_verification: boolean }>(
    `SELECT name, requires_verification FROM core.attribute_type`,
  );
  const requireVerified: Record<string, boolean> = {};
  for (const t of types.rows) requireVerified[t.name] = t.requires_verification;
  return {
    header,
    dimensions: dims.rows.map(toDimension),
    eligibility: elig.rows.map(toEligibility),
    requireVerified,
  };
}

export function deriveLoaded(
  loaded: LoadedVersion,
  roster: Array<{ personId: string; dob: string; role?: string }>,
  facts: EntrantAttribute[],
): MultiDimensionDerivation {
  return deriveMultiDimension({
    ruleVersionId: loaded.header.id,
    referenceDate: loaded.header.reference_date,
    dimensions: loaded.dimensions,
    eligibility: loaded.eligibility,
    roster,
    facts,
    requireVerified: loaded.requireVerified,
    sportCode: loaded.header.sport_code,
  });
}

type FactRow = {
  id: string;
  event_id: string;
  person_id: string;
  attribute: string;
  sport_code: string | null;
  issuer: string | null;
  version_no: number;
  numeric_value: string | number | null;
  text_value: string | null;
  status: EntrantAttribute['status'];
  verified_by: string | null;
  verified_at: Date | string | null;
  valid_from: string | null;
  valid_until: string | null;
  evidence_id: string | null;
  superseded_by: string | null;
  recorded_at: Date | string;
};

export async function loadFacts(
  db: Queryable,
  eventId: string,
  personIds: string[],
): Promise<EntrantAttribute[]> {
  if (personIds.length === 0) return [];
  const { rows } = await db.query<FactRow>(
    `SELECT id, event_id, person_id, attribute, sport_code, issuer, version_no,
            numeric_value::text, text_value, status, verified_by, verified_at,
            valid_from::text, valid_until::text, evidence_id, superseded_by, recorded_at
       FROM core.entrant_attribute
      WHERE event_id = $1 AND person_id = ANY($2::uuid[])`,
    [eventId, personIds],
  );
  return rows.map((row) => ({
    id: row.id,
    eventId: row.event_id,
    personId: row.person_id,
    attribute: row.attribute,
    sportCode: row.sport_code ?? undefined,
    issuer: row.issuer ?? undefined,
    versionNo: row.version_no,
    numericValue: asNumber(row.numeric_value),
    textValue: row.text_value ?? undefined,
    status: row.status,
    verifiedBy: row.verified_by ?? undefined,
    verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : undefined,
    validFrom: row.valid_from ?? undefined,
    validUntil: row.valid_until ?? undefined,
    evidenceId: row.evidence_id ?? undefined,
    supersededBy: row.superseded_by ?? undefined,
    recordedAt: new Date(row.recorded_at).toISOString(),
  }));
}

export type EntryRoster = {
  entryId: string;
  eventId: string;
  ownerPersonId: string;
  ruleVersionId: string;
  productId: string;
  ruleSetId: string;
  status: string;
  currentCategoryName: string | null;
  teamLabel: string;
  paid: boolean;
  roster: Array<{ personId: string; name: string; dob: string; role?: string }>;
};

export async function loadEntryRoster(db: Queryable, entryId: string): Promise<EntryRoster | null> {
  const header = await db.query<{
    id: string;
    event_id: string;
    rule_version_id: string;
    sport_entry_product_id: string;
    rule_set_id: string;
    status: string;
    current_category_name: string | null;
    team_roster_id: string | null;
    current_roster_version_id: string | null;
    owner_id: string;
    owner_given: string;
    owner_family: string;
    owner_dob: string;
    partner_id: string | null;
    partner_given: string | null;
    partner_family: string | null;
    partner_dob: string | null;
    paid: boolean;
  }>(
    `SELECT e.id, e.event_id, e.rule_version_id, e.sport_entry_product_id, p.rule_set_id,
            e.status, e.current_category_name, e.team_roster_id, e.current_roster_version_id,
            owner.id AS owner_id, owner.given_name AS owner_given, owner.family_name AS owner_family,
            owner.date_of_birth::text AS owner_dob,
            partner.id AS partner_id, partner.given_name AS partner_given,
            partner.family_name AS partner_family, partner.date_of_birth::text AS partner_dob,
            EXISTS (
              SELECT 1
                FROM core.order_line ol
                JOIN core.payment_intent pi ON pi.order_id = ol.order_id
               WHERE ol.entry_id = e.id AND pi.status = 'settled'
            ) AS paid
       FROM core.registration_entry e
       JOIN core.sport_entry_product p ON p.id = e.sport_entry_product_id
       JOIN core.athlete_profile ap ON ap.id = e.athlete_profile_id
       JOIN core.person owner ON owner.id = ap.person_id
       LEFT JOIN core.athlete_profile pp ON pp.id = e.partner_profile_id
       LEFT JOIN core.person partner ON partner.id = pp.person_id
      WHERE e.id = $1`,
    [entryId],
  );
  const row = header.rows[0];
  if (!row) return null;

  if (row.team_roster_id) {
    /**
     * The entry's own roster version is what the category was decided from — publish and
     * substitution both derive from `core.roster_selection`. Reading `core.roster_member` here
     * instead made the admin detail disagree with the entry it was describing (a coxed four read
     * as Category B while the entry said Category C, because the membership list carries the
     * coxswain and pre-publish dates of birth). `core.roster_member` is the fallback only while a
     * team has no published version yet.
     */
    const members = await db.query<{
      person_id: string;
      display_name: string;
      date_of_birth: string;
      role: string | null;
    }>(
      `SELECT selection.person_id, selection.display_name, selection.date_of_birth::text,
              selection.role
         FROM core.roster_selection selection
        WHERE selection.roster_version_id = $1 AND selection.competes
        ORDER BY selection.position`,
      [row.current_roster_version_id],
    );
    if (members.rows.length === 0) {
      members.rows = (
        await db.query<{
          person_id: string;
          display_name: string;
          date_of_birth: string;
          role: string | null;
        }>(
          `SELECT person_id, display_name, date_of_birth::text, role
             FROM core.roster_member WHERE roster_id = $1 ORDER BY position`,
          [row.team_roster_id],
        )
      ).rows;
    }
    const roster = members.rows.map((m) => ({
      personId: m.person_id,
      name: m.display_name,
      dob: m.date_of_birth.slice(0, 10),
      role: m.role ?? undefined,
    }));
    return {
      entryId: row.id,
      eventId: row.event_id,
      ownerPersonId: row.owner_id,
      ruleVersionId: row.rule_version_id,
      productId: row.sport_entry_product_id,
      ruleSetId: row.rule_set_id,
      status: row.status,
      currentCategoryName: row.current_category_name,
      teamLabel: roster.map((m) => m.name).join(' / '),
      paid: row.paid,
      roster,
    };
  }

  const roster: EntryRoster['roster'] = [
    {
      personId: row.owner_id,
      name: `${row.owner_given} ${row.owner_family}`,
      dob: row.owner_dob.slice(0, 10),
    },
  ];
  if (row.partner_id && row.partner_dob && row.partner_given && row.partner_family) {
    roster.push({
      personId: row.partner_id,
      name: `${row.partner_given} ${row.partner_family}`,
      dob: row.partner_dob.slice(0, 10),
      role: 'partner',
    });
  }
  return {
    entryId: row.id,
    eventId: row.event_id,
    ownerPersonId: row.owner_id,
    ruleVersionId: row.rule_version_id,
    productId: row.sport_entry_product_id,
    ruleSetId: row.rule_set_id,
    status: row.status,
    currentCategoryName: row.current_category_name,
    teamLabel: roster.map((m) => m.name).join(' / '),
    paid: row.paid,
    roster,
  };
}

export async function listLiveEntriesForSet(
  db: Queryable,
  ruleSetId: string,
): Promise<EntryRoster[]> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT e.id
       FROM core.registration_entry e
       JOIN core.sport_entry_product p ON p.id = e.sport_entry_product_id
      WHERE p.rule_set_id = $1
        AND e.status NOT IN ('withdrawn', 'cancelled', 'disqualified')
      ORDER BY e.created_at, e.id`,
    [ruleSetId],
  );
  const out: EntryRoster[] = [];
  for (const row of rows) {
    const loaded = await loadEntryRoster(db, row.id);
    if (loaded) out.push(loaded);
  }
  return out;
}

export { asIsoDate };
