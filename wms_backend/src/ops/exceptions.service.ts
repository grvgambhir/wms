import { Inject, Injectable } from '@nestjs/common';
import type {
  EligibilityException,
  ExceptionImpact,
  ExceptionRejectReason,
  ExceptionsOverview,
} from '@wms/domain';
import { requiredSignatures } from '@wms/domain';
import { z } from 'zod';
import { IdempotencyService, type Queryable } from '../common/idempotency/idempotency.service';
import { pool } from '../db/pool';
import { refuse } from '../people/refuse';
import { headerKey, requireUuid } from './helpers';
import { deriveLoaded, loadEntryRoster, loadFacts, loadVersion } from '../rules/load';

const REJECT_KEYS: Record<ExceptionRejectReason, string> = {
  'Insufficient evidence': 'exception.reject.insufficient_evidence',
  'Does not meet criteria': 'exception.reject.does_not_meet_criteria',
  'Duplicate request': 'exception.reject.duplicate_request',
};

const REJECT_LABELS = Object.fromEntries(
  Object.entries(REJECT_KEYS).map(([label, key]) => [key, label]),
) as Record<string, ExceptionRejectReason>;

const rejectBody = z.object({
  reasonCode: z.string().trim().min(1).max(80),
  note: z.string().trim().max(2000).optional(),
});

type CaseRow = {
  id: string;
  kind: string;
  impact: string;
  summary: string;
  status: string;
  participant_name: string | null;
  product_name: string | null;
  sport_name: string | null;
  reason_keys: string[];
};

type SignatureRow = {
  case_id: string;
  signer_id: string;
  decision: string;
  message_key: string | null;
  given_name: string;
  family_name: string;
};

@Injectable()
export class ExceptionsService {
  constructor(@Inject(IdempotencyService) private readonly idempotency: IdempotencyService) {}

  async getOverview(): Promise<ExceptionsOverview> {
    const cases = await loadCases(pool);
    return { cases };
  }

