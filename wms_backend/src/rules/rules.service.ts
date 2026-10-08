import { Inject, Injectable } from '@nestjs/common';
import type {
  EntrantAttribute,
  MultiDimensionDerivation,
  PublishRuleChangeInput,
  RuleChangeNotice,
  SportRule,
} from '@wms/domain';
import { IdempotencyService, type Queryable } from '../common/idempotency/idempotency.service';
import { pool } from '../db/pool';
import { OC_ROLE_CODES } from '../people/profile.schema';
import { refuse } from '../people/refuse';
import { contentHash, headerKey, requireUuid, rethrowFrozen } from './helpers';
import {
  aggregationToStrategy,
  deriveLoaded,
  listActiveVersions,
  listLiveEntriesForSet,
  loadActiveForSet,
  loadEntryRoster,
  loadFacts,
  loadVersion,
  strategyToAggregation,
  toSportRule,
  type LoadedVersion,
} from './load';
import {
  categoryCheckSchema,
  createDraftSchema,
  parseBody,
  previewSchema,
  type CreateDraftBody,
  type PreviewBody,
} from './schema';

export type RegistrationOptionProduct = {
  id: string;
  name: string;
  sportId: string;
  sportName: string;
  participantType: string;
  allowedGrades: string[];
  partnerRequired: boolean;
  requiresEvidence: boolean;
  /** The caller's live entry for this product, if any — open it rather than create another. */
  myEntryId: string | null;
  /** Individual products only; null where the category depends on a partner or roster. */
  category: {
    name: string | null;
    eligible: boolean;
    referenceDate: string;
    blockedBy: string[];
  } | null;
};

export type RegistrationOptions = {
  event: {
    id: string;
    name: string;
    startsOn: string;
    endsOn: string;
    registrationOpen: boolean;
  } | null;
  products: RegistrationOptionProduct[];
};

export type CategoryCheckProduct = {
  id: string;
  name: string;
  participantType: string;
  sport: string;
  event: string;
};

export type CategoryCheckResult = {
  sportEntryProductId: string;
  sport: string;
  ruleVersionId: string;
  version: string;
  referenceDate: string;
  derivation: MultiDimensionDerivation;
};

export type RuleImpactRegistration = {
  id: string;
  team: string;
  roster: Array<{ id: string; name: string; dob: string; role?: string }>;
};

export type RulesOverview = {
  rule: SportRule;
  ruleSetId: string;
  versionId: string;
  registrations: RuleImpactRegistration[];
  latestNotice: RuleChangeNotice | null;
};

export type ImpactAnalysisView = {
  versionId: string;
  analysisId: string;
  entriesExamined: number;
  entriesAffected: number;
  paidAffected: number;
  rows: Array<{
    registration: RuleImpactRegistration;
    impact: {
      changed: boolean;
      fromCategory: string;
      toCategory: string;
      fromBandingAge: number;
      toBandingAge: number;
      reason: string;
    };
  }>;
};

function isOc(roles: string[]): boolean {
  return roles.some((role) => (OC_ROLE_CODES as readonly string[]).includes(role));
}

function bumpLabel(reason: string | null, versionNo: number): string {
  const current = reason ?? `v${versionNo}.0`;
  const match = /^v(\d+)\.(\d+)$/.exec(current);
  return match ? `v${match[1]}.${Number(match[2]) + 1}` : `v${versionNo + 1}.0`;
}

function ageValue(derivation: MultiDimensionDerivation): number {
  const age = derivation.dimensions.find((d) => d.attribute === 'age');
  return typeof age?.value === 'number' ? age.value : 0;
}

function previewFacts(body: PreviewBody, eventId: string): EntrantAttribute[] {
  return (body.facts ?? []).map((f) => ({
    id: f.id,
    eventId,
    personId: f.personId,
    attribute: f.attribute,
    versionNo: f.versionNo ?? 1,
    numericValue: f.numericValue,
    textValue: f.textValue,
    status: f.status ?? 'verified',
    recordedAt: '2026-01-01T00:00:00.000Z',
  }));
}

@Injectable()
export class RulesService {
  constructor(@Inject(IdempotencyService) private readonly idempotency: IdempotencyService) {}

