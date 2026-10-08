/**
 * The first real repository: `RegistrationJourneyRepository` backed by Postgres instead of
 * a JSON file. This is the point of the schema work — until a repository reads it, the
 * tables are empty furniture.
 *
 * Read path first (`getJourney`, `getEntry`). Mutations follow, because they have to route
 * through the quota-pool claim and the REG-11 status writer, and both deserve their own
 * review rather than being folded into a large first commit.
 *
 * TWO THINGS THIS FILE DELIBERATELY DOES
 * --------------------------------------
 * 1. It returns `EntryQuota` — the shape the participant screens already read — projected
 *    from the pool that actually binds. Storage is `quota_pool`; the UI keeps asking "how
 *    many places are left?" and gets a truthful answer, without every screen learning about
 *    nested caps. See `quotaPool.ts` in @wms/domain for why the two coexist.
 *
 * 2. It runs the whole snapshot in ONE round trip. §6 budgets this endpoint at p95 < 150ms
 *    and it backs the participant's main screen; thirteen sequential queries is the N+1 the
 *    plan's own test forbids.
 */

import { Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import {
  bindingPool,
  headroom,
  type AthleteProfile,
  type DocumentStatus,
  type DocumentType,
  type EntryGrade,
  type EntryQuota,
  type Event,
  type EventStatus,
  type EvidenceStatus,
  type ExportParticipantEntryRequest,
  type ExportParticipantEntryResponse,
  type Fee,
  type GetRegistrationJourneyRequest,
  type EntryDecision,
  type JourneyDocument,
  type JourneyPayment,
  type OrdinaryEvidenceType,
  type PaginatedResponse,
  type PayOrderRequest,
  type PayOrderResponse,
  type QuotaPool,
  type RegistrationEntry,
  type RegistrationJourneySnapshot,
  type RegistrationOrder,
  type SaveEntryRequest,
  type Sport,
  type SportEntryProduct,
  type SportRule,
  type TransitionEntryStatusRequest,
  type UpdateEntryEvidenceRequest,
  type WaitlistActionRequest,
  type WaitlistActionResponse,
  type WaitlistEntry,
} from '@wms/domain';
import { toSportRule, type VersionRow } from '../rules/load';
import { RepositoryError } from '../common/errors/repositoryError';
import type { IdempotencyService } from '../common/idempotency/idempotency.service';
import type { PaymentProvider } from './payment-provider';
import { RegistrationMutations, type MutationContext } from './registration-mutations';

/** Rows as Postgres returns them — snake_case, dates already parsed by `pg`. */
interface EntryRow {
  id: string;
  event_id: string;
  athlete_profile_id: string;
  sport_entry_product_id: string;
  partner_profile_id: string | null;
  grade: string;
  rule_version_id: string;
  original_category_id: string | null;
  original_category_name: string | null;
  current_category_id: string | null;
  current_category_name: string | null;
  category_change_reason: string | null;
  team_roster_id: string | null;
  evidence_status: string;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
  sport_id?: string;
  order_id?: string | null;
  waitlist_id?: string | null;
}

interface StatusEventRow {
  to_status: string;
  actor_kind: string;
  reason: string | null;
  occurred_at: Date;
}

interface PoolRow {
  id: string;
  event_id: string;
  name: string;
  scope_kind: string;
  scope_ref: string | null;
  allocation: string;
  parent_pool_id: string | null;
  unit: string;
  capacity: number;
  confirmed: number;
  reserved: number;
  release_from: Date | string | null;
  release_until: Date | string | null;
  updated_at: Date | string;
}

const iso = (d: Date | string | null | undefined): string | undefined => {
  if (d == null) return undefined;
  if (d instanceof Date) return d.toISOString();
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? String(d) : parsed.toISOString();
};

function isoRequired(d: Date | string): string {
  return iso(d) ?? String(d);
}

function page<T>(items: T[]): PaginatedResponse<T> {
  return { items, total: items.length };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? (value.filter((item) => item && typeof item === 'object') as Record<string, unknown>[])
    : [];
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length > 0) return Number(value);
  return 0;
}

