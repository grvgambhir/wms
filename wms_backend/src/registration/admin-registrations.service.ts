import { Inject, Injectable } from '@nestjs/common';
import type { MultiDimensionDerivation } from '@wms/domain';
import {
  clampLimit,
  decodeCursor,
  keysetClause,
  toPage,
  type Page,
} from '../common/pagination/keyset';
import type { Queryable } from '../common/idempotency/idempotency.service';
import { pool } from '../db/pool';
import { refuse } from '../people/refuse';
import { RulesService } from '../rules/rules.service';
import { UUID_RE } from '../rules/helpers';
import { csvCell } from '../finance/reporting.service';

const EXPORT_MAX_ROWS = 20_000;

export type RegistrationPaymentState = 'unpaid' | 'paid' | 'refunded';

export interface RegistrationListFilter {
  eventId?: string;
  sportId?: string;
  productId?: string;
  category?: string;
  status?: string | string[];
  grade?: string;
  paymentState?: string;
  evidenceState?: string;
  teamId?: string;
  search?: string;
  cursor?: string;
  limit?: unknown;
}

export interface RegistrationListItem {
  id: string;
  athlete: {
    givenName: string;
    familyName: string;
    email: string | null;
    nationality: string | null;
  };
  sport: { id: string; name: string };
  product: { id: string; name: string };
  grade: string;
  originalCategoryName: string | null;
  currentCategoryName: string | null;
  status: string;
  evidenceStatus: string;
  payment: {
    state: RegistrationPaymentState;
    dueMinor: number;
    settledMinor: number;
    currency: string | null;
  };
  team: { id: string; name: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegistrationCounts {
  [status: string]: number;
}

export interface RegistrationFilterOptions {
  sports: Array<{ id: string; name: string }>;
  products: Array<{ id: string; sportId: string; name: string }>;
  categories: string[];
}

export interface RegistrationDetail extends RegistrationListItem {
  athlete: RegistrationListItem['athlete'] & { dateOfBirth: string };
  ruleVersion: { id: string; version: number | null; status: string | null };
  category: {
    original: string | null;
    current: string | null;
    reason: string | null;
    /** Only the safe output of the existing derivation path, not its raw entrant facts. */
    derived: Pick<MultiDimensionDerivation, 'ruleVersionId' | 'referenceDate' | 'categoryName'>;
    auditTrail: Array<{
      fromCategory: string | null;
      toCategory: string;
      trigger: string;
      approvedBy: string | null;
      reason: string | null;
      occurredAt: string;
    }>;
  };
  statusHistory: Array<{
    fromStatus: string | null;
    toStatus: string;
    actorKind: string;
    /** The person who made the change, for staff reading the trail. Null for system events. */
    actorName: string | null;
    reason: string | null;
    occurredAt: string;
  }>;
  allowedActions: Array<{ action: string; toStatus: string }>;
  money: {
    orders: Array<{
      id: string;
      status: string;
      currency: string;
      netMinor: number;
      taxMinor: number;
      grossMinor: number;
      createdAt: string;
      /** For building a refund allocation and for the promotion/invoice actions — never recomputed, only read. */
      lines: Array<{
        id: string;
        kind: string;
        description: string;
        taxRateBp: number;
        grossMinor: number;
        paidMinor: number;
        refundedMinor: number;
      }>;
    }>;
    payments: Array<{
      id: string;
      orderId: string;
      status: string;
      amountMinor: number;
      currency: string;
      createdAt: string;
    }>;
    refunds: Array<{
      id: string;
      orderId: string;
      status: string;
      amountMinor: number;
      currency: string;
      createdAt: string;
    }>;
  };
  evidence: {
    ordinary: Array<{
      id: string;
      kind: string;
      status: string;
      scanStatus: string;
      uploadedAt: string | null;
    }>;
    /**
     * Restricted items held for this athlete at this event. `core.protected_evidence_ref` is keyed
     * by (person, event) — there is no per-entry restricted reference, and inventing one here would
     * mean reading inside the restricted boundary. The screen must label it as the athlete's count.
     */
    restrictedCount: number;
    hasRestrictedEvidence: boolean;
    /** A deliberately coarse summary; this never reads `restricted.*`. */
    restrictedStatus: 'none' | 'present';
  };
  team:
    | (NonNullable<RegistrationListItem['team']> & {
        lockedAt: string | null;
        memberCount: number;
      })
    | null;
}

export interface RegistrationExportResult {
  csv: string;
  rowCount: number;
  truncated: boolean;
}

interface RegistrationListRow {
  id: string;
  given_name: string;
  family_name: string;
  email: string | null;
  nationality: string | null;
  sport_id: string;
  sport_name: string;
  product_id: string;
  product_name: string;
  grade: string;
  original_category_name: string | null;
  current_category_name: string | null;
  status: string;
  evidence_status: string;
  payment_state: RegistrationPaymentState;
  due_minor: string | number;
  settled_minor: string | number;
  currency: string | null;
  team_id: string | null;
  team_name: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface DetailRow extends RegistrationListRow {
  date_of_birth: string;
  rule_version_id: string;
  rule_version_no: number | null;
  rule_version_status: string | null;
  category_change_reason: string | null;
  policy_version_id: string | null;
  locked_at: Date | string | null;
}

type FilterPlan = {
  sql: string;
  params: unknown[];
  nextParam: number;
};

function iso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function minor(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function requireUuid(value: string | undefined, field: string): string {
  if (!value || !UUID_RE.test(value)) refuse('VALIDATION_ERROR', `registrations.${field}.invalid`);
  return value;
}

function shortText(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 100) refuse('VALIDATION_ERROR', `registrations.${field}.invalid`);
  return trimmed;
}

function likePattern(value: string): string {
  return `%${value.replace(/([\\%_])/g, '\\$1')}%`;
}

function idPrefixPattern(value: string): string {
  return `${value.replace(/([\\%_])/g, '\\$1')}%`;
}

/**
 * The same line counters as `core.entry_balance`, plus refunded counters from the order
 * ledger. A refunded amount wins over paid so a partial refund is visible as such rather
 * than being disguised as settled. `unpaid` includes no order and partially settled debt.
 */
const PAYMENT_STATE_SQL = `
  CASE
    WHEN money.refunded_minor > 0 THEN 'refunded'
    WHEN money.due_minor > 0 AND money.settled_minor >= money.due_minor THEN 'paid'
    ELSE 'unpaid'
  END`;

const FROM_REGISTRATIONS = `
  FROM core.registration_entry e
  JOIN core.athlete_profile ap ON ap.id = e.athlete_profile_id
  JOIN core.person person ON person.id = ap.person_id
  JOIN core.sport_entry_product product ON product.id = e.sport_entry_product_id
  JOIN core.sport sport ON sport.id = product.sport_id
  LEFT JOIN core.team_roster team ON team.id = e.team_roster_id
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(line.gross_minor) FILTER (
        WHERE line.kind IN ('entry_fee', 'add_on', 'deposit', 'balance', 'discount')
      ), 0) AS due_minor,
      COALESCE(SUM(line.paid_minor - line.refunded_minor) FILTER (
        WHERE line.kind IN ('entry_fee', 'add_on', 'deposit', 'balance', 'discount')
      ), 0) AS settled_minor,
      COALESCE(SUM(line.refunded_minor) FILTER (
        WHERE line.kind IN ('entry_fee', 'add_on', 'deposit', 'balance', 'discount')
      ), 0) AS refunded_minor,
      MAX(registration_order.currency)::text AS currency
    FROM core.order_line line
    JOIN core.registration_order registration_order ON registration_order.id = line.order_id
    WHERE line.entry_id = e.id
  ) money ON TRUE`;

const LIST_SELECT = `
  SELECT e.id,
         person.given_name,
         person.family_name,
         person.email::text AS email,
         person.nationality::text AS nationality,
         sport.id AS sport_id,
         sport.name AS sport_name,
         product.id AS product_id,
         product.name AS product_name,
         e.grade,
         e.original_category_name,
         e.current_category_name,
         e.status,
         e.evidence_status,
         ${PAYMENT_STATE_SQL} AS payment_state,
         money.due_minor,
         money.settled_minor,
         money.currency,
         team.id AS team_id,
         team.name AS team_name,
         e.created_at,
         e.updated_at`;

function toListItem(row: RegistrationListRow): RegistrationListItem {
  return {
    id: row.id,
    athlete: {
      givenName: row.given_name,
      familyName: row.family_name,
      email: row.email,
      nationality: row.nationality,
    },
    sport: { id: row.sport_id, name: row.sport_name },
    product: { id: row.product_id, name: row.product_name },
    grade: row.grade,
    originalCategoryName: row.original_category_name,
    currentCategoryName: row.current_category_name,
    status: row.status,
    evidenceStatus: row.evidence_status,
    payment: {
      state: row.payment_state,
      dueMinor: minor(row.due_minor),
      settledMinor: minor(row.settled_minor),
      currency: row.currency,
    },
    team: row.team_id ? { id: row.team_id, name: row.team_name } : null,
    createdAt: iso(row.created_at) ?? '',
    updatedAt: iso(row.updated_at) ?? '',
  };
}

function normaliseStatuses(raw: string | string[] | undefined): string[] {
  const values = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.some((value) => value.length > 60) || values.length > 20) {
    refuse('VALIDATION_ERROR', 'registrations.status.invalid');
  }
  return [...new Set(values)];
}

@Injectable()
export class AdminRegistrationsService {
  constructor(@Inject(RulesService) private readonly rules: RulesService) {}

  async list(args: RegistrationListFilter): Promise<Page<RegistrationListItem>> {
    const filters = this.buildFilters(args, true);
    const cursor = decodeCursor(args.cursor);
    const requested = clampLimit(args.limit);
    const keyset = keysetClause({
      table: 'e',
      cursor,
      limit: requested,
      nextParamIndex: filters.nextParam,
    });
    const { rows } = await pool.query<RegistrationListRow>(
      `${LIST_SELECT}
       ${FROM_REGISTRATIONS}
       WHERE 1=1 ${filters.sql} ${keyset.where}
       ${keyset.orderBy}
       LIMIT ${keyset.limit}`,
      [...filters.params, ...keyset.params],
    );
    const page = toPage(rows, requested);
    return {
      items: page.items.map(toListItem),
      ...(page.cursor ? { cursor: page.cursor } : {}),
    };
  }

  async counts(args: RegistrationListFilter): Promise<RegistrationCounts> {
    const filters = this.buildFilters(args, false);
    const { rows } = await pool.query<{ status: string; count: string }>(
      `SELECT e.status, count(*)::text AS count
       ${FROM_REGISTRATIONS}
       WHERE 1=1 ${filters.sql}
       GROUP BY e.status`,
      filters.params,
    );
    return Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
  }

  async filterOptions(eventId?: string): Promise<RegistrationFilterOptions> {
    const event = eventId ? requireUuid(eventId, 'event_id') : null;
    const eventSql = event ? '$1::uuid' : 'core.current_event_id()';
    const params = event ? [event] : [];
    const [sports, products, categories] = await Promise.all([
      pool.query<{ id: string; name: string }>(
        `SELECT id, name FROM core.sport WHERE event_id = ${eventSql} ORDER BY name, id`,
        params,
      ),
      pool.query<{ id: string; sport_id: string; name: string }>(
        `SELECT id, sport_id, name
           FROM core.sport_entry_product
          WHERE event_id = ${eventSql}
          ORDER BY name, id`,
        params,
      ),
      pool.query<{ name: string }>(
        `SELECT DISTINCT COALESCE(NULLIF(current_category_name, ''), original_category_name) AS name
           FROM core.registration_entry
          WHERE event_id = ${eventSql}
            AND COALESCE(NULLIF(current_category_name, ''), original_category_name) IS NOT NULL
          ORDER BY name`,
        params,
      ),
    ]);
    return {
      sports: sports.rows,
      products: products.rows.map((row) => ({ id: row.id, sportId: row.sport_id, name: row.name })),
      categories: categories.rows.map((row) => row.name),
    };
  }

  async detail(
    entryId: string,
    identity: { personId: string; roles: string[] },
  ): Promise<RegistrationDetail> {
    const id = requireUuid(entryId, 'entry_id');
    const base = await pool.query<DetailRow>(
      `${LIST_SELECT},
         person.date_of_birth::text AS date_of_birth,
         e.rule_version_id,
         rule_version.version_no AS rule_version_no,
         rule_version.status AS rule_version_status,
         e.category_change_reason,
         e.policy_version_id,
         team.locked_at
       ${FROM_REGISTRATIONS}
       LEFT JOIN core.rule_version rule_version ON rule_version.id = e.rule_version_id
       WHERE e.id = $1`,
      [id],
    );
    const row = base.rows[0];
    if (!row) refuse('REGISTRATION_ENTRY_NOT_FOUND', 'registrations.entry.not_found');

    const [categoryAudit, statusHistory, actions, money, evidence, restricted, roster, derivation] =
      await Promise.all([
        this.categoryAudit(id),
        this.statusHistory(id),
        this.allowedActions(id),
        this.money(id),
        this.ordinaryEvidence(id),
        this.restrictedEvidenceCount(row, id),
        this.rosterSummary(row.team_id),
        this.rules.deriveForEntry(identity, id),
      ]);

    const list = toListItem(row);
    return {
      ...list,
      athlete: { ...list.athlete, dateOfBirth: row.date_of_birth },
      ruleVersion: {
        id: row.rule_version_id,
        version: row.rule_version_no,
        status: row.rule_version_status,
      },
      category: {
        original: row.original_category_name,
        current: row.current_category_name,
        reason: row.category_change_reason,
        // Do not expose the dimensions/raw facts in this general-admin endpoint. The existing
        // derivation service remains the single source of the category calculation.
        derived: {
          ruleVersionId: derivation.ruleVersionId,
          referenceDate: derivation.referenceDate,
          categoryName: derivation.categoryName,
        },
        auditTrail: categoryAudit,
      },
      statusHistory,
      allowedActions: actions,
      money,
      evidence: {
        ordinary: evidence,
        restrictedCount: restricted,
        hasRestrictedEvidence: restricted > 0,
        restrictedStatus: restricted > 0 ? 'present' : 'none',
      },
      team: row.team_id
        ? {
            id: row.team_id,
            name: row.team_name,
            lockedAt: iso(row.locked_at),
            memberCount: roster,
          }
        : null,
    };
  }

  /**
   * Bounded at 20,000 rows so a GET response is not an unbounded in-memory report. The list
   * itself remains cursor-paged; an export that needs more is deliberately a reporting job,
   * not a request that can exhaust the API process.
   */
  async exportCsv(args: {
    filter: RegistrationListFilter;
    actorId: string;
    /** The exporter's own role, so the audit row names who actually exported. */
    actorRole: string;
    ip?: string;
  }): Promise<RegistrationExportResult> {
    const filters = this.buildFilters(args.filter, true);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<RegistrationListRow>(
        `${LIST_SELECT}
         ${FROM_REGISTRATIONS}
         WHERE 1=1 ${filters.sql}
         ORDER BY e.created_at DESC, e.id DESC
         LIMIT $${filters.nextParam}`,
        [...filters.params, EXPORT_MAX_ROWS + 1],
      );
      const truncated = rows.length > EXPORT_MAX_ROWS;
      const items = rows.slice(0, EXPORT_MAX_ROWS).map(toListItem);
      await this.writeExportAudit(client, {
        actorId: args.actorId,
        actorRole: args.actorRole,
        eventId: args.filter.eventId ?? null,
        filter: this.auditFilter(args.filter),
        rowCount: items.length,
        truncated,
        ip: args.ip,
      });
      await client.query('COMMIT');
      return { csv: toRegistrationsCsv(items), rowCount: items.length, truncated };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private buildFilters(args: RegistrationListFilter, includeStatus: boolean): FilterPlan {
    const params: unknown[] = [];
    let next = 1;
    let sql = '';
    const add = (value: unknown): string => {
      params.push(value);
      const placeholder = `$${next}`;
      next += 1;
      return placeholder;
    };

    if (args.eventId) sql += ` AND e.event_id = ${add(requireUuid(args.eventId, 'event_id'))}`;
    else sql += ' AND e.event_id = core.current_event_id()';

    if (args.sportId) sql += ` AND sport.id = ${add(requireUuid(args.sportId, 'sport_id'))}`;
    if (args.productId)
      sql += ` AND product.id = ${add(requireUuid(args.productId, 'product_id'))}`;
    if (args.teamId) sql += ` AND e.team_roster_id = ${add(requireUuid(args.teamId, 'team_id'))}`;

    const category = shortText(args.category, 'category');
    if (category) {
      sql += ` AND COALESCE(NULLIF(e.current_category_name, ''), e.original_category_name) = ${add(category)}`;
    }
    const grade = shortText(args.grade, 'grade');
    if (grade) sql += ` AND e.grade = ${add(grade)}`;
    const evidenceState = shortText(args.evidenceState, 'evidence_state');
    if (evidenceState) sql += ` AND e.evidence_status = ${add(evidenceState)}`;

    if (includeStatus) {
      const statuses = normaliseStatuses(args.status);
      if (statuses.length) sql += ` AND e.status = ANY(${add(statuses)}::text[])`;
    }

    const paymentState = shortText(args.paymentState, 'payment_state');
    if (paymentState) {
      if (!['unpaid', 'paid', 'refunded'].includes(paymentState)) {
        refuse('VALIDATION_ERROR', 'registrations.payment_state.invalid');
      }
      sql += ` AND ${PAYMENT_STATE_SQL} = ${add(paymentState)}`;
    }

    const search = shortText(args.search, 'search');
    if (search) {
      const contains = add(likePattern(search));
      const entryPrefix = add(idPrefixPattern(search));
      sql += ` AND (
           person.given_name ILIKE ${contains} ESCAPE '\\'
        OR person.family_name ILIKE ${contains} ESCAPE '\\'
        OR (person.given_name || ' ' || person.family_name) ILIKE ${contains} ESCAPE '\\'
        OR COALESCE(person.email::text, '') ILIKE ${contains} ESCAPE '\\'
        OR e.id::text ILIKE ${entryPrefix} ESCAPE '\\'
      )`;
    }
    return { sql, params, nextParam: next };
  }

  private async categoryAudit(
    entryId: string,
  ): Promise<RegistrationDetail['category']['auditTrail']> {
    const { rows } = await pool.query<{
      from_category: string | null;
      to_category: string;
      trigger: string;
      approved_by: string | null;
      reason: string | null;
      occurred_at: Date | string;
    }>(
      `SELECT from_category, to_category, trigger, approved_by, reason, occurred_at
         FROM core.category_audit
        WHERE entry_id = $1
        ORDER BY occurred_at ASC, id ASC`,
      [entryId],
    );
    return rows.map((row) => ({
      fromCategory: row.from_category,
      toCategory: row.to_category,
      trigger: row.trigger,
      approvedBy: row.approved_by,
      reason: row.reason,
      occurredAt: iso(row.occurred_at) ?? '',
    }));
  }

  private async statusHistory(entryId: string): Promise<RegistrationDetail['statusHistory']> {
    const { rows } = await pool.query<{
      from_status: string | null;
      to_status: string;
      actor_kind: string;
      actor_name: string | null;
      reason: string | null;
      occurred_at: Date | string;
    }>(
      `SELECT event.from_status, event.to_status, event.actor_kind, event.reason, event.occurred_at,
              NULLIF(trim(concat_ws(' ', actor.given_name, actor.family_name)), '') AS actor_name
         FROM core.entry_status_event event
         LEFT JOIN core.person actor ON actor.id = event.actor_id
        WHERE event.entry_id = $1
        ORDER BY event.occurred_at ASC, event.id ASC`,
      [entryId],
    );
    return rows.map((row) => ({
      fromStatus: row.from_status,
      toStatus: row.to_status,
      actorKind: row.actor_kind,
      actorName: row.actor_name,
      reason: row.reason,
      occurredAt: iso(row.occurred_at) ?? '',
    }));
  }

  private async allowedActions(entryId: string): Promise<RegistrationDetail['allowedActions']> {
    const { rows } = await pool.query<{ action: string; to_status: string }>(
      `SELECT transition.action, transition.to_status
         FROM core.registration_entry entry
         JOIN LATERAL (
           SELECT policy.action, policy.to_status
             FROM core.registration_policy_transition policy
            WHERE policy.policy_version_id = entry.policy_version_id
              AND policy.from_status = entry.status
              AND policy.actor_kind = 'admin'
              AND EXISTS (
                SELECT 1 FROM core.registration_policy_transition configured
                 WHERE configured.policy_version_id = entry.policy_version_id
              )
           UNION ALL
           SELECT fallback.action, fallback.to_status
             FROM core.entry_status_transition fallback
            WHERE fallback.from_status = entry.status
              AND fallback.actor_kind = 'admin'
              AND NOT EXISTS (
                SELECT 1 FROM core.registration_policy_transition configured
                 WHERE configured.policy_version_id = entry.policy_version_id
              )
         ) transition ON TRUE
        WHERE entry.id = $1
        ORDER BY transition.action`,
      [entryId],
    );
    return rows.map((row) => ({ action: row.action, toStatus: row.to_status }));
  }

  private async money(entryId: string): Promise<RegistrationDetail['money']> {
    const [orders, payments, refunds, lines] = await Promise.all([
      pool.query<{
        id: string;
        status: string;
        currency: string;
        net_minor: string | number;
        tax_minor: string | number;
        gross_minor: string | number;
        created_at: Date | string;
      }>(
        `SELECT DISTINCT registration_order.id, registration_order.status, registration_order.currency,
                         registration_order.net_minor::text, registration_order.tax_minor::text,
                         registration_order.gross_minor::text, registration_order.created_at
           FROM core.registration_order registration_order
           JOIN core.order_line line ON line.order_id = registration_order.id
          WHERE line.entry_id = $1
          ORDER BY registration_order.created_at ASC, registration_order.id ASC`,
        [entryId],
      ),
      pool.query<{
        id: string;
        order_id: string;
        status: string;
        amount_minor: string | number;
        currency: string;
        created_at: Date | string;
      }>(
        `SELECT DISTINCT payment.id, payment.order_id, payment.status, payment.amount_minor::text,
                         payment.currency, payment.created_at
           FROM core.payment_intent payment
           JOIN core.order_line line ON line.order_id = payment.order_id
          WHERE line.entry_id = $1
          ORDER BY payment.created_at ASC, payment.id ASC`,
        [entryId],
      ),
      pool.query<{
        id: string;
        order_id: string;
        status: string;
        amount_minor: string | number;
        currency: string;
        created_at: Date | string;
      }>(
        `SELECT DISTINCT refund.id, refund.order_id, refund.status, refund.amount_minor::text,
                         registration_order.currency, refund.created_at
           FROM core.refund refund
           JOIN core.order_line line ON line.order_id = refund.order_id
           JOIN core.registration_order registration_order ON registration_order.id = refund.order_id
          WHERE line.entry_id = $1
          ORDER BY refund.created_at ASC, refund.id ASC`,
        [entryId],
      ),
      // Every line on every order this entry appears on — not just this entry's own lines — since
      // a refund allocation has to cover the whole order the athlete paid (fees, tax, promotions).
      pool.query<{
        id: string;
        order_id: string;
        kind: string;
        description: string;
        tax_rate_bp: number;
        gross_minor: string | number;
        paid_minor: string | number;
        refunded_minor: string | number;
      }>(
        `SELECT line.id, line.order_id, line.kind, line.description, line.tax_rate_bp,
                line.gross_minor::text, line.paid_minor::text, line.refunded_minor::text
           FROM core.order_line line
          WHERE line.order_id IN (
            SELECT DISTINCT order_id FROM core.order_line WHERE entry_id = $1
          )
          ORDER BY line.order_id ASC, line.id ASC`,
        [entryId],
      ),
    ]);
    return {
      orders: orders.rows.map((row) => ({
        id: row.id,
        status: row.status,
        currency: row.currency,
        netMinor: minor(row.net_minor),
        taxMinor: minor(row.tax_minor),
        grossMinor: minor(row.gross_minor),
        createdAt: iso(row.created_at) ?? '',
        lines: lines.rows
          .filter((line) => line.order_id === row.id)
          .map((line) => ({
            id: line.id,
            kind: line.kind,
            description: line.description,
            taxRateBp: line.tax_rate_bp,
            grossMinor: minor(line.gross_minor),
            paidMinor: minor(line.paid_minor),
            refundedMinor: minor(line.refunded_minor),
          })),
      })),
      payments: payments.rows.map((row) => ({
        id: row.id,
        orderId: row.order_id,
        status: row.status,
        amountMinor: minor(row.amount_minor),
        currency: row.currency,
        createdAt: iso(row.created_at) ?? '',
      })),
      refunds: refunds.rows.map((row) => ({
        id: row.id,
        orderId: row.order_id,
        status: row.status,
        amountMinor: minor(row.amount_minor),
        currency: row.currency,
        createdAt: iso(row.created_at) ?? '',
      })),
    };
  }

  private async ordinaryEvidence(
    entryId: string,
  ): Promise<RegistrationDetail['evidence']['ordinary']> {
    const { rows } = await pool.query<{
      id: string;
      kind: string;
      status: string;
      scan_status: string;
      uploaded_at: Date | string | null;
    }>(
      `SELECT id, kind, status, scan_status, uploaded_at
         FROM core.evidence_document
        WHERE entry_id = $1
        ORDER BY id`,
      [entryId],
    );
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      scanStatus: row.scan_status,
      uploadedAt: iso(row.uploaded_at),
    }));
  }