  async listRules(sport?: string, event?: string): Promise<SportRule[]> {
    const loaded = await listActiveVersions(pool, { sport, event });
    return loaded.map((item) =>
      toSportRule(
        item.header,
        item.dimensions.find((d) => d.attribute === 'age'),
      ),
    );
  }

  async getRule(id: string): Promise<SportRule> {
    const loaded = await loadVersion(pool, requireUuid(id, 'rules.version.invalid'));
    if (!loaded || loaded.header.status !== 'active') {
      refuse('RULE_NOT_FOUND', 'rules.version.not_found');
    }
    return toSportRule(
      loaded.header,
      loaded.dimensions.find((d) => d.attribute === 'age'),
    );
  }

  async getActiveForProduct(productId: string): Promise<LoadedVersion> {
    const { rows } = await pool.query<{ rule_set_id: string }>(
      `SELECT rule_set_id FROM core.sport_entry_product WHERE id = $1`,
      [requireUuid(productId, 'rules.product.invalid')],
    );
    const setId = rows[0]?.rule_set_id;
    if (!setId) refuse('SPORT_ENTRY_PRODUCT_NOT_FOUND', 'rules.product.not_found');
    const loaded = await loadActiveForSet(pool, setId);
    if (!loaded) refuse('RULE_VERSION_NOT_FOUND', 'rules.version.not_found');
    return loaded;
  }

  async deriveForEntry(
    identity: { personId: string; roles: string[] },
    entryId: string,
  ): Promise<MultiDimensionDerivation> {
    const entry = await loadEntryRoster(pool, requireUuid(entryId, 'rules.entry.invalid'));
    if (!entry) refuse('REGISTRATION_ENTRY_NOT_FOUND', 'rules.entry.not_found');
    if (entry.ownerPersonId !== identity.personId && !isOc(identity.roles)) {
      refuse('REGISTRATION_ENTRY_NOT_FOUND', 'rules.entry.not_found');
    }
    const loaded = await loadVersion(pool, entry.ruleVersionId);
    if (!loaded) refuse('RULE_VERSION_NOT_FOUND', 'rules.version.not_found');
    const facts = await loadFacts(
      pool,
      entry.eventId,
      entry.roster.map((m) => m.personId),
    );
    return deriveLoaded(
      loaded,
      entry.roster.map((m) => ({ personId: m.personId, dob: m.dob, role: m.role })),
      facts,
    );
  }

  async previewDerivation(versionId: string, body: unknown): Promise<MultiDimensionDerivation> {
    const loaded = await loadVersion(pool, requireUuid(versionId, 'rules.version.invalid'));
    if (!loaded) refuse('RULE_VERSION_NOT_FOUND', 'rules.version.not_found');
    const preview = parseBody(previewSchema, body, 'rules.preview.invalid');
    return deriveLoaded(loaded, preview.roster, previewFacts(preview, loaded.header.event_id));
  }