function asDateOnly(value: unknown): string {
  const raw = asString(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return raw;
}

function toAthlete(row: Record<string, unknown>): AthleteProfile {
  return {
    id: asString(row.id),
    firstName: asString(row.given_name),
    lastName: asString(row.family_name),
    dateOfBirth: asDateOnly(row.date_of_birth),
    nationalityCountryCode: (asString(row.nationality, 'XX') || 'XX').toUpperCase(),
    ...(asString(row.gender) ? { gender: asString(row.gender) } : {}),
    email: asString(row.email),
  };
}

function toEventStatus(status: string): EventStatus {
  if (
    status === 'draft' ||
    status === 'registration_open' ||
    status === 'registration_closed' ||
    status === 'live' ||
    status === 'completed'
  ) {
    return status;
  }
  return 'draft';
}

function toDocType(kind: string): DocumentType {
  if (kind.includes('passport') || kind === 'identity_document') return 'passport_id';
  if (kind.includes('dob')) return 'dob_proof';
  if (kind.includes('medical')) return 'medical_declaration';
  if (kind.includes('waiver')) return 'liability_waiver';
  return 'other';
}

function toDocStatus(status: string): DocumentStatus {
  if (status === 'verified' || status === 'approved') return 'verified';
  if (status === 'rejected') return 'rejected';
  if (status === 'uploaded' || status === 'under_review') return 'uploaded';
  return 'missing';
}

function toRule(row: Record<string, unknown>): SportRule {
  const header: VersionRow = {
    id: asString(row.id),
    rule_set_id: asString(row.rule_set_id),
    event_id: asString(row.event_id),
    sport_code: asString(row.sport_code),
    event_name: typeof row.event_name === 'string' ? row.event_name : null,
    sport_name: asString(row.sport_name),
    version_no: asNumber(row.version_no),
    reference_date: asDateOnly(row.reference_date),
    status: asString(row.status),
    reason: typeof row.reason === 'string' ? row.reason : null,
    effective_from: asString(row.effective_from),
    published_at: (row.published_at as Date | string | null) ?? null,
  };
  const age =
    row.age_bands == null
      ? undefined
      : {
          id: asString(row.id),
          ruleVersionId: asString(row.id),
          ordinal: 0,
          attribute: 'age',
          aggregation: (asString(row.age_aggregation, 'self') || 'self') as never,
          excludeRoles: Array.isArray(row.age_exclude_roles)
            ? (row.age_exclude_roles as string[])
            : [],
          rounding: (asString(row.age_rounding, 'none') || 'none') as never,
          valueScale: 0,
          bandKind: 'range' as const,
          bands: Array.isArray(row.age_bands) ? (row.age_bands as never) : [],
        };
  return toSportRule(header, age);
}

function mapEntry(
  row: EntryRow,
  statusHistory: RegistrationEntry['statusHistory'],
): RegistrationEntry {
  return {
    id: row.id,
    athleteId: row.athlete_profile_id,
    eventId: row.event_id,
    sportId: row.sport_id ?? '',
    sportEntryProductId: row.sport_entry_product_id,
    partnerAthleteId: row.partner_profile_id ?? undefined,
    grade: row.grade as RegistrationEntry['grade'],
    ruleId: row.rule_version_id,
    ruleVersion: row.rule_version_id,
    originalCategoryId: row.original_category_id ?? undefined,
    originalCategoryName: row.original_category_name ?? undefined,
    currentCategoryId: row.current_category_id ?? undefined,
    currentCategoryName: row.current_category_name ?? undefined,
    categoryChangeReason: row.category_change_reason ?? undefined,
    teamRosterId: row.team_roster_id ?? undefined,
    evidenceStatus: row.evidence_status as RegistrationEntry['evidenceStatus'],
    status: row.status as RegistrationEntry['status'],
    statusHistory,
    ...(row.order_id ? { orderId: row.order_id } : {}),
    ...(row.waitlist_id ? { waitlistId: row.waitlist_id } : {}),
    createdAt: isoRequired(row.created_at),
    updatedAt: isoRequired(row.updated_at),
  };
}

/**
 * Maps the one-round-trip jsonb payload onto RegistrationJourneySnapshot.
 * The query still returns snake_case table facts; this is where the contract is honoured.
 */
export function mapJourneySnapshot(payload: Record<string, unknown>): RegistrationJourneySnapshot {
  const entryRow = asRecord(payload.entry) as unknown as EntryRow;
  const history = asList(payload.statusHistory).map((row) => ({
    status: asString(row.to_status) as RegistrationEntry['status'],
    actor: asString(row.actor_kind) as 'participant' | 'admin' | 'system',
    ...(asString(row.reason) ? { reason: asString(row.reason) } : {}),
    occurredAt: isoRequired(row.occurred_at as Date | string),
  }));
  const orderRow = payload.order ? asRecord(payload.order) : null;
  const waitlistRow = payload.waitlist ? asRecord(payload.waitlist) : null;
  if (orderRow) entryRow.order_id = asString(orderRow.id);
  if (waitlistRow) entryRow.waitlist_id = asString(waitlistRow.id);

  const pools = asList(payload.pools).map((row) =>
    toQuotaPool({
      id: asString(row.id),
      event_id: asString(row.event_id),
      name: asString(row.name),
      scope_kind: asString(row.scope_kind),
      scope_ref: typeof row.scope_ref === 'string' ? row.scope_ref : null,
      allocation: asString(row.allocation),
      parent_pool_id: typeof row.parent_pool_id === 'string' ? row.parent_pool_id : null,
      unit: asString(row.unit),
      capacity: asNumber(row.capacity),
      confirmed: asNumber(row.confirmed),
      reserved: asNumber(row.reserved),
      release_from: (row.release_from as Date | null) ?? null,
      release_until: (row.release_until as Date | null) ?? null,
      updated_at: (row.updated_at as Date | string) ?? new Date().toISOString(),
    }),
  );
  const projected = projectQuota(pools);

  const eventRow = asRecord(payload.event);
  const sports = asList(payload.sports).map((row): Sport => ({
    id: asString(row.id),
    name: asString(row.name),
    eventId: asString(row.event_id),
    disciplineIds: [],
    availability: 'available',
  }));

  const products = asList(payload.products).map((row): SportEntryProduct => ({
    id: asString(row.id),
    eventId: asString(row.event_id),
    sportId: asString(row.sport_id),
    name: asString(row.name),
    participantType: asString(row.participant_type) as SportEntryProduct['participantType'],
    ruleId: asString(row.rule_set_id),
    allowedGrades: Array.isArray(row.allowed_grades)
      ? (row.allowed_grades as EntryGrade[])
      : ['competitive', 'recreational'],
    partnerRequired: Boolean(row.partner_required),
    requiresEvidence: Boolean(row.requires_evidence),
  }));

  const event: Event = {
    id: asString(eventRow.id),
    name: asString(eventRow.name),
    // core.event has no venue columns. Empty required fields rather than inventing a city.
    city: '',
    country: '',
    countryCode: 'XX',
    startDate: asDateOnly(eventRow.starts_on),
    endDate: asDateOnly(eventRow.ends_on),
    status: toEventStatus(asString(eventRow.status)),
    sportIds: sports.map((item) => item.id),
  };

  const documents: JourneyDocument[] = asList(payload.documents).map((row) => ({
    id: asString(row.id),
    athleteId: entryRow.athlete_profile_id,
    type: toDocType(asString(row.kind)),
    fileName: asString(row.s3_key) || asString(row.kind),
    status: toDocStatus(asString(row.status)),
    ...(row.uploaded_at ? { uploadedAt: isoRequired(row.uploaded_at as Date | string) } : {}),
    accessLevel: 'standard',
  }));

  const fees: Fee[] = asList(payload.fees).map((row) => ({
    id: asString(row.id),
    eventId: asString(row.event_id),
    sportEntryProductId: asString(row.sport_entry_product_id),
    ...(typeof row.category_id === 'string' ? { categoryId: row.category_id } : {}),
    grade: asString(row.grade) as EntryGrade,
    currency: 'EUR',
    baseAmountMinor: asNumber(row.base_amount_minor),
    serviceAmountMinor: asNumber(row.service_amount_minor),
    effectiveFrom: isoRequired(row.effective_from as Date | string),
    ...(row.effective_to ? { effectiveTo: isoRequired(row.effective_to as Date | string) } : {}),
  }));

  const waitlist: WaitlistEntry | null = waitlistRow
    ? {
        id: asString(waitlistRow.id),
        registrationEntryId: asString(waitlistRow.entry_id),
        quotaId: asString(waitlistRow.quota_pool_id),
        athleteId: entryRow.athlete_profile_id,
        status: asString(waitlistRow.status) as WaitlistEntry['status'],
        ...(waitlistRow.position != null ? { position: asNumber(waitlistRow.position) } : {}),
        ...(waitlistRow.offer_expires_at
          ? { offerExpiresAt: isoRequired(waitlistRow.offer_expires_at as Date | string) }
          : {}),
        ...(waitlistRow.joined_at
          ? { joinedAt: isoRequired(waitlistRow.joined_at as Date | string) }
          : {}),
        updatedAt: isoRequired(waitlistRow.updated_at as Date | string),
      }
    : null;

  const order: RegistrationOrder | null = orderRow
    ? {
        id: asString(orderRow.id),
        registrationEntryId: asString(orderRow.entry_id, entryRow.id),
        currency: 'EUR',
        subtotalAmountMinor: asNumber(orderRow.subtotal_minor),
        serviceAmountMinor: asNumber(orderRow.service_minor),
        totalAmountMinor: asNumber(orderRow.gross_minor),
        status:
          asString(orderRow.status) === 'paid'
            ? 'paid'
            : asString(orderRow.status) === 'cancelled'
              ? 'cancelled'
              : asString(orderRow.status) === 'draft'
                ? 'draft'
                : 'pending_payment',
        createdAt: isoRequired(orderRow.created_at as Date | string),
        updatedAt: isoRequired(
          (orderRow.updated_at as Date | string) ?? (orderRow.created_at as Date | string),
        ),
      }
    : null;

  const paymentRow = payload.payment ? asRecord(payload.payment) : null;
  const payment: JourneyPayment | null = paymentRow
    ? {
        id: asString(paymentRow.id),
        orderId: asString(paymentRow.order_id),
        registrationEntryId: entryRow.id,
        amountMinor: asNumber(paymentRow.amount_minor),
        currency: 'EUR',
        method: 'card',
        status:
          asString(paymentRow.status) === 'settled'
            ? 'captured'
            : asString(paymentRow.status) === 'failed' ||
                asString(paymentRow.status) === 'cancelled'
              ? 'failed'
              : 'pending',
        ...(asString(paymentRow.psp_intent_id)
          ? { providerReference: asString(paymentRow.psp_intent_id) }
          : {}),
        idempotencyKey: asString(paymentRow.idempotency_key, asString(paymentRow.id)),
        attemptCount: asNumber(paymentRow.attempt_count),
        chargeCount: asNumber(paymentRow.charge_count),
        createdAt: isoRequired(paymentRow.created_at as Date | string),
        updatedAt: isoRequired(paymentRow.updated_at as Date | string),
      }
    : null;
  if (order && payment) order.paymentId = payment.id;

  return {
    event,
    athlete: toAthlete(asRecord(payload.athlete)),
    sports: page(sports),
    sportEntryProducts: page(products),
    partners: page(asList(payload.partners).map(toAthlete)),
    rules: page(asList(payload.rules).map(toRule)),
    documents: page(documents),
    entry: mapEntry(entryRow, history),
    fees: page(fees),
    quotas: page(projected ? [projected] : []),
    waitlist,
    order,
    payment,
  };
}

@Injectable()
export class PostgresRegistrationJourneyRepository {
  private readonly mutations: RegistrationMutations;

  constructor(
    private readonly pool: Pool,
    idempotency?: IdempotencyService,
    paymentProvider?: PaymentProvider,
  ) {
    this.mutations = new RegistrationMutations(pool, idempotency, paymentProvider);
  }

  createEntry(input: {
    sportEntryProductId: string;
    grade: string;
    idempotencyKey: string;
    actorId: string;
    scope: string;
  }): Promise<RegistrationEntry> {
    return this.mutations.createEntry(input);
  }

  saveEntry(input: SaveEntryRequest & MutationContext): Promise<EntryDecision> {
    return this.mutations.saveEntry(input);
  }

  updateEvidenceStatus(
    input: UpdateEntryEvidenceRequest & MutationContext,
  ): Promise<RegistrationEntry> {
    return this.mutations.updateEvidenceStatus(input);
  }

  joinWaitlist(
    input: WaitlistActionRequest & MutationContext & { requireOwner: boolean },
  ): Promise<WaitlistActionResponse> {
    return this.mutations.joinWaitlist(input);
  }

  releaseWaitlistOffer(
    input: WaitlistActionRequest & MutationContext & { requireOwner: boolean },
  ): Promise<WaitlistActionResponse> {
    return this.mutations.releaseWaitlistOffer(input);
  }

  expireWaitlistOffer(
    input: WaitlistActionRequest & MutationContext & { requireOwner: boolean },
  ): Promise<WaitlistActionResponse> {
    return this.mutations.expireWaitlistOffer(input);
  }

  claimWaitlistOffer(
    input: WaitlistActionRequest & MutationContext & { requireOwner: boolean },
  ): Promise<WaitlistActionResponse> {
    return this.mutations.claimWaitlistOffer(input);
  }

  /**
   * The OC's waitlist work queue. `release-offer`/`expire-offer` were always correctly
   * OC-gated — releasing a real reservation or expiring one is a staff action, not a
   * participant one — but nothing let an OC actually reach them: no admin screen queried
   * `core.waitlist_entry` at all. This is that read.
   */
  async listWaitlistQueue(): Promise<
    Array<{
      id: string;
      entryId: string;
      athleteName: string;
      sportName: string;
      productName: string;
      status: string;
      position: number | null;
      offerExpiresAt: string | null;
      joinedAt: string | null;
    }>
  > {
    const { rows } = await this.pool.query<{
      id: string;
      entry_id: string;
      given_name: string;
      family_name: string;
      sport_name: string;
      product_name: string;
      status: string;
      position: number | null;
      offer_expires_at: Date | string | null;
      joined_at: Date | string | null;
    }>(
      `SELECT w.id, w.entry_id, athlete.given_name, athlete.family_name,
              sport.name AS sport_name, product.name AS product_name,
              w.status, w.position, w.offer_expires_at, w.joined_at
         FROM core.waitlist_entry w
         JOIN core.registration_entry re ON re.id = w.entry_id
         JOIN core.sport_entry_product product ON product.id = re.sport_entry_product_id
         JOIN core.sport sport ON sport.id = product.sport_id
         JOIN core.athlete_profile ap ON ap.id = re.athlete_profile_id
         JOIN core.person athlete ON athlete.id = ap.person_id
        WHERE w.status IN ('waiting', 'offered')
        ORDER BY w.status DESC, w.position ASC NULLS LAST`,
    );
    return rows.map((row) => ({
      id: row.id,
      entryId: row.entry_id,
      athleteName: `${row.given_name} ${row.family_name}`,
      sportName: row.sport_name,
      productName: row.product_name,
      status: row.status,
      position: row.position,
      offerExpiresAt: row.offer_expires_at
        ? new Date(row.offer_expires_at).toISOString()
        : null,
      joinedAt: row.joined_at ? new Date(row.joined_at).toISOString() : null,
    }));
  }

  payOrder(input: PayOrderRequest & MutationContext): Promise<PayOrderResponse> {
    return this.mutations.payOrder(input);
  }

  transitionEntryStatus(
    input: TransitionEntryStatusRequest & MutationContext & { requireOwner: boolean },
  ): Promise<RegistrationEntry> {
    return this.mutations.transitionEntryStatus(input);
  }

  async getEntry(registrationEntryId: string): Promise<RegistrationEntry | null> {
    const { rows } = await this.pool.query<EntryRow>(
      `SELECT * FROM core.registration_entry WHERE id = $1`,
      [registrationEntryId],
    );
    const row = rows[0];
    if (!row) return null;
    return this.toEntry(row, await this.statusHistory(row.id));
  }

  /**
   * The whole journey in one round trip.
   *
   * Identity is enforced HERE, in the WHERE clause, not by the caller: the entry must belong
   * to the athlete who asked for it. A repository that trusts an athleteId from the request
   * and filters afterwards is one forgotten check away from serving someone else's entry —
   * the same class of defect as the globally-namespaced idempotency key (§4.6).
   */
  async getJourney(input: GetRegistrationJourneyRequest): Promise<RegistrationJourneySnapshot> {
    const { rows } = await this.pool.query<{ payload: Record<string, unknown> | null }>(
      `
      WITH owned AS (
        SELECT e.*, p.sport_id
          FROM core.registration_entry e
          JOIN core.athlete_profile ap ON ap.id = e.athlete_profile_id
          JOIN core.sport_entry_product p ON p.id = e.sport_entry_product_id
         WHERE e.id = $1
           AND e.event_id = $2
           AND ap.person_id = $3
      )
      SELECT jsonb_build_object(
        'entry', (SELECT to_jsonb(owned) FROM owned),
        'statusHistory', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'to_status', h.to_status,
            'actor_kind', h.actor_kind,
            'reason', h.reason,
            'occurred_at', h.occurred_at
          ) ORDER BY h.occurred_at, h.id)
            FROM core.entry_status_event h WHERE h.entry_id = (SELECT id FROM owned)), '[]'::jsonb),
        'event', (SELECT to_jsonb(ev) FROM core.event ev WHERE ev.id = $2),
        'athlete', (
          SELECT jsonb_build_object(
            'id', ap.id,
            'given_name', per.given_name,
            'family_name', per.family_name,
            'date_of_birth', per.date_of_birth,
            'nationality', per.nationality,
            'gender', per.gender,
            'email', per.email
          )
            FROM core.athlete_profile ap
            JOIN core.person per ON per.id = ap.person_id
           WHERE ap.id = (SELECT athlete_profile_id FROM owned)
        ),
        'sports', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', s.id, 'event_id', s.event_id, 'name', s.name
          ) ORDER BY s.name)
            FROM core.sport s WHERE s.event_id = $2), '[]'::jsonb),
        'products', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', p.id,
            'event_id', p.event_id,
            'sport_id', p.sport_id,
            'name', p.name,
            'participant_type', p.participant_type,
            'rule_set_id', p.rule_set_id,
            'allowed_grades', p.allowed_grades,
            'partner_required', p.partner_required,
            'requires_evidence', p.requires_evidence
          ) ORDER BY p.name)
            FROM core.sport_entry_product p WHERE p.event_id = $2), '[]'::jsonb),
        -- Partners are the linked doubles partner on this entry, not every other
        -- athlete at the event. An event-wide join would leak the directory.
        'partners', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', ap.id,
            'given_name', per.given_name,
            'family_name', per.family_name,
            'date_of_birth', per.date_of_birth,
            'nationality', per.nationality,
            'gender', per.gender,
            'email', per.email
          ))
            FROM core.athlete_profile ap
            JOIN core.person per ON per.id = ap.person_id
           WHERE ap.id = (SELECT partner_profile_id FROM owned)
             AND (SELECT partner_profile_id FROM owned) IS NOT NULL), '[]'::jsonb),
        'rules', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', rv.id,
            'rule_set_id', rv.rule_set_id,
            'event_id', rs.event_id,
            'sport_code', rs.sport_code,
            'event_name', rs.event_name,
            'sport_name', coalesce(s.name, rs.sport_code),
            'version_no', rv.version_no,
            'reference_date', rv.reference_date,
            'status', rv.status,
            'reason', rv.reason,
            'effective_from', lower(rv.effective),
            'published_at', rv.published_at,
            'age_aggregation', d.aggregation,
            'age_exclude_roles', d.exclude_roles,
            'age_rounding', d.rounding,
            'age_bands', d.bands
          ) ORDER BY coalesce(s.name, rs.sport_code), rs.event_name, rv.version_no)
            FROM core.rule_version rv
            JOIN core.rule_set rs ON rs.id = rv.rule_set_id
            LEFT JOIN core.sport s ON s.event_id = rs.event_id AND s.code = rs.sport_code
            LEFT JOIN core.rule_dimension d ON d.rule_version_id = rv.id AND d.attribute = 'age'
           WHERE rs.event_id = $2 AND rv.status = 'active'), '[]'::jsonb),
        'documents', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', d.id,
            'kind', d.kind,
            'status', d.status,
            's3_key', d.s3_key,
            'uploaded_at', d.uploaded_at
          ) ORDER BY d.id)
            FROM core.evidence_document d WHERE d.entry_id = (SELECT id FROM owned)), '[]'::jsonb),
        'fees', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', f.id,
            'event_id', f.event_id,
            'sport_entry_product_id', f.sport_entry_product_id,
            'category_id', f.category_id,
            'grade', f.grade,
            'currency', f.currency,
            'base_amount_minor', f.base_amount_minor,
            'service_amount_minor', f.service_amount_minor,
            'effective_from', lower(f.effective),
            'effective_to', upper(f.effective)
          ) ORDER BY f.id)
            FROM core.fee f
           WHERE f.sport_entry_product_id = (SELECT sport_entry_product_id FROM owned)
             AND f.effective @> now()), '[]'::jsonb),
        'pools', COALESCE((
          SELECT jsonb_agg(to_jsonb(q))
            FROM core.quota_pool q
            JOIN core.entry_quota_consumption c ON c.quota_pool_id = q.id
           WHERE c.entry_id = (SELECT id FROM owned)
             AND c.state <> 'released'), '[]'::jsonb),
        'waitlist', (
          SELECT jsonb_build_object(
            'id', w.id,
            'quota_pool_id', w.quota_pool_id,
            'entry_id', w.entry_id,
            'status', w.status,
            'position', w.position,
            'offer_expires_at', w.offer_expires_at,
            'joined_at', w.joined_at,
            'updated_at', w.updated_at
          )
            FROM core.waitlist_entry w
           WHERE w.entry_id = (SELECT id FROM owned)
           ORDER BY w.updated_at DESC, w.id
           LIMIT 1),
        'order', (
          SELECT jsonb_build_object(
            'id', o.id,
            'status', o.status,
            'currency', o.currency,
            'gross_minor', o.gross_minor,
            'created_at', o.created_at,
            'updated_at', o.created_at,
            'entry_id', (SELECT id FROM owned),
            'subtotal_minor', COALESCE((
              SELECT sum(ol.gross_minor) FROM core.order_line ol
               WHERE ol.order_id = o.id AND ol.kind = 'entry_fee'), 0),
            'service_minor', COALESCE((
              SELECT sum(ol.gross_minor) FROM core.order_line ol
               WHERE ol.order_id = o.id AND ol.kind = 'add_on'), 0)
          )
            FROM core.registration_order o
           WHERE EXISTS (
             SELECT 1 FROM core.order_line ol
              WHERE ol.order_id = o.id AND ol.entry_id = (SELECT id FROM owned)
           )
           ORDER BY o.created_at DESC
           LIMIT 1),
        'payment', (
          SELECT jsonb_build_object(
            'id', pi.id,
            'order_id', pi.order_id,
            'amount_minor', pi.amount_minor,
            'currency', pi.currency,
            'payment_method', pi.payment_method,
            'status', pi.status,
            'psp_intent_id', pi.psp_intent_id,
            'idempotency_key', pi.idempotency_key,
            'attempt_count', pi.attempt_count,
            'charge_count', pi.charge_count,
            'created_at', pi.created_at,
            'updated_at', pi.updated_at
          )
            FROM core.payment_intent pi
           WHERE pi.order_id = (
             SELECT o.id FROM core.registration_order o
              WHERE EXISTS (
                SELECT 1 FROM core.order_line ol
                 WHERE ol.order_id = o.id AND ol.entry_id = (SELECT id FROM owned)
              )
              ORDER BY o.created_at DESC
              LIMIT 1
           )
           ORDER BY pi.created_at DESC
           LIMIT 1)
      ) AS payload
      WHERE EXISTS (SELECT 1 FROM owned)
      `,
      [input.registrationEntryId, input.eventId, input.athleteId],
    );

    const payload = rows[0]?.payload;
    if (!payload) {
      throw this.notFound();
    }
    return mapJourneySnapshot(payload);
  }

  /**
   * PRV-04: ordinary evidence only, and only the columns the participant-safe shape names.
   * Identity is enforced in the WHERE clause the same way as `getJourney` — the caller
   * must pass the authenticated person id, never a query parameter.
   *
   * This query never touches `restricted.*`, `core.para_class_projection`, or
   * `core.protected_evidence_ref`. Those are readable (or would 500) from the app role
   * and are exactly the fields this export exists to omit.
   */
  async exportParticipantEntry(
    input: ExportParticipantEntryRequest & { athleteId: string },
  ): Promise<ExportParticipantEntryResponse> {
    const { rows } = await this.pool.query<{
      entry_id: string;
      event_id: string;
      sport_id: string;
      sport_name: string;
      sport_entry_product_id: string;
      product_name: string;
      category_name: string | null;
      rule_version_id: string;
      status: string;
      athlete_profile_id: string;
      given_name: string;
      family_name: string;
    }>(
      `
      SELECT e.id AS entry_id,
             e.event_id,
             e.sport_entry_product_id,
             e.current_category_name AS category_name,
             e.rule_version_id,
             e.status,
             e.athlete_profile_id,
             s.id AS sport_id,
             s.name AS sport_name,
             p.name AS product_name,
             person.given_name,
             person.family_name
        FROM core.registration_entry e
        JOIN core.athlete_profile ap ON ap.id = e.athlete_profile_id
        JOIN core.person person ON person.id = ap.person_id
        JOIN core.sport_entry_product p ON p.id = e.sport_entry_product_id
        JOIN core.sport s ON s.id = p.sport_id
       WHERE e.id = $1
         AND ap.person_id = $2
      `,
      [input.registrationEntryId, input.athleteId],
    );
    const row = rows[0];
    if (!row) {
      throw this.notFound();
    }

    const docs = await this.pool.query<{
      id: string | null;
      kind: string | null;
      status: string | null;
    }>(`SELECT id, kind, status FROM core.evidence_document WHERE entry_id = $1 ORDER BY id`, [
      row.entry_id,
    ]);
    const items = docs.rows.flatMap((doc) => {
      if (!doc.id || !doc.kind || !doc.status) return [];
      return [
        {
          id: doc.id,
          type: doc.kind as OrdinaryEvidenceType,
          status: doc.status as EvidenceStatus,
        },
      ];
    });

    return {
      export: {
        generatedAt: new Date().toISOString(),
        privacyProfile: 'participant-safe',
        participant: {
          id: row.athlete_profile_id,
          displayName: `${row.given_name} ${row.family_name}`,
        },
        entry: {
          id: row.entry_id,
          eventId: row.event_id,
          sportId: row.sport_id,
          sportName: row.sport_name,
          sportEntryProductId: row.sport_entry_product_id,
          entryName: row.product_name,
          ...(row.category_name ? { categoryName: row.category_name } : {}),
          ruleVersion: row.rule_version_id,
          status: row.status,
        },
        ordinaryEvidence: { items, total: items.length },
        exclusions: {
          restrictedEvidence: true,
          excludedFieldGroups: [
            'medical',
            'paraClassification',
            'restrictedFiles',
            'restrictedAccessLogs',
          ],
        },
      },
    };
  }

  private notFound(): RepositoryError {
    // Deliberately the same error whether the entry does not exist or belongs to someone
    // else. Distinguishing them tells an attacker which entry ids are real.
    return new RepositoryError({
      code: 'REGISTRATION_ENTRY_NOT_FOUND',
      message: 'No registration entry for this participant.',
    });
  }

  private async statusHistory(entryId: string): Promise<RegistrationEntry['statusHistory']> {
    const { rows } = await this.pool.query<StatusEventRow>(
      `SELECT to_status, actor_kind, reason, occurred_at
         FROM core.entry_status_event WHERE entry_id = $1 ORDER BY occurred_at`,
      [entryId],
    );
    return rows.map((r) => ({
      status: r.to_status as RegistrationEntry['status'],
      actor: r.actor_kind as 'participant' | 'admin' | 'system',
      reason: r.reason ?? undefined,
      occurredAt: r.occurred_at.toISOString(),
    }));
  }

  private toEntry(
    row: EntryRow,
    statusHistory: RegistrationEntry['statusHistory'],
  ): RegistrationEntry {
    return mapEntry(row, statusHistory);
  }
}

/**
 * Projects the pools an entry consumes down to the single `EntryQuota` the participant
 * screens already render.
 *
 * Exported and pure so it can be tested without a database, and so the choice of *which*
 * pool the participant is shown is one reviewable decision rather than a line buried in a
 * query. `bindingPool` picks the tightest — with a sport cap of 100 over a product pool of
 * 60, showing the sport cap would tell the participant the wrong story about why they were
 * refused.
 */
export function projectQuota(pools: readonly QuotaPool[]): EntryQuota | null {
  const binding = bindingPool(pools);
  if (!binding) return null;
  return {
    id: binding.id,
    eventId: binding.eventId,
    sportEntryProductId: binding.scopeKind === 'product' ? (binding.scopeRef ?? '') : '',
    categoryId: binding.scopeKind === 'category' ? (binding.scopeRef ?? undefined) : undefined,
    capacity: binding.capacity,
    confirmed: binding.confirmed,
    reserved: binding.reserved,
    status: headroom(binding) > 0 ? 'available' : 'full',
    updatedAt: binding.updatedAt,
  };
}

/** Row → domain, kept beside the projection so the two stay in step. */
export function toQuotaPool(row: PoolRow): QuotaPool {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    scopeKind: row.scope_kind as QuotaPool['scopeKind'],
    scopeRef: row.scope_ref ?? undefined,
    allocation: row.allocation as QuotaPool['allocation'],
    parentPoolId: row.parent_pool_id ?? undefined,
    unit: row.unit as QuotaPool['unit'],
    capacity: row.capacity,
    confirmed: row.confirmed,
    reserved: row.reserved,
    releaseFrom: iso(row.release_from),
    releaseUntil: iso(row.release_until),
    updatedAt: isoRequired(row.updated_at),
  };
}