  /** Participant-owned, server-derived escalation of a currently blocked registration. */
  async raise(args: {
    entryId: string;
    actorId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
  }): Promise<EligibilityException> {
    const entryId = requireUuid(args.entryId, 'registration.entry.invalid');
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/registration-entries/${entryId}/exceptions`,
        body: { entryId },
        mode: 'local',
      },
      async (tx) => {
        const entry = await loadEntryRoster(tx, entryId);
        if (!entry || entry.ownerPersonId !== args.actorId) {
          refuse('REGISTRATION_ENTRY_NOT_FOUND', 'registration.entry.not_found');
        }
        const version = await loadVersion(tx, entry.ruleVersionId);
        if (!version) refuse('RULE_VERSION_NOT_FOUND', 'rules.version.not_found');
        const facts = await loadFacts(tx, entry.eventId, entry.roster.map((member) => member.personId));
        const derived = deriveLoaded(
          version,
          entry.roster.map((member) => ({ personId: member.personId, dob: member.dob, role: member.role })),
          facts,
        );
        const reasonKeys = [...new Set(derived.blockedBy.map((item) => item.messageKey))];
        if (reasonKeys.length === 0) refuse('ENTRY_NOT_BLOCKED', 'exception.entry.not_blocked');
        const person = await tx.query<{ given_name: string; family_name: string; product_name: string }>(
          `SELECT p.given_name, p.family_name, product.name AS product_name
             FROM core.registration_entry e
             JOIN core.athlete_profile ap ON ap.id = e.athlete_profile_id
             JOIN core.person p ON p.id = ap.person_id
             JOIN core.sport_entry_product product ON product.id = e.sport_entry_product_id
            WHERE e.id = $1`,
          [entryId],
        );
        const row = person.rows[0];
        if (!row) refuse('REGISTRATION_ENTRY_NOT_FOUND', 'registration.entry.not_found');
        const inserted = await tx.query<{ id: string }>(
          `INSERT INTO ops.exception_case
             (event_id, entry_id, rule_version_id, kind, impact, summary, reason_keys, status)
           VALUES ($1, $2, $3, 'eligibility_refusal', 'high', $4, $5, 'pending')
           ON CONFLICT (entry_id, rule_version_id)
             WHERE entry_id IS NOT NULL AND status IN ('pending', 'approved')
           DO UPDATE SET id = ops.exception_case.id
           RETURNING id`,
          [
            entry.eventId,
            entryId,
            version.header.id,
            `${row.given_name} ${row.family_name} — ${row.product_name}: ${reasonKeys.join(', ')}`,
            reasonKeys,
          ],
        );
        return { status: 201, body: await loadCase(tx, inserted.rows[0]!.id) };
      },
    );
    return result.body as EligibilityException;
  }

  async approve(args: {
    exceptionId: string;
    actorId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
  }): Promise<EligibilityException> {
    const exceptionId = requireUuid(args.exceptionId, 'exception.invalid');
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/exceptions/${exceptionId}/approve`,
        body: { exceptionId },
        mode: 'local',
      },
      async (tx) => {
        await assertPending(tx, exceptionId);
        await tx.query(
          `INSERT INTO ops.exception_signature (case_id, signer_id, decision)
           VALUES ($1, $2, 'approve')`,
          [exceptionId, args.actorId],
        );
        const impact = await impactOf(tx, exceptionId);
        const { rows } = await tx.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM ops.exception_signature
            WHERE case_id = $1 AND decision = 'approve'`,
          [exceptionId],
        );
        if (Number(rows[0]?.n ?? '0') >= requiredSignatures(impact)) {
          await tx.query(
            `UPDATE ops.exception_case
                SET status = 'approved', resolved_at = now()
              WHERE id = $1`,
            [exceptionId],
          );
        }
        return { status: 200, body: await loadCase(tx, exceptionId) };
      },
    );
    return result.body as EligibilityException;
  }

  async reject(args: {
    exceptionId: string;
    actorId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    body: unknown;
  }): Promise<EligibilityException> {
    const exceptionId = requireUuid(args.exceptionId, 'exception.invalid');
    const parsed = rejectBody.safeParse(args.body);
    if (!parsed.success) refuse('VALIDATION_ERROR', 'exception.reject.invalid');
    const messageKey = rejectKey(parsed.data.reasonCode);
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/exceptions/${exceptionId}/reject`,
        body: { exceptionId, messageKey },
        mode: 'local',
      },
      async (tx) => {
        await assertPending(tx, exceptionId);
        await tx.query(
          `INSERT INTO ops.exception_signature (case_id, signer_id, decision, note, message_key)
           VALUES ($1, $2, 'reject', $3, $4)`,
          [exceptionId, args.actorId, parsed.data.note ?? null, messageKey],
        );
        await tx.query(
          `UPDATE ops.exception_case
              SET status = 'rejected', resolved_at = now()
            WHERE id = $1`,
          [exceptionId],
        );
        return { status: 200, body: await loadCase(tx, exceptionId) };
      },
    );
    return result.body as EligibilityException;
  }
}

function rejectKey(reasonCode: string): string {
  if (reasonCode in REJECT_KEYS) return REJECT_KEYS[reasonCode as ExceptionRejectReason];
  if (reasonCode in REJECT_LABELS) return reasonCode;
  refuse('REJECTION_REASON_REQUIRED', 'exception.reject.unknown');
}

function toImpact(value: string): ExceptionImpact {
  return value === 'high' ? 'high' : 'standard';
}

async function assertPending(db: Queryable, exceptionId: string): Promise<void> {
  const { rows } = await db.query<{ status: string }>(
    `SELECT status FROM ops.exception_case WHERE id = $1`,
    [exceptionId],
  );
  if (!rows[0]) refuse('EXCEPTION_NOT_FOUND', 'exception.not_found');
  if (rows[0].status !== 'pending') refuse('NOT_PENDING', 'exception.not_pending');
}