  /**
   * What the signed-in participant can register for right now, and — for individual products —
   * the category their own date of birth gets under the active rule.
   *
   * The participant app had no catalogue read: products only arrived inside a journey snapshot,
   * and a snapshot needs an entry id. So a person with no entries could not see anything to
   * register for. `myEntryId` lets the app open an existing live entry instead of offering a
   * duplicate the backend would refuse anyway.
   *
   * The category is a preview through the same `deriveLoaded` the entry derivation endpoint uses.
   * Doubles, team and crew categories depend on who else is on the entry, so they are `null`
   * here and derived when the partner or roster is chosen.
   */
  async registrationOptions(personId: string, eventId?: string): Promise<RegistrationOptions> {
    const event = await pool.query<{
      id: string;
      name: string;
      starts_on: string;
      ends_on: string;
      status: string;
    }>(
      `SELECT id, name, starts_on::text, ends_on::text, status
         FROM core.event WHERE id = COALESCE($1::uuid, core.current_event_id())`,
      [eventId ? requireUuid(eventId, 'rules.event.invalid') : null],
    );
    const current = event.rows[0];
    if (!current) return { event: null, products: [] };

    const person = await pool.query<{ date_of_birth: string; profile_status: string }>(
      `SELECT date_of_birth::text, profile_status FROM core.person WHERE id = $1`,
      [personId],
    );
    const self = person.rows[0];

    const { rows } = await pool.query<{
      id: string;
      name: string;
      sport_id: string;
      sport_name: string;
      participant_type: string;
      allowed_grades: string[];
      partner_required: boolean;
      requires_evidence: boolean;
      rule_set_id: string;
      my_entry_id: string | null;
    }>(
      `SELECT sp.id, sp.name, sp.sport_id, s.name AS sport_name, sp.participant_type,
              sp.allowed_grades, sp.partner_required, sp.requires_evidence, sp.rule_set_id,
              (SELECT e.id
                 FROM core.registration_entry e
                 JOIN core.athlete_profile ap ON ap.id = e.athlete_profile_id
                WHERE ap.person_id = $2
                  AND e.sport_entry_product_id = sp.id
                  AND e.status NOT IN ('cancelled','withdrawn','substituted')
                LIMIT 1) AS my_entry_id
         FROM core.sport_entry_product sp
         JOIN core.sport s ON s.id = sp.sport_id
        WHERE sp.event_id = $1
        ORDER BY s.name, sp.name`,
      [current.id, personId],
    );

    const facts = await loadFacts(pool, current.id, [personId]);
    const products: RegistrationOptionProduct[] = [];
    for (const row of rows) {
      let category: RegistrationOptionProduct['category'] = null;
      const individual = row.participant_type === 'individual' && !row.partner_required;
      if (individual && self?.profile_status === 'complete') {
        const loaded = await loadActiveForSet(pool, row.rule_set_id);
        if (loaded) {
          const derivation = deriveLoaded(loaded, [{ personId, dob: self.date_of_birth }], facts);
          category = {
            name: derivation.categoryName || null,
            eligible: Boolean(derivation.categoryName) && derivation.blockedBy.length === 0,
            referenceDate: derivation.referenceDate,
            blockedBy: derivation.blockedBy.map((item) => item.messageKey),
          };
        }
      }
      products.push({
        id: row.id,
        name: row.name,
        sportId: row.sport_id,
        sportName: row.sport_name,
        participantType: row.participant_type,
        allowedGrades: row.allowed_grades,
        partnerRequired: row.partner_required,
        requiresEvidence: row.requires_evidence,
        myEntryId: row.my_entry_id,
        category,
      });
    }

    return {
      event: {
        id: current.id,
        name: current.name,
        startsOn: current.starts_on,
        endsOn: current.ends_on,
        registrationOpen: current.status === 'registration_open',
      },
      products,
    };
  }