  private async restrictedEvidenceCount(row: DetailRow, entryId: string): Promise<number> {
    // `core.protected_evidence_ref` is the safe existence-only boundary. Do not join to the
    // restricted record (and do not expose ref kinds or ids): app_rw is deliberately denied it.
    void entryId;
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM core.protected_evidence_ref
        WHERE person_id = (
          SELECT athlete.person_id
            FROM core.athlete_profile athlete
           WHERE athlete.id = (
             SELECT athlete_profile_id FROM core.registration_entry WHERE id = $1
           )
        )
          AND event_id = (
            SELECT event_id FROM core.registration_entry WHERE id = $1
          )`,
      [row.id],
    );
    return Number(rows[0]?.count ?? 0);
  }

  private async rosterSummary(teamId: string | null): Promise<number> {
    if (!teamId) return 0;
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM core.roster_member WHERE roster_id = $1`,
      [teamId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  private auditFilter(filter: RegistrationListFilter): Record<string, unknown> {
    return {
      eventId: filter.eventId ?? 'current_event_id()',
      sportId: filter.sportId ?? null,
      productId: filter.productId ?? null,
      category: filter.category ?? null,
      status: normaliseStatuses(filter.status),
      grade: filter.grade ?? null,
      paymentState: filter.paymentState ?? null,
      evidenceState: filter.evidenceState ?? null,
      teamId: filter.teamId ?? null,
      search: filter.search ?? null,
    };
  }

  private async writeExportAudit(
    tx: Queryable,
    args: {
      actorId: string;
      actorRole: string;
      eventId: string | null;
      filter: Record<string, unknown>;
      rowCount: number;
      truncated: boolean;
      ip?: string;
    },
  ): Promise<void> {
    await tx.query(
      `INSERT INTO audit.activity_log
         (event_id, actor_id, actor_role, action, subject_type, subject_id, after, ip)
       VALUES (COALESCE($1::uuid, core.current_event_id()), $2, $5,
               'registration.export', 'registration_entry', NULL, $3::jsonb, $4)`,
      [
        args.eventId,
        args.actorId,
        JSON.stringify({
          filter: args.filter,
          rowCount: args.rowCount,
          cap: EXPORT_MAX_ROWS,
          truncated: args.truncated,
        }),
        args.ip && args.ip !== 'unknown' ? args.ip : null,
        args.actorRole,
      ],
    );
  }
}

const CSV_COLUMNS: Array<[string, (row: RegistrationListItem) => unknown]> = [
  ['entry_id', (row) => row.id],
  ['athlete_given_name', (row) => row.athlete.givenName],
  ['athlete_family_name', (row) => row.athlete.familyName],
  ['athlete_email', (row) => row.athlete.email],
  ['nationality', (row) => row.athlete.nationality],
  ['sport', (row) => row.sport.name],
  ['product', (row) => row.product.name],
  ['grade', (row) => row.grade],
  ['original_category', (row) => row.originalCategoryName],
  ['current_category', (row) => row.currentCategoryName],
  ['status', (row) => row.status],
  ['evidence_status', (row) => row.evidenceStatus],
  ['payment_state', (row) => row.payment.state],
  ['due_minor', (row) => row.payment.dueMinor],
  ['settled_minor', (row) => row.payment.settledMinor],
  ['currency', (row) => row.payment.currency],
  ['team', (row) => row.team?.name],
  ['created_at', (row) => row.createdAt],
  ['updated_at', (row) => row.updatedAt],
];

export function toRegistrationsCsv(rows: readonly RegistrationListItem[]): string {
  const header = CSV_COLUMNS.map(([name]) => csvCell(name)).join(',');
  const body = rows.map((row) => CSV_COLUMNS.map(([, get]) => csvCell(get(row))).join(','));
  return [header, ...body].join('\r\n');
}