async function impactOf(db: Queryable, exceptionId: string): Promise<ExceptionImpact> {
  const { rows } = await db.query<{ impact: string }>(
    `SELECT impact FROM ops.exception_case WHERE id = $1`,
    [exceptionId],
  );
  return toImpact(rows[0]?.impact ?? 'medium');
}

async function loadCases(db: Queryable): Promise<EligibilityException[]> {
  const { rows } = await db.query<CaseRow>(`${caseSelect()} ORDER BY c.created_at DESC`);
  const { rows: signatures } = await db.query<SignatureRow>(
    `SELECT s.case_id, s.signer_id, s.decision, s.message_key, p.given_name, p.family_name
       FROM ops.exception_signature s
       JOIN core.person p ON p.id = s.signer_id
      ORDER BY s.signed_at`,
  );
  return rows.map((row) => toException(row, signatures.filter((item) => item.case_id === row.id)));
}

async function loadCase(db: Queryable, exceptionId: string): Promise<EligibilityException> {
  const { rows } = await db.query<CaseRow>(`${caseSelect()} WHERE c.id = $1`, [exceptionId]);
  const row = rows[0];
  if (!row) refuse('EXCEPTION_NOT_FOUND', 'exception.not_found');
  const { rows: signatures } = await db.query<SignatureRow>(
    `SELECT s.case_id, s.signer_id, s.decision, s.message_key, p.given_name, p.family_name
       FROM ops.exception_signature s
       JOIN core.person p ON p.id = s.signer_id
      WHERE s.case_id = $1
      ORDER BY s.signed_at`,
    [exceptionId],
  );
  return toException(row, signatures);
}

function caseSelect(): string {
  return `
    SELECT c.id, c.kind, c.impact, c.summary, c.status, c.reason_keys,
           NULLIF(TRIM(COALESCE(p.given_name,'') || ' ' || COALESCE(p.family_name,'')), '') AS participant_name,
           sep.name AS product_name,
           s.name AS sport_name
      FROM ops.exception_case c
      LEFT JOIN core.registration_entry e ON e.id = c.entry_id
      LEFT JOIN core.athlete_profile ap ON ap.id = e.athlete_profile_id
      LEFT JOIN core.person p ON p.id = ap.person_id
      LEFT JOIN core.sport_entry_product sep ON sep.id = e.sport_entry_product_id
      LEFT JOIN core.sport s ON s.id = sep.sport_id`;
}

function toException(row: CaseRow, signatures: SignatureRow[]): EligibilityException {
  const parsed = parseSummary(row.summary);
  const approvers = signatures
    .filter((item) => item.decision === 'approve')
    .map((item) => `${item.given_name} ${item.family_name}`.trim());
  const rejection = signatures.find((item) => item.decision === 'reject');
  const decision =
    row.status === 'approved' || row.status === 'rejected' ? row.status : 'pending';
  return {
    id: row.id,
    participant: row.participant_name ?? parsed.participant,
    sport: row.sport_name ?? row.kind,
    event: row.product_name ?? parsed.event,
    impact: toImpact(row.impact),
    reason: parsed.reason,
    ...(row.reason_keys.length
      ? {
          checks: row.reason_keys.map((messageKey) => ({
            label: messageKey,
            ok: false,
            detail: `Failed rule: ${messageKey}`,
          })),
        }
      : {}),
    ...(isRestricted(row.kind, row.summary) ? { restricted: true } : {}),
    approvers,
    decision,
    ...(rejection?.message_key && REJECT_LABELS[rejection.message_key]
      ? { reasonCode: REJECT_LABELS[rejection.message_key] }
      : {}),
  };
}

function parseSummary(summary: string): { participant: string; event: string; reason: string } {
  const match = /^(.*?)\s+—\s+(.*?):\s+(.*)$/.exec(summary);
  if (match) return { participant: match[1]!, event: match[2]!, reason: match[3]! };
  return { participant: summary, event: '', reason: summary };
}

function isRestricted(kind: string, summary: string): boolean {
  return /para|classif|medical/i.test(`${kind} ${summary}`);
}