  /** Products the category checker can be pointed at, with the sport they belong to. */
  async categoryCheckProducts(): Promise<CategoryCheckProduct[]> {
    const { rows } = await pool.query<{
      id: string;
      name: string;
      participant_type: string;
      sport_name: string;
      event_name: string;
    }>(
      `SELECT sp.id, sp.name, sp.participant_type, s.name AS sport_name, ev.name AS event_name
         FROM core.sport_entry_product sp
         JOIN core.sport s ON s.id = sp.sport_id
         JOIN core.event ev ON ev.id = sp.event_id
        ORDER BY ev.starts_on DESC, s.name, sp.name`,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      participantType: row.participant_type,
      sport: row.sport_name,
      event: row.event_name,
    }));
  }

  /**
   * "What category would this date of birth get?" — answered by the ACTIVE rule for the product
   * and the same `deriveLoaded` the participant screen and impact analysis use, with no entry
   * created. Testing a band used to mean registering, reading the result, and resetting the
   * database, because an entry locks the date of birth that produced it.
   */
  async categoryCheck(body: unknown): Promise<CategoryCheckResult> {
    const input = parseBody(categoryCheckSchema, body, 'rules.category_check.invalid');
    const loaded = await this.getActiveForProduct(input.sportEntryProductId);
    const derivation = deriveLoaded(
      loaded,
      input.members.map((member, index) => ({
        personId: `member-${index + 1}`,
        dob: member.dateOfBirth,
        role: member.role,
      })),
      [],
    );
    return {
      sportEntryProductId: input.sportEntryProductId,
      sport: loaded.header.sport_name,
      ruleVersionId: loaded.header.id,
      version: loaded.header.reason ?? `v${loaded.header.version_no}.0`,
      referenceDate: loaded.header.reference_date,
      derivation,
    };
  }

  async overview(sport?: string, event?: string): Promise<RulesOverview> {
    const loadedList = await listActiveVersions(pool, {
      sport: sport ?? 'Tennis',
      event: event ?? "Men's Doubles",
    });
    const loaded = loadedList[0];
    if (!loaded) refuse('RULE_VERSION_NOT_FOUND', 'rules.version.not_found');
    const entries = await listLiveEntriesForSet(pool, loaded.header.rule_set_id);
    return {
      rule: toSportRule(
        loaded.header,
        loaded.dimensions.find((d) => d.attribute === 'age'),
      ),
      ruleSetId: loaded.header.rule_set_id,
      versionId: loaded.header.id,
      registrations: entries.map((e) => ({
        id: e.entryId,
        team: e.teamLabel,
        roster: e.roster.map((m) => ({ id: m.personId, name: m.name, dob: m.dob, role: m.role })),
      })),
      latestNotice: await this.latestNotice(
        loaded.header.sport_name,
        loaded.header.event_name ?? undefined,
      ),
    };
  }

  async latestNotice(
    sport?: string,
    event?: string,
    personId?: string,
  ): Promise<RuleChangeNotice | null> {
    const { rows } = await pool.query<{
      id: string;
      sport_name: string;
      event_name: string | null;
      reason: string | null;
      prev_reason: string | null;
      aggregation: string;
      prev_aggregation: string | null;
      published_at: Date | string;
      entries_affected: number | null;
      entries_examined: number | null;
      version_no: number;
    }>(
      `SELECT rv.id, coalesce(s.name, rs.sport_code) AS sport_name, rs.event_name, rv.reason,
              prev.reason AS prev_reason, d.aggregation, prev_d.aggregation AS prev_aggregation,
              rv.published_at, a.entries_affected, a.entries_examined, rv.version_no
         FROM core.rule_version rv
         JOIN core.rule_set rs ON rs.id = rv.rule_set_id
         LEFT JOIN core.sport s ON s.event_id = rs.event_id AND s.code = rs.sport_code
         LEFT JOIN core.rule_dimension d
           ON d.rule_version_id = rv.id AND d.attribute = 'age'
         LEFT JOIN core.rule_version prev
           ON prev.rule_set_id = rv.rule_set_id AND prev.version_no = rv.version_no - 1
         LEFT JOIN core.rule_dimension prev_d
           ON prev_d.rule_version_id = prev.id AND prev_d.attribute = 'age'
         LEFT JOIN core.rule_impact_analysis a ON a.id = rv.impact_analysis_id
        WHERE rv.published_at IS NOT NULL
          AND rv.version_no > 1
          AND ($1::text IS NULL OR lower(coalesce(s.name, rs.sport_code)) = lower($1))
          AND ($2::text IS NULL OR lower(coalesce(rs.event_name, '')) = lower($2))
        ORDER BY rv.published_at DESC
        LIMIT 1`,
      [sport ?? null, event ?? null],
    );
    const row = rows[0];
    if (!row) return null;
    let status: RuleChangeNotice['status'] = 'published';
    if (personId) {
      const ack = await pool.query<{ acknowledged_at: Date | string | null }>(
        `SELECT acknowledged_at FROM core.rule_notification
          WHERE rule_version_id = $1 AND person_id = $2 LIMIT 1`,
        [row.id, personId],
      );
      if (ack.rows[0]?.acknowledged_at) status = 'acknowledged';
    }
    return {
      id: row.id,
      sport: row.sport_name,
      event: row.event_name ?? undefined,
      fromVersion: row.prev_reason ?? `v${row.version_no - 1}.0`,
      toVersion: row.reason ?? `v${row.version_no}.0`,
      fromStrategy: aggregationToStrategy(row.prev_aggregation ?? row.aggregation),
      toStrategy: aggregationToStrategy(row.aggregation),
      affectedCount: row.entries_affected ?? 0,
      totalCount: row.entries_examined ?? 0,
      occurredAt: new Date(row.published_at).toISOString(),
      status,
    };
  }

  async acknowledgeChange(personId: string, noticeId: string): Promise<RuleChangeNotice> {
    const versionId = requireUuid(noticeId, 'rules.change.invalid');
    const loaded = await loadVersion(pool, versionId);
    if (!loaded || !loaded.header.published_at)
      refuse('RULE_CHANGE_NOT_FOUND', 'rules.change.not_found');
    await pool.query(
      `INSERT INTO core.rule_notification
         (rule_version_id, person_id, channel, locale, sent_at, acknowledged_at)
       VALUES ($1, $2, 'inapp', 'en', now(), now())
       ON CONFLICT (rule_version_id, person_id, entry_id) DO UPDATE
         SET acknowledged_at = coalesce(core.rule_notification.acknowledged_at, now())`,
      [versionId, personId],
    );
    const notice = await this.latestNotice(
      loaded.header.sport_name,
      loaded.header.event_name ?? undefined,
      personId,
    );
    if (!notice) refuse('RULE_CHANGE_NOT_FOUND', 'rules.change.not_found');
    return { ...notice, status: 'acknowledged', acknowledgedAt: new Date().toISOString() };
  }

  async createDraft(args: {
    actorId: string;
    ruleSetId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    body: unknown;
  }): Promise<{ versionId: string; versionLabel: string; rule: SportRule }> {
    const ruleSetId = requireUuid(args.ruleSetId, 'rules.set.invalid');
    const body = parseBody(createDraftSchema, args.body, 'rules.draft.invalid');
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/admin/rule-sets/${ruleSetId}/versions`,
        body,
        mode: 'local',
      },
      async (tx) => {
        const created = await this.insertDraft(tx, ruleSetId, args.actorId, body);
        return { status: 201, body: created };
      },
    );
    return result.body as { versionId: string; versionLabel: string; rule: SportRule };
  }

  async analyzeImpact(args: {
    actorId: string;
    versionId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
  }): Promise<ImpactAnalysisView> {
    const versionId = requireUuid(args.versionId, 'rules.version.invalid');
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/admin/rule-versions/${versionId}/impact-analysis`,
        body: { versionId },
        mode: 'local',
      },
      async (tx) => {
        const view = await this.runImpact(tx, versionId, args.actorId);
        return { status: 200, body: view };
      },
    );
    return result.body as ImpactAnalysisView;
  }

  async publish(args: {
    actorId: string;
    versionId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
  }): Promise<{ rule: SportRule; notice: RuleChangeNotice }> {
    const versionId = requireUuid(args.versionId, 'rules.version.invalid');
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/admin/rule-versions/${versionId}/publish`,
        body: { versionId },
        mode: 'local',
      },
      async (tx) => {
        const loaded = await loadVersion(tx, versionId);
        if (!loaded) refuse('RULE_VERSION_NOT_FOUND', 'rules.version.not_found');
        if (loaded.header.status !== 'draft')
          refuse('RULE_VERSION_NOT_DRAFT', 'rules.version.not_draft');
        await tx.query(`SELECT core.publish_rule_version($1, $2)`, [versionId, args.actorId]);
        const published = await loadVersion(tx, versionId);
        if (!published) refuse('RULE_VERSION_NOT_FOUND', 'rules.version.not_found');
        const rule = toSportRule(
          published.header,
          published.dimensions.find((d) => d.attribute === 'age'),
        );
        const notice = await this.noticeFrom(tx, published);
        return { status: 200, body: { rule, notice } };
      },
    );
    return result.body as { rule: SportRule; notice: RuleChangeNotice };
  }

  /** Compatibility for the old A04 payload: create a draft from strategy, analyse, publish. */
  async publishFromNotice(args: {
    actorId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    body: unknown;
  }): Promise<RuleChangeNotice> {
    const input = args.body as PublishRuleChangeInput;
    const loadedList = await listActiveVersions(pool, { sport: input.sport, event: input.event });
    const current = loadedList[0];
    if (!current) refuse('RULE_VERSION_NOT_FOUND', 'rules.version.not_found');
    const created = await this.createDraft({
      actorId: args.actorId,
      ruleSetId: current.header.rule_set_id,
      scope: args.scope,
      headers: args.headers,
      body: {
        fromVersionId: current.header.id,
        aggregation: strategyToAggregation(input.toStrategy),
        versionLabel: input.toVersion,
      } satisfies CreateDraftBody,
    });
    await this.analyzeImpact({
      actorId: args.actorId,
      versionId: created.versionId,
      scope: args.scope,
      headers: { ...args.headers, 'idempotency-key': `${headerKey(args.headers)}:impact` },
    });
    const published = await this.publish({
      actorId: args.actorId,
      versionId: created.versionId,
      scope: args.scope,
      headers: { ...args.headers, 'idempotency-key': `${headerKey(args.headers)}:publish` },
    });
    return published.notice;
  }

  async patchAgeDimension(args: { versionId: string; body: unknown }): Promise<SportRule> {
    const versionId = requireUuid(args.versionId, 'rules.version.invalid');
    const loaded = await loadVersion(pool, versionId);
    if (!loaded) refuse('RULE_VERSION_NOT_FOUND', 'rules.version.not_found');
    const body = parseBody(
      createDraftSchema.pick({ aggregation: true, bands: true }),
      args.body,
      'rules.patch.invalid',
    );
    try {
      await pool.query(
        `UPDATE core.rule_dimension
            SET aggregation = coalesce($2, aggregation),
                bands = coalesce($3::jsonb, bands)
          WHERE rule_version_id = $1 AND attribute = 'age'`,
        [versionId, body.aggregation ?? null, body.bands ? JSON.stringify(body.bands) : null],
      );
    } catch (err) {
      rethrowFrozen(err);
    }
    const next = await loadVersion(pool, versionId);
    if (!next) refuse('RULE_VERSION_NOT_FOUND', 'rules.version.not_found');
    return toSportRule(
      next.header,
      next.dimensions.find((d) => d.attribute === 'age'),
    );
  }

  private async insertDraft(
    tx: Queryable,
    ruleSetId: string,
    _actorId: string,
    body: CreateDraftBody,
  ): Promise<{ versionId: string; versionLabel: string; rule: SportRule }> {
    const from = await loadVersion(tx, body.fromVersionId);
    if (!from || from.header.rule_set_id !== ruleSetId) {
      refuse('RULE_VERSION_NOT_FOUND', 'rules.version.not_found');
    }
    const versionLabel = body.versionLabel ?? bumpLabel(from.header.reason, from.header.version_no);
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO core.rule_version
         (rule_set_id, version_no, reference_date, effective, status, reason)
       SELECT $1, coalesce(max(version_no), 0) + 1, $2, tstzrange(now(), NULL), 'draft', $3
         FROM core.rule_version WHERE rule_set_id = $1
       RETURNING id`,
      [ruleSetId, from.header.reference_date, versionLabel],
    );
    const versionId = inserted.rows[0]?.id;
    if (!versionId) refuse('RULE_VERSION_NOT_FOUND', 'rules.version.not_found');
    try {
      await tx.query(
        `INSERT INTO core.rule_dimension
           (rule_version_id, ordinal, attribute, aggregation, exclude_roles, rounding,
            value_scale, band_kind, bands)
         SELECT $1, ordinal, attribute,
                CASE WHEN attribute = 'age' AND $3::text IS NOT NULL THEN $3 ELSE aggregation END,
                exclude_roles, rounding, value_scale, band_kind,
                CASE WHEN attribute = 'age' AND $4::jsonb IS NOT NULL THEN $4 ELSE bands END
           FROM core.rule_dimension WHERE rule_version_id = $2`,
        [
          versionId,
          body.fromVersionId,
          body.aggregation ?? null,
          body.bands ? JSON.stringify(body.bands) : null,
        ],
      );
      await tx.query(
        `INSERT INTO core.rule_eligibility
           (rule_version_id, ordinal, predicate, params, severity, message_key)
         SELECT $1, ordinal, predicate, params, severity, message_key
           FROM core.rule_eligibility WHERE rule_version_id = $2`,
        [versionId, body.fromVersionId],
      );
    } catch (err) {
      rethrowFrozen(err);
    }
    const loaded = await loadVersion(tx, versionId);
    if (!loaded) refuse('RULE_VERSION_NOT_FOUND', 'rules.version.not_found');
    return {
      versionId,
      versionLabel,
      rule: toSportRule(
        loaded.header,
        loaded.dimensions.find((d) => d.attribute === 'age'),
      ),
    };
  }

  private async runImpact(
    tx: Queryable,
    versionId: string,
    actorId: string,
  ): Promise<ImpactAnalysisView> {
    const draft = await loadVersion(tx, versionId);
    if (!draft) refuse('RULE_VERSION_NOT_FOUND', 'rules.version.not_found');
    if (draft.header.status !== 'draft')
      refuse('RULE_VERSION_NOT_DRAFT', 'rules.version.not_draft');
    const active = await loadActiveForSet(tx, draft.header.rule_set_id);
    const entries = await listLiveEntriesForSet(tx, draft.header.rule_set_id);
    const rows: ImpactAnalysisView['rows'] = [];
    let paidAffected = 0;
    for (const entry of entries) {
      const facts = await loadFacts(
        tx,
        entry.eventId,
        entry.roster.map((m) => m.personId),
      );
      const roster = entry.roster.map((m) => ({ personId: m.personId, dob: m.dob, role: m.role }));
      const before = active
        ? deriveLoaded(active, roster, facts)
        : {
            categoryName: entry.currentCategoryName ?? '',
            dimensions: [],
            blockedBy: [],
            ruleVersionId: entry.ruleVersionId,
            referenceDate: draft.header.reference_date,
          };
      const after = deriveLoaded(draft, roster, facts);
      if (before.categoryName === after.categoryName) continue;
      if (entry.paid) paidAffected += 1;
      rows.push({
        registration: {
          id: entry.entryId,
          team: entry.teamLabel,
          roster: entry.roster.map((m) => ({
            id: m.personId,
            name: m.name,
            dob: m.dob,
            role: m.role,
          })),
        },
        impact: {
          changed: true,
          fromCategory: before.categoryName,
          toCategory: after.categoryName,
          fromBandingAge: ageValue(before),
          toBandingAge: ageValue(after),
          reason: 'Rule register updated',
        },
      });
    }
    const hash = await contentHash(tx, versionId);
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO core.rule_impact_analysis
         (rule_version_id, entries_examined, entries_affected, paid_affected, summary,
          evaluated_content_hash, ran_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       RETURNING id`,
      [
        versionId,
        entries.length,
        rows.length,
        paidAffected,
        JSON.stringify({
          note: 'preview before publish',
          affected: rows.map((r) => r.registration.id),
        }),
        hash,
        actorId,
      ],
    );
    const analysisId = inserted.rows[0]?.id;
    if (!analysisId) refuse('IMPACT_ANALYSIS_REQUIRED', 'rules.impact.failed');
    for (const row of rows) {
      await tx.query(
        `INSERT INTO core.rule_impact_entry (analysis_id, entry_id, from_category, to_category, was_paid)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          analysisId,
          row.registration.id,
          row.impact.fromCategory,
          row.impact.toCategory,
          entries.find((e) => e.entryId === row.registration.id)?.paid ?? false,
        ],
      );
    }
    return {
      versionId,
      analysisId,
      entriesExamined: entries.length,
      entriesAffected: rows.length,
      paidAffected,
      rows,
    };
  }

  private async noticeFrom(tx: Queryable, published: LoadedVersion): Promise<RuleChangeNotice> {
    const prev = await tx.query<{ reason: string | null; aggregation: string | null }>(
      `SELECT rv.reason, d.aggregation
         FROM core.rule_version rv
         LEFT JOIN core.rule_dimension d ON d.rule_version_id = rv.id AND d.attribute = 'age'
        WHERE rv.rule_set_id = $1 AND rv.version_no = $2`,
      [published.header.rule_set_id, published.header.version_no - 1],
    );
    const analysis = await tx.query<{ entries_affected: number; entries_examined: number }>(
      `SELECT entries_affected, entries_examined FROM core.rule_impact_analysis WHERE id = (
         SELECT impact_analysis_id FROM core.rule_version WHERE id = $1)`,
      [published.header.id],
    );
    const age = published.dimensions.find((d) => d.attribute === 'age');
    return {
      id: published.header.id,
      sport: published.header.sport_name,
      event: published.header.event_name ?? undefined,
      fromVersion: prev.rows[0]?.reason ?? `v${published.header.version_no - 1}.0`,
      toVersion: published.header.reason ?? `v${published.header.version_no}.0`,
      fromStrategy: aggregationToStrategy(prev.rows[0]?.aggregation ?? age?.aggregation ?? 'self'),
      toStrategy: aggregationToStrategy(age?.aggregation ?? 'self'),
      affectedCount: analysis.rows[0]?.entries_affected ?? 0,
      totalCount: analysis.rows[0]?.entries_examined ?? 0,
      occurredAt: published.header.published_at
        ? new Date(published.header.published_at).toISOString()
        : new Date().toISOString(),
      status: 'published',
    };
  }
}
