import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  AccreditationOverview,
  AccreditationRecord,
  AccreditationSummary,
  CredentialActionResponse,
} from '@wms/domain';
import { z } from 'zod';
import type { Queryable } from '../common/idempotency/idempotency.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { pool } from '../db/pool';
import { refuse } from '../people/refuse';
import {
  headerKey,
  requireUuid,
  SELECT_RECORD,
  toRecord,
  type AccreditationRow,
} from './helpers';

const revokeBody = z.object({
  reason: z.string().trim().min(1).max(500),
});

@Injectable()
export class AccreditationService {
  constructor(@Inject(IdempotencyService) private readonly idempotency: IdempotencyService) {}

  async getOwnPass(personId: string): Promise<AccreditationRecord | null> {
    const { rows } = await pool.query<AccreditationRow>(
      `${SELECT_RECORD} WHERE a.person_id = $1 ORDER BY a.updated_at DESC LIMIT 1`,
      [personId],
    );
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async getDeskOverview(): Promise<AccreditationOverview> {
    const { rows } = await pool.query<AccreditationRow>(
      `${SELECT_RECORD} ORDER BY a.updated_at DESC`,
    );
    const records = rows.map(toRecord);
    return {
      summary: summarize(records),
      records: { items: records, total: records.length },
    };
  }

  async issue(args: {
    recordId: string;
    actorId: string;
    actorRole: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
  }): Promise<CredentialActionResponse> {
    const recordId = requireUuid(args.recordId, 'accreditation.invalid');
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/accreditations/${recordId}/issue`,
        body: { recordId },
        mode: 'local',
      },
      async (tx) => {
        const current = await loadRecord(tx, recordId);
        if (!current) refuse('ACCREDITATION_NOT_FOUND', 'accreditation.not_found');
        if (current.status === 'issued') {
          return { status: 200, body: await actionResponse(tx, toRecord(current)) };
        }
        if (current.status === 'revoked') {
          refuse('NOT_ISSUED', 'accreditation.issue.revoked');
        }
        await assertGatesMet(tx, recordId);
        const issued = await stampIssued(tx, recordId);
        await writeAudit(tx, {
          eventId: await eventIdFor(tx, recordId),
          actorId: args.actorId,
          actorRole: args.actorRole,
          action: 'accreditation.issue',
          subjectId: recordId,
          after: { badgeNumber: issued.badge_number, qrValue: issued.qr_value },
        });
        return { status: 200, body: await actionResponse(tx, toRecord(issued)) };
      },
    );
    return result.body as CredentialActionResponse;
  }

  async reissue(args: {
    recordId: string;
    actorId: string;
    actorRole: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
  }): Promise<CredentialActionResponse> {
    const recordId = requireUuid(args.recordId, 'accreditation.invalid');
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/accreditations/${recordId}/reissue`,
        body: { recordId },
        mode: 'local',
      },
      async (tx) => {
        const current = await loadRecord(tx, recordId);
        if (!current) refuse('ACCREDITATION_NOT_FOUND', 'accreditation.not_found');
        if (current.status !== 'issued' && current.status !== 'revoked') {
          refuse('NOT_ISSUED', 'accreditation.reissue.not_issued');
        }
        await assertGatesMet(tx, recordId);
        const before = { badgeNumber: current.badge_number, status: current.status };
        const issued = await stampIssued(tx, recordId);
        await writeAudit(tx, {
          eventId: await eventIdFor(tx, recordId),
          actorId: args.actorId,
          actorRole: args.actorRole,
          action: 'accreditation.reissue',
          subjectId: recordId,
          before,
          after: { badgeNumber: issued.badge_number, qrValue: issued.qr_value },
        });
        return { status: 200, body: await actionResponse(tx, toRecord(issued)) };
      },
    );
    return result.body as CredentialActionResponse;
  }

  async revoke(args: {
    recordId: string;
    actorId: string;
    actorRole: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    body: unknown;
  }): Promise<CredentialActionResponse> {
    const recordId = requireUuid(args.recordId, 'accreditation.invalid');
    const parsed = revokeBody.safeParse(args.body ?? {});
    if (!parsed.success) refuse('VALIDATION_ERROR', 'accreditation.revoke.reason_required');
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/accreditations/${recordId}/revoke`,
        body: { recordId, reason: parsed.data.reason },
        mode: 'local',
      },
      async (tx) => {
        const current = await loadRecord(tx, recordId);
        if (!current) refuse('ACCREDITATION_NOT_FOUND', 'accreditation.not_found');
        if (current.status !== 'issued') refuse('NOT_ISSUED', 'accreditation.revoke.not_issued');
        const updated = await tx.query<AccreditationRow>(
          `UPDATE core.accreditation
              SET status = 'revoked',
                  revoked_at = now(),
                  revoked_reason = $2,
                  updated_at = now()
            WHERE id = $1
            RETURNING id, person_id, sport_name, role, photo_status, eligibility_status,
                      status, zones, badge_number, valid_from, valid_until, issued_at,
                      revoked_reason, updated_at, qr_value`,
          [recordId, parsed.data.reason],
        );
        const row = await hydrate(tx, updated.rows[0]!);
        await writeAudit(tx, {
          eventId: await eventIdFor(tx, recordId),
          actorId: args.actorId,
          actorRole: args.actorRole,
          action: 'accreditation.revoke',
          subjectId: recordId,
          before: { status: 'issued', badgeNumber: current.badge_number },
          after: { status: 'revoked', reason: parsed.data.reason },
        });
        return { status: 200, body: await actionResponse(tx, toRecord(row)) };
      },
    );
    return result.body as CredentialActionResponse;
  }
}

function summarize(records: readonly AccreditationRecord[]): AccreditationSummary {
  return {
    pendingCount: records.filter((record) => record.status === 'pending_review').length,
    issuedCount: records.filter((record) => record.status === 'issued').length,
    revokedCount: records.filter((record) => record.status === 'revoked').length,
  };
}

async function loadRecord(tx: Queryable, id: string): Promise<AccreditationRow | undefined> {
  const { rows } = await tx.query<AccreditationRow>(`${SELECT_RECORD} WHERE a.id = $1`, [id]);
  return rows[0];
}

async function hydrate(tx: Queryable, partial: Omit<AccreditationRow, 'given_name' | 'family_name' | 'nationality'> & Partial<AccreditationRow>): Promise<AccreditationRow> {
  const full = await loadRecord(tx, partial.id);
  if (!full) refuse('ACCREDITATION_NOT_FOUND', 'accreditation.not_found');
  return full;
}

async function assertGatesMet(tx: Queryable, recordId: string): Promise<void> {
  const { rows } = await tx.query<{ gates: string[] | null }>(
    `SELECT core.accreditation_unmet_gates($1) AS gates`,
    [recordId],
  );
  const gates = rows[0]?.gates;
  if (gates == null) {
    refuse('NOT_ELIGIBLE_TO_ISSUE', 'accreditation.gate.not_configured');
  }
  if (gates.length > 0) {
    refuse('NOT_ELIGIBLE_TO_ISSUE', 'accreditation.gate.unmet', {
      gate: gates[0]!,
      gates: gates.join(','),
    });
  }
}

async function stampIssued(tx: Queryable, recordId: string): Promise<AccreditationRow> {
  const qrValue = randomUUID();
  const { rows: next } = await tx.query<{ n: string }>(
    `SELECT COALESCE(MAX(substring(badge_number from 'COMO27-([0-9]+)$')::int), 0) + 1 AS n
       FROM core.accreditation
      WHERE badge_number ~ '^COMO27-[0-9]+$'`,
  );
  let n = Number(next[0]?.n ?? 1);
  if (!Number.isFinite(n) || n < 1) n = 1;
  // Fixture/demo rows occupy COMO27-000098..000118 on the shared test database.
  if (n < 500000) n = 500000;
  const badgeNumber = `COMO27-${String(n).padStart(6, '0')}`;
  const updated = await tx.query<{ id: string }>(
    `UPDATE core.accreditation
        SET status = 'issued',
            badge_number = $2,
            qr_value = $3,
            issued_at = now(),
            revoked_at = NULL,
            revoked_reason = NULL,
            updated_at = now()
      WHERE id = $1
      RETURNING id`,
    [recordId, badgeNumber, qrValue],
  );
  const row = await loadRecord(tx, updated.rows[0]!.id);
  if (!row) refuse('ACCREDITATION_NOT_FOUND', 'accreditation.not_found');
  return row;
}

async function actionResponse(tx: Queryable, record: AccreditationRecord): Promise<CredentialActionResponse> {
  const { rows } = await tx.query<{ status: string; n: string }>(
    `SELECT status, COUNT(*)::text AS n FROM core.accreditation GROUP BY status`,
  );
  const counts = Object.fromEntries(rows.map((row) => [row.status, Number(row.n)]));
  return {
    record,
    summary: {
      pendingCount: (counts.pending ?? 0) + (counts.pending_review ?? 0),
      issuedCount: counts.issued ?? 0,
      revokedCount: counts.revoked ?? 0,
    },
  };
}

async function eventIdFor(tx: Queryable, recordId: string): Promise<string> {
  const { rows } = await tx.query<{ event_id: string }>(
    `SELECT event_id FROM core.accreditation WHERE id = $1`,
    [recordId],
  );
  return rows[0]!.event_id;
}

async function writeAudit(
  tx: Queryable,
  args: {
    eventId: string;
    actorId: string;
    actorRole: string;
    action: string;
    subjectId: string;
    before?: unknown;
    after: unknown;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO audit.activity_log
       (event_id, actor_id, actor_role, action, subject_type, subject_id, before, after)
     VALUES ($1, $2, $3, $4, 'accreditation', $5, $6::jsonb, $7::jsonb)`,
    [
      args.eventId,
      args.actorId,
      args.actorRole,
      args.action,
      args.subjectId,
      args.before == null ? null : JSON.stringify(args.before),
      JSON.stringify(args.after),
    ],
  );
}
