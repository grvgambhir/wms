import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { EligibilityEvidence, EvidenceMutationResponse, PaginatedResponse } from '@wms/domain';
import { z } from 'zod';
import type { Queryable } from '../common/idempotency/idempotency.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { pool } from '../db/pool';
import { recomputeEntryEvidenceGate } from './entry-evidence-gate';
import { refuse } from '../people/refuse';
import { EVIDENCE_STORAGE, type EvidenceStorage } from './evidence-storage';
import {
  asInt,
  entryGate,
  headerKey,
  iso,
  isI18nKey,
  ordinaryLabel,
  ordinaryType,
  personNames,
  refuseTransition,
  requireUuid,
  statusFrom,
} from './helpers';

const declaredAttribute = z.object({
  attribute: z.enum(['weight_kg', 'belt_rank', 'federation_licence']),
  numericValue: z.number().finite().optional(),
  textValue: z.string().trim().min(1).max(40).optional(),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const uploadBody = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(100),
  fileSizeBytes: z.number().int().nonnegative(),
  declaredAttribute: declaredAttribute.optional(),
});

const decideBody = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().min(1).max(200).optional(),
});

const waiverBody = z.object({
  reasonKey: z.string().trim().min(1).max(200),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type OwnedEntry = {
  id: string;
  event_id: string;
  sport_entry_product_id: string;
  sport_id: string;
  person_id: string;
  ends_on: Date | string;
};

type ObligationRow = {
  id: string;
  entry_id: string;
  sport_entry_product_id: string;
  person_id: string;
  athlete_name: string | null;
  sport_name: string | null;
  product_name: string | null;
  document_kind: string;
  message_key: string;
  requiredness: string | null;
  original_file_name: string | null;
  mime_type: string | null;
  size_bytes: string | number | null;
  uploaded_at: Date | string | null;
  reviewed_at: Date | string | null;
  reason_key: string | null;
  reviewer_id: string | null;
  decision: string | null;
  review_started_at: Date | string | null;
  has_upload: boolean;
  waived: boolean;
};

@Injectable()
export class EvidenceService {
  constructor(
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
    @Inject(EVIDENCE_STORAGE) private readonly storage: EvidenceStorage,
  ) {}

  async listForEntry(args: {
    entryId: string;
    sportEntryProductId?: string;
    personId: string;
  }): Promise<PaginatedResponse<EligibilityEvidence>> {
    const entry = await this.loadOwnedEntry(pool, args.entryId, args.personId);
    if (args.sportEntryProductId && args.sportEntryProductId !== entry.sport_entry_product_id) {
      refuse('REGISTRATION_ENTRY_NOT_FOUND', 'registration.entry.not_found');
    }
    await this.ensureObligations(pool, entry);
    const items = await this.loadItems(pool, entry.id, entry.person_id);
    return { items, total: items.length };
  }

  async reviewQueue(): Promise<PaginatedResponse<EligibilityEvidence>> {
    const items = await this.loadQueue(pool);
    return { items, total: items.length };
  }

  async upload(args: {
    evidenceId: string;
    personId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    body: unknown;
  }): Promise<EvidenceMutationResponse<EligibilityEvidence>> {
    const evidenceId = requireUuid(args.evidenceId, 'evidence.id.invalid');
    const parsed = uploadBody.safeParse(args.body ?? {});
    if (!parsed.success) refuse('VALIDATION_ERROR', 'evidence.upload.invalid');

    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/evidence/${evidenceId}/uploads`,
        body: parsed.data,
        mode: 'local',
      },
      async (tx) => {
        const obligation = await this.loadOwnObligation(tx, evidenceId, args.personId);
        const current = await this.loadItem(tx, obligation.id, obligation.entry_id);
        if (!current) refuse('EVIDENCE_NOT_FOUND', 'evidence.not_found');
        if (current.status !== 'required' && current.status !== 'rejected') {
          refuseTransition(current.status, 'upload');
        }
        this.assertDeclaredAttribute(obligation.document_kind, parsed.data.declaredAttribute);
        const stored = await this.storage.put({
          scope: 'ordinary',
          evidenceId,
          fileName: parsed.data.fileName,
          mimeType: parsed.data.mimeType,
          sizeBytes: parsed.data.fileSizeBytes,
        });
        const next = await tx.query<{ n: number }>(
          `SELECT COALESCE(MAX(version_no), 0) + 1 AS n
             FROM core.evidence_upload WHERE obligation_id = $1`,
          [evidenceId],
        );
        await tx.query(
          `INSERT INTO core.evidence_upload
             (obligation_id, version_no, s3_key, s3_object_version, mime_type, size_bytes,
              scan_status, original_file_name, expires_on, declared_attributes)
           VALUES ($1, $2, $3, $4, $5, $6, 'clean', $7, $8, $9::jsonb)`,
          [
            evidenceId,
            next.rows[0]?.n ?? 1,
            stored.s3Key,
            stored.s3ObjectVersion,
            parsed.data.mimeType,
            parsed.data.fileSizeBytes,
            parsed.data.fileName,
            parsed.data.declaredAttribute?.validUntil ?? null,
            JSON.stringify(parsed.data.declaredAttribute ? [parsed.data.declaredAttribute] : []),
          ],
        );
        const items = await this.loadItems(tx, obligation.entry_id, args.personId);
        const item = items.find((candidate) => candidate.id === evidenceId);
        if (!item) refuse('EVIDENCE_NOT_FOUND', 'evidence.not_found');
        await recomputeEntryEvidenceGate(tx, obligation.entry_id);
        return { status: 200, body: { item, entryEvidenceStatus: entryGate(items) } };
      },
    );
    return result.body as EvidenceMutationResponse<EligibilityEvidence>;
  }

  async startReview(args: {
    evidenceId: string;
    actorId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
  }): Promise<EvidenceMutationResponse<EligibilityEvidence>> {
    const evidenceId = requireUuid(args.evidenceId, 'evidence.id.invalid');
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/evidence/${evidenceId}/review`,
        body: { evidenceId },
        mode: 'local',
      },
      async (tx) => {
        const obligation = await this.loadObligation(tx, evidenceId);
        const current = await this.loadItem(tx, evidenceId, obligation.entry_id);
        if (!current) refuse('EVIDENCE_NOT_FOUND', 'evidence.not_found');
        if (current.status !== 'uploaded') refuseTransition(current.status, 'review');
        const uploadId = await this.latestUploadId(tx, evidenceId);
        await tx.query(
          `INSERT INTO core.evidence_review (upload_id, decision, reviewer_id)
           VALUES ($1, 'under_review', $2)`,
          [uploadId, args.actorId],
        );
        const items = await this.loadItems(tx, obligation.entry_id, obligation.person_id);
        const item = items.find((candidate) => candidate.id === evidenceId);
        if (!item) refuse('EVIDENCE_NOT_FOUND', 'evidence.not_found');
        await recomputeEntryEvidenceGate(tx, obligation.entry_id);
        return { status: 200, body: { item, entryEvidenceStatus: entryGate(items) } };
      },
    );
    return result.body as EvidenceMutationResponse<EligibilityEvidence>;
  }

  async decide(args: {
    evidenceId: string;
    actorId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    body: unknown;
  }): Promise<EvidenceMutationResponse<EligibilityEvidence>> {
    const evidenceId = requireUuid(args.evidenceId, 'evidence.id.invalid');
    const parsed = decideBody.safeParse(args.body ?? {});
    if (!parsed.success) refuse('VALIDATION_ERROR', 'evidence.decision.invalid');
    if (parsed.data.decision === 'rejected') {
      if (!parsed.data.reason)
        refuse('REJECTION_REASON_REQUIRED', 'evidence.rejected.reason_key_required');
      if (!isI18nKey(parsed.data.reason))
        refuse('VALIDATION_ERROR', 'evidence.rejected.reason_key_required');
    }

    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/evidence/${evidenceId}/decisions`,
        body: parsed.data,
        mode: 'local',
      },
      async (tx) => {
        const obligation = await this.loadObligation(tx, evidenceId);
        const current = await this.loadItem(tx, evidenceId, obligation.entry_id);
        if (!current) refuse('EVIDENCE_NOT_FOUND', 'evidence.not_found');
        if (current.status !== 'under_review') refuseTransition(current.status, 'decide');
        const uploadId = await this.latestUploadId(tx, evidenceId);
        await tx.query(
          `INSERT INTO core.evidence_review (upload_id, decision, reviewer_id, reason_key)
           VALUES ($1, $2, $3, $4)`,
          [
            uploadId,
            parsed.data.decision,
            args.actorId,
            parsed.data.decision === 'rejected' ? parsed.data.reason : null,
          ],
        );
        if (parsed.data.decision === 'approved') {
          await this.materializeApprovedAttribute(tx, obligation, uploadId, args.actorId);
        }
        const items = await this.loadItems(tx, obligation.entry_id, obligation.person_id);
        const item = items.find((candidate) => candidate.id === evidenceId);
        if (!item) refuse('EVIDENCE_NOT_FOUND', 'evidence.not_found');
        await recomputeEntryEvidenceGate(tx, obligation.entry_id);
        return { status: 200, body: { item, entryEvidenceStatus: entryGate(items) } };
      },
    );
    return result.body as EvidenceMutationResponse<EligibilityEvidence>;
  }

  async waive(args: {
    evidenceId: string;
    actorId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    body: unknown;
  }): Promise<EvidenceMutationResponse<EligibilityEvidence>> {
    const evidenceId = requireUuid(args.evidenceId, 'evidence.id.invalid');
    const parsed = waiverBody.safeParse(args.body ?? {});
    if (!parsed.success) refuse('VALIDATION_ERROR', 'evidence.waiver.invalid');
    if (!isI18nKey(parsed.data.reasonKey)) {
      refuse('VALIDATION_ERROR', 'evidence.waiver.reason_key_required');
    }

    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/evidence/${evidenceId}/waivers`,
        body: parsed.data,
        mode: 'local',
      },
      async (tx) => {
        const obligation = await this.loadObligation(tx, evidenceId);
        const version = await tx.query<{ id: string }>(
          `SELECT id FROM core.evidence_requirement_version
            WHERE requirement_set_id = $1 AND status = 'active'
            ORDER BY version_no DESC LIMIT 1`,
          [obligation.requirement_set_id],
        );
        const versionId = version.rows[0]?.id;
        if (!versionId) refuse('EVIDENCE_NOT_FOUND', 'evidence.requirement.not_found');
        await tx.query(
          `INSERT INTO core.evidence_waiver
             (event_id, person_id, requirement_set_id, requirement_version_id, entry_id,
              status, approved_by, reason_key, valid_until)
           VALUES ($1, $2, $3, $4, $5, 'approved', $6, $7, $8)`,
          [
            obligation.event_id,
            obligation.person_id,
            obligation.requirement_set_id,
            versionId,
            obligation.entry_id,
            args.actorId,
            parsed.data.reasonKey,
            parsed.data.validUntil ?? null,
          ],
        );
        const items = await this.loadItems(tx, obligation.entry_id, obligation.person_id);
        const item = items.find((candidate) => candidate.id === evidenceId);
        if (!item) refuse('EVIDENCE_NOT_FOUND', 'evidence.not_found');
        await recomputeEntryEvidenceGate(tx, obligation.entry_id);
        return { status: 200, body: { item, entryEvidenceStatus: entryGate(items) } };
      },
    );
    return result.body as EvidenceMutationResponse<EligibilityEvidence>;
  }

  async loadOwnedEntry(db: Queryable, entryId: string, personId: string): Promise<OwnedEntry> {
    requireUuid(entryId, 'registration.entry.invalid');
    const { rows } = await db.query<OwnedEntry>(
      `SELECT re.id,
              re.event_id,
              re.sport_entry_product_id,
              sep.sport_id,
              ap.person_id,
              ev.ends_on
         FROM core.registration_entry re
         JOIN core.athlete_profile ap ON ap.id = re.athlete_profile_id
         JOIN core.sport_entry_product sep ON sep.id = re.sport_entry_product_id
         JOIN core.event ev ON ev.id = re.event_id
        WHERE re.id = $1
          AND ap.person_id = $2`,
      [entryId, personId],
    );
    const row = rows[0];
    if (!row) refuse('REGISTRATION_ENTRY_NOT_FOUND', 'registration.entry.not_found');
    return row;
  }

  async loadEntry(db: Queryable, entryId: string): Promise<OwnedEntry> {
    requireUuid(entryId, 'registration.entry.invalid');
    const { rows } = await db.query<OwnedEntry>(
      `SELECT re.id,
              re.event_id,
              re.sport_entry_product_id,
              sep.sport_id,
              ap.person_id,
              ev.ends_on
         FROM core.registration_entry re
         JOIN core.athlete_profile ap ON ap.id = re.athlete_profile_id
         JOIN core.sport_entry_product sep ON sep.id = re.sport_entry_product_id
         JOIN core.event ev ON ev.id = re.event_id
        WHERE re.id = $1`,
      [entryId],
    );
    const row = rows[0];
    if (!row) refuse('REGISTRATION_ENTRY_NOT_FOUND', 'registration.entry.not_found');
    return row;
  }

  private async ensureObligations(db: Queryable, entry: OwnedEntry): Promise<void> {
    await db.query(
      `INSERT INTO core.evidence_obligation (event_id, person_id, requirement_set_id, classification)
       SELECT $1, $2, r.requirement_set_id, 'ordinary'
         FROM core.evidence_requirements_for($1, $3, $4) r
       ON CONFLICT (event_id, person_id, requirement_set_id) DO NOTHING`,
      [entry.event_id, entry.person_id, entry.sport_id, entry.sport_entry_product_id],
    );
    await db.query(
      `INSERT INTO core.evidence_obligation_application (obligation_id, entry_id)
       SELECT o.id, $5
         FROM core.evidence_obligation o
         JOIN core.evidence_requirements_for($1, $3, $4) r
           ON r.requirement_set_id = o.requirement_set_id
        WHERE o.person_id = $2 AND o.event_id = $1
       ON CONFLICT DO NOTHING`,
      [entry.event_id, entry.person_id, entry.sport_id, entry.sport_entry_product_id, entry.id],
    );
  }

  private async loadOwnObligation(
    db: Queryable,
    evidenceId: string,
    personId: string,
  ): Promise<{
    id: string;
    entry_id: string;
    person_id: string;
    event_id: string;
    requirement_set_id: string;
    document_kind: string;
  }> {
    const { rows } = await db.query<{
      id: string;
      entry_id: string;
      person_id: string;
      event_id: string;
      requirement_set_id: string;
      document_kind: string;
    }>(
      `SELECT o.id, a.entry_id, o.person_id, o.event_id, o.requirement_set_id, rs.document_kind
         FROM core.evidence_obligation o
         JOIN core.evidence_obligation_application a ON a.obligation_id = o.id
         JOIN core.evidence_requirement_set rs ON rs.id = o.requirement_set_id
        WHERE o.id = $1
          AND o.person_id = $2`,
      [evidenceId, personId],
    );
    const row = rows[0];
    if (!row) refuse('EVIDENCE_NOT_FOUND', 'evidence.not_found');
    return row;
  }

  private async loadObligation(
    db: Queryable,
    evidenceId: string,
  ): Promise<{
    id: string;
    entry_id: string;
    person_id: string;
    event_id: string;
    requirement_set_id: string;
    document_kind: string;
  }> {
    const { rows } = await db.query<{
      id: string;
      entry_id: string;
      person_id: string;
      event_id: string;
      requirement_set_id: string;
      document_kind: string;
    }>(
      `SELECT o.id, a.entry_id, o.person_id, o.event_id, o.requirement_set_id, rs.document_kind
         FROM core.evidence_obligation o
         JOIN core.evidence_obligation_application a ON a.obligation_id = o.id
         JOIN core.evidence_requirement_set rs ON rs.id = o.requirement_set_id
        WHERE o.id = $1`,
      [evidenceId],
    );
    const row = rows[0];
    if (!row) refuse('EVIDENCE_NOT_FOUND', 'evidence.not_found');
    return row;
  }

  private async latestUploadId(db: Queryable, obligationId: string): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM core.evidence_upload
        WHERE obligation_id = $1
        ORDER BY version_no DESC LIMIT 1`,
      [obligationId],
    );
    const id = rows[0]?.id;
    if (!id) refuse('EVIDENCE_NOT_FOUND', 'evidence.upload.not_found');
    return id;
  }

  private assertDeclaredAttribute(
    documentKind: string,
    value: z.infer<typeof declaredAttribute> | undefined,
  ): void {
    const expected =
      documentKind === 'weigh_in'
        ? 'weight_kg'
        : documentKind === 'belt_certificate'
          ? 'belt_rank'
          : documentKind === 'federation_licence'
            ? 'federation_licence'
            : undefined;
    if (!expected) {
      if (value) refuse('VALIDATION_ERROR', 'evidence.attribute.not_supported');
      return;
    }
    if (!value || value.attribute !== expected) refuse('VALIDATION_ERROR', 'evidence.attribute.required');
    if (expected === 'weight_kg' && value.numericValue == null) {
      refuse('VALIDATION_ERROR', 'evidence.attribute.weight_required');
    }
    if (expected !== 'weight_kg' && !value.textValue) {
      refuse('VALIDATION_ERROR', 'evidence.attribute.value_required');
    }
    if (expected === 'federation_licence' && !value.validUntil) {
      refuse('VALIDATION_ERROR', 'evidence.attribute.expiry_required');
    }
  }

  private async materializeApprovedAttribute(
    db: Queryable,
    obligation: { id: string; entry_id: string; person_id: string; event_id: string; document_kind: string },
    uploadId: string,
    reviewerId: string,
  ): Promise<void> {
    const upload = await db.query<{ declared_attributes: unknown; expires_on: string | null }>(
      `SELECT declared_attributes, expires_on::text FROM core.evidence_upload WHERE id = $1`,
      [uploadId],
    );
    const raw = upload.rows[0]?.declared_attributes;
    const value = Array.isArray(raw) ? raw[0] : null;
    const parsed = declaredAttribute.safeParse(value);
    if (!parsed.success) return;
    const sport = await db.query<{ code: string }>(
      `SELECT s.code FROM core.registration_entry e
         JOIN core.sport_entry_product p ON p.id = e.sport_entry_product_id
         JOIN core.sport s ON s.id = p.sport_id WHERE e.id = $1`,
      [obligation.entry_id],
    );
    const sportCode = sport.rows[0]?.code;
    if (!sportCode) return;
    const nextId = randomUUID();
    const issuer = parsed.data.attribute === 'federation_licence' ? 'Judo federation' : null;
    const version = await db.query<{ n: number }>(
      `SELECT COALESCE(MAX(version_no), 0) + 1 AS n FROM core.entrant_attribute
        WHERE event_id = $1 AND person_id = $2 AND attribute = $3
          AND sport_code IS NOT DISTINCT FROM $4 AND issuer IS NOT DISTINCT FROM $5`,
      [obligation.event_id, obligation.person_id, parsed.data.attribute, sportCode, issuer],
    );
    await db.query(
      `UPDATE core.entrant_attribute SET superseded_by = $6
        WHERE event_id = $1 AND person_id = $2 AND attribute = $3
          AND sport_code IS NOT DISTINCT FROM $4 AND issuer IS NOT DISTINCT FROM $5
          AND superseded_by IS NULL AND status <> 'rejected'`,
      [obligation.event_id, obligation.person_id, parsed.data.attribute, sportCode, issuer, nextId],
    );
    await db.query(
      `INSERT INTO core.entrant_attribute
         (id, event_id, person_id, attribute, sport_code, issuer, version_no, numeric_value,
          text_value, status, verified_by, verified_at, valid_from, valid_until, evidence_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'verified', $10, now(), CURRENT_DATE, $11, $12)`,
      [
        nextId,
        obligation.event_id,
        obligation.person_id,
        parsed.data.attribute,
        sportCode,
        issuer,
        version.rows[0]?.n ?? 1,
        parsed.data.numericValue ?? null,
        parsed.data.textValue ?? null,
        reviewerId,
        parsed.data.validUntil ?? upload.rows[0]?.expires_on ?? null,
        obligation.id,
      ],
    );
  }

  private async loadItem(
    db: Queryable,
    obligationId: string,
    entryId: string,
  ): Promise<EligibilityEvidence | null> {
    const items = await this.loadItems(db, entryId, null, obligationId);
    return items[0] ?? null;
  }

  private async loadQueue(db: Queryable): Promise<EligibilityEvidence[]> {
    const { rows } = await db.query<ObligationRow>(
      this.itemSql(`(
        CASE
          WHEN latest.decision IS NOT NULL THEN latest.decision
          WHEN u.id IS NOT NULL THEN 'uploaded'
          ELSE 'required'
        END
      ) IN ('uploaded', 'under_review')`),
    );
    const reviewers = await personNames(
      db,
      rows.map((row) => row.reviewer_id),
    );
    return rows.map((row) => this.toItem(row, reviewers));
  }

  private async loadItems(
    db: Queryable,
    entryId: string,
    personId: string | null,
    obligationId?: string,
  ): Promise<EligibilityEvidence[]> {
    const filters = ['a.entry_id = $1'];
    const params: unknown[] = [entryId];
    if (personId) {
      params.push(personId);
      filters.push(`o.person_id = $${params.length}`);
    }
    if (obligationId) {
      params.push(obligationId);
      filters.push(`o.id = $${params.length}`);
    }
    const { rows } = await db.query<ObligationRow>(this.itemSql(filters.join(' AND ')), params);
    const reviewers = await personNames(
      db,
      rows.map((row) => row.reviewer_id),
    );
    return rows.map((row) => this.toItem(row, reviewers));
  }

  private itemSql(where: string): string {
    return `
      SELECT o.id,
             a.entry_id,
             re.sport_entry_product_id,
             o.person_id,
             -- The review queue is a work list: a reviewer needs to know whose document this is
             -- and what it is for, without opening each entry.
             NULLIF(trim(concat_ws(' ', athlete.given_name, athlete.family_name)), '') AS athlete_name,
             sport.name AS sport_name,
             product.name AS product_name,
             rs.document_kind,
             rv.message_key,
             rv.requiredness,
             u.original_file_name,
             u.mime_type,
             u.size_bytes,
             u.uploaded_at,
             latest.occurred_at AS reviewed_at,
             latest.reason_key,
             latest.reviewer_id,
             latest.decision,
             review_started.occurred_at AS review_started_at,
             (u.id IS NOT NULL) AS has_upload,
             (waiver.waived IS NOT NULL) AS waived
        FROM core.evidence_obligation o
        JOIN core.evidence_obligation_application a ON a.obligation_id = o.id
        JOIN core.registration_entry re ON re.id = a.entry_id
        JOIN core.sport_entry_product product ON product.id = re.sport_entry_product_id
        JOIN core.sport sport ON sport.id = product.sport_id
        JOIN core.person athlete ON athlete.id = o.person_id
        JOIN core.evidence_requirement_set rs ON rs.id = o.requirement_set_id
        LEFT JOIN LATERAL (
          SELECT rv2.message_key, rv2.requiredness
            FROM core.evidence_requirement_version rv2
           WHERE rv2.requirement_set_id = o.requirement_set_id AND rv2.status = 'active'
           ORDER BY rv2.version_no DESC LIMIT 1
        ) rv ON true
        LEFT JOIN LATERAL (
          SELECT u2.* FROM core.evidence_upload u2
           WHERE u2.obligation_id = o.id
           ORDER BY u2.version_no DESC LIMIT 1
        ) u ON true
        LEFT JOIN LATERAL (
          SELECT r.* FROM core.evidence_review r
           WHERE r.upload_id = u.id
           ORDER BY r.occurred_at DESC LIMIT 1
        ) latest ON true
        LEFT JOIN LATERAL (
          SELECT r.occurred_at FROM core.evidence_review r
           WHERE r.upload_id = u.id AND r.decision = 'under_review'
           ORDER BY r.occurred_at ASC LIMIT 1
        ) review_started ON true
        LEFT JOIN LATERAL (
          SELECT 1 AS waived
            FROM core.evidence_waiver w
           WHERE w.person_id = o.person_id
             AND w.requirement_set_id = o.requirement_set_id
             AND w.status = 'approved'
             AND (w.entry_id IS NULL OR w.entry_id = a.entry_id)
             AND (w.valid_until IS NULL OR w.valid_until >= CURRENT_DATE)
           LIMIT 1
        ) waiver ON true
       WHERE ${where}
       ORDER BY o.created_at, o.id`;
  }

  private toItem(row: ObligationRow, reviewers: ReadonlyMap<string, string>): EligibilityEvidence {
    const status = statusFrom(row.decision, row.has_upload, row.waived);
    const reviewerDisplayName = row.reviewer_id ? reviewers.get(row.reviewer_id) : undefined;
    return {
      id: row.id,
      registrationEntryId: row.entry_id,
      sportEntryProductId: row.sport_entry_product_id,
      athleteId: row.person_id,
      type: ordinaryType(row.document_kind),
      label: ordinaryLabel(row.document_kind, row.message_key),
      required: row.requiredness !== 'optional',
      status,
      ...(row.original_file_name ? { fileName: row.original_file_name } : {}),
      ...(row.mime_type ? { mimeType: row.mime_type } : {}),
      ...(asInt(row.size_bytes) != null ? { fileSizeBytes: asInt(row.size_bytes) } : {}),
      ...(iso(row.uploaded_at) ? { uploadedAt: iso(row.uploaded_at) } : {}),
      ...(iso(row.review_started_at) ? { reviewStartedAt: iso(row.review_started_at) } : {}),
      ...(iso(row.reviewed_at) && (status === 'approved' || status === 'rejected')
        ? { reviewedAt: iso(row.reviewed_at) }
        : {}),
      ...(reviewerDisplayName ? { reviewerDisplayName } : {}),
      ...(status === 'rejected' && row.reason_key ? { rejectionReason: row.reason_key } : {}),
      ...(row.athlete_name ? { athleteName: row.athlete_name } : {}),
      ...(row.sport_name ? { sportName: row.sport_name } : {}),
      ...(row.product_name ? { productName: row.product_name } : {}),
    };
  }
}
