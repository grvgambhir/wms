import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { EvidenceMutationResponse, PaginatedResponse, RestrictedEvidence } from '@wms/domain';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { Queryable } from '../common/idempotency/idempotency.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { pool } from '../db/pool';
import { refuse } from '../people/refuse';
import { EvidenceService } from './evidence.service';
import { EVIDENCE_STORAGE, type EvidenceStorage } from './evidence-storage';
import {
  ACCESS_POLICY_RESTRICTED,
  asInt,
  entryGate,
  headerKey,
  iso,
  isI18nKey,
  personNames,
  refuseTransition,
  requireUuid,
  restrictedLabel,
  restrictedType,
  statusFrom,
} from './helpers';
import { RESTRICTED_POOL } from './restricted-pool';
import { runRestricted } from './restricted-session';
import { recomputeEntryEvidenceGate } from './entry-evidence-gate';

const uploadBody = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(100),
  fileSizeBytes: z.number().int().nonnegative(),
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

type RequirementRow = {
  requirement_set_id: string;
  document_kind: string;
  requirement_version_id: string;
  message_key: string;
  requiredness: string;
};

type DocumentRow = {
  id: string;
  person_id: string;
  event_id: string;
  kind: string;
  requirement_set_id: string | null;
  entry_id: string | null;
  original_file_name: string | null;
  mime_type: string | null;
  size_bytes: string | number | null;
  uploaded_at: Date | string | null;
  reviewed_at: Date | string | null;
  reason_key: string | null;
  reviewer_id: string | null;
  decision: string | null;
  review_started_at: Date | string | null;
  upload_id: string | null;
  has_upload: boolean;
  waived: boolean;
};

@Injectable()
export class RestrictedEvidenceService implements OnModuleDestroy {
  constructor(
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
    @Inject(EVIDENCE_STORAGE) private readonly storage: EvidenceStorage,
    @Inject(EvidenceService) private readonly ordinary: EvidenceService,
    @Inject(RESTRICTED_POOL) private readonly restrictedPool: Pool,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.restrictedPool.end();
  }

  private withRestricted<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    return runRestricted(this.restrictedPool, fn);
  }

  async listForEntry(args: {
    entryId: string;
    sportEntryProductId?: string;
    personId: string;
  }): Promise<PaginatedResponse<RestrictedEvidence>> {
    const entry = await this.ordinary.loadOwnedEntry(pool, args.entryId, args.personId);
    if (args.sportEntryProductId && args.sportEntryProductId !== entry.sport_entry_product_id) {
      refuse('REGISTRATION_ENTRY_NOT_FOUND', 'registration.entry.not_found');
    }
    const requirements = await this.restrictedRequirements(
      pool,
      entry.event_id,
      entry.sport_id,
      entry.sport_entry_product_id,
    );
    await this.ensureDocuments(pool, entry, requirements);
    const loggedAt = new Date().toISOString();
    const items = await this.loadItems(pool, {
      entryId: entry.id,
      personId: entry.person_id,
      actorId: args.personId,
      requirements,
      logAccess: true,
      purpose: 'GET /v1/restricted-evidence',
    });
    return {
      items: items.map((item) => ({ ...item, accessLoggedAt: loggedAt })),
      total: items.length,
    };
  }

  async reviewQueue(): Promise<PaginatedResponse<RestrictedEvidence>> {
    const items = await this.loadQueue(pool);
    return { items, total: items.length };
  }

  async upload(args: {
    evidenceId: string;
    personId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    body: unknown;
  }): Promise<EvidenceMutationResponse<RestrictedEvidence>> {
    const evidenceId = requireUuid(args.evidenceId, 'evidence.id.invalid');
    const parsed = uploadBody.safeParse(args.body ?? {});
    if (!parsed.success) refuse('VALIDATION_ERROR', 'evidence.upload.invalid');

    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/restricted-evidence/${evidenceId}/uploads`,
        body: parsed.data,
        mode: 'local',
      },
      async (tx) => {
        const owned = await this.loadOwnDocument(tx, evidenceId, args.personId);
        const current = await this.loadItem(tx, owned);
        if (current.status !== 'required' && current.status !== 'rejected') {
          refuseTransition(current.status, 'upload');
        }
        const stored = await this.storage.put({
          scope: 'restricted',
          evidenceId,
          fileName: parsed.data.fileName,
          mimeType: parsed.data.mimeType,
          sizeBytes: parsed.data.fileSizeBytes,
        });
        await this.withRestricted(async (restricted) => {
          const next = await restricted.query<{ n: number }>(
            `SELECT COALESCE(MAX(version_no), 0) + 1 AS n
               FROM restricted.evidence_upload WHERE document_id = $1`,
            [evidenceId],
          );
          await restricted.query(
            `INSERT INTO restricted.evidence_upload
               (document_id, version_no, s3_key, s3_object_version, mime_type, size_bytes,
                scan_status, original_file_name)
             VALUES ($1, $2, $3, $4, $5, $6, 'clean', $7)`,
            [
              evidenceId,
              next.rows[0]?.n ?? 1,
              stored.s3Key,
              stored.s3ObjectVersion,
              parsed.data.mimeType,
              parsed.data.fileSizeBytes,
              parsed.data.fileName,
            ],
          );
        });
        const item = await this.loadItem(tx, owned);
        return {
          status: 200,
          body: {
            item,
            entryEvidenceStatus: await this.persistGate(tx, {
              entry_id: owned.entry_id,
              person_id: owned.person_id,
            }),
          },
        };
      },
    );
    return result.body as EvidenceMutationResponse<RestrictedEvidence>;
  }

  async startReview(args: {
    evidenceId: string;
    actorId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
  }): Promise<EvidenceMutationResponse<RestrictedEvidence>> {
    const evidenceId = requireUuid(args.evidenceId, 'evidence.id.invalid');
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/restricted-evidence/${evidenceId}/review`,
        body: { evidenceId },
        mode: 'local',
      },
      async (tx) => {
        const doc = await this.loadDocument(tx, evidenceId);
        const current = await this.loadItem(tx, doc);
        if (current.status !== 'uploaded') refuseTransition(current.status, 'review');
        await this.withRestricted(async (restricted) => {
          const uploadId = await this.latestUploadId(restricted, evidenceId);
          await restricted.query(
            `INSERT INTO restricted.evidence_review (upload_id, decision, reviewer_id)
             VALUES ($1, 'under_review', $2)`,
            [uploadId, args.actorId],
          );
          await restricted.query(
            `INSERT INTO restricted.access_log (document_id, actor_id, action, upload_id, purpose)
             VALUES ($1, $2, 'decide', $3, $4)`,
            [
              evidenceId,
              args.actorId,
              uploadId,
              `POST /v1/restricted-evidence/${evidenceId}/review`,
            ],
          );
        });
        const item = await this.loadItem(tx, doc);
        return {
          status: 200,
          body: {
            item,
            entryEvidenceStatus: await this.persistGate(tx, doc),
          },
        };
      },
    );
    return result.body as EvidenceMutationResponse<RestrictedEvidence>;
  }

  async decide(args: {
    evidenceId: string;
    actorId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    body: unknown;
  }): Promise<EvidenceMutationResponse<RestrictedEvidence>> {
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
        endpoint: `POST /v1/restricted-evidence/${evidenceId}/decisions`,
        body: parsed.data,
        mode: 'local',
      },
      async (tx) => {
        const doc = await this.loadDocument(tx, evidenceId);
        const current = await this.loadItem(tx, doc);
        if (current.status !== 'under_review') refuseTransition(current.status, 'decide');
        await this.withRestricted(async (restricted) => {
          const uploadId = await this.latestUploadId(restricted, evidenceId);
          await restricted.query(
            `INSERT INTO restricted.evidence_review (upload_id, decision, reviewer_id, reason_key)
             VALUES ($1, $2, $3, $4)`,
            [
              uploadId,
              parsed.data.decision,
              args.actorId,
              parsed.data.decision === 'rejected' ? parsed.data.reason : null,
            ],
          );
          await restricted.query(
            `INSERT INTO restricted.access_log (document_id, actor_id, action, upload_id, purpose)
             VALUES ($1, $2, 'decide', $3, $4)`,
            [
              evidenceId,
              args.actorId,
              uploadId,
              `POST /v1/restricted-evidence/${evidenceId}/decisions`,
            ],
          );
        });
        const item = await this.loadItem(tx, doc);
        // Same here: the entry follows its evidence, so an approval unlocks checkout by itself.
        // Only this path can see restricted statuses, so it passes them in.
        return {
          status: 200,
          body: {
            item,
            entryEvidenceStatus: await this.persistGate(tx, doc),
          },
        };
      },
    );
    return result.body as EvidenceMutationResponse<RestrictedEvidence>;
  }

  async waive(args: {
    evidenceId: string;
    actorId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    body: unknown;
  }): Promise<EvidenceMutationResponse<RestrictedEvidence>> {
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
        endpoint: `POST /v1/restricted-evidence/${evidenceId}/waivers`,
        body: parsed.data,
        mode: 'local',
      },
      async (tx) => {
        const doc = await this.loadDocument(tx, evidenceId);
        if (!doc.requirement_set_id) refuse('EVIDENCE_NOT_FOUND', 'evidence.requirement.not_found');
        const version = await tx.query<{ id: string }>(
          `SELECT id FROM core.evidence_requirement_version
            WHERE requirement_set_id = $1 AND status = 'active'
            ORDER BY version_no DESC LIMIT 1`,
          [doc.requirement_set_id],
        );
        const versionId = version.rows[0]?.id;
        if (!versionId) refuse('EVIDENCE_NOT_FOUND', 'evidence.requirement.not_found');
        await this.withRestricted(async (restricted) => {
          await restricted.query(
            `INSERT INTO restricted.evidence_waiver
               (event_id, person_id, requirement_set_id, requirement_version_id, entry_id,
                status, approved_by, reason_key, valid_until)
             VALUES ($1, $2, $3, $4, $5, 'approved', $6, $7, $8)`,
            [
              doc.event_id,
              doc.person_id,
              doc.requirement_set_id,
              versionId,
              doc.entry_id,
              args.actorId,
              parsed.data.reasonKey,
              parsed.data.validUntil ?? null,
            ],
          );
        });
        const item = await this.loadItem(tx, doc);
        // Same here: the entry follows its evidence, so an approval unlocks checkout by itself.
        // Only this path can see restricted statuses, so it passes them in.
        return {
          status: 200,
          body: {
            item,
            entryEvidenceStatus: await this.persistGate(tx, doc),
          },
        };
      },
    );
    return result.body as EvidenceMutationResponse<RestrictedEvidence>;
  }

  private async restrictedRequirements(
    db: Queryable,
    eventId: string,
    sportId: string,
    productId: string,
  ): Promise<RequirementRow[]> {
    const { rows } = await db.query<RequirementRow>(
      `SELECT rs.id AS requirement_set_id,
              rs.document_kind,
              rv.id AS requirement_version_id,
              rv.message_key,
              rv.requiredness
         FROM core.evidence_requirement_version rv
         JOIN core.evidence_requirement_set rs ON rs.id = rv.requirement_set_id
        WHERE rs.event_id = $1
          AND rs.classification = 'restricted'
          AND rv.status = 'active'
          AND (
            NOT EXISTS (
              SELECT 1 FROM core.evidence_requirement_applicability a
               WHERE a.requirement_version_id = rv.id)
            OR EXISTS (
              SELECT 1 FROM core.evidence_requirement_applicability a
               WHERE a.requirement_version_id = rv.id
                 AND (a.sport_id IS NULL OR a.sport_id = $2)
                 AND (a.sport_entry_product_id IS NULL OR a.sport_entry_product_id = $3)
            )
          )`,
      [eventId, sportId, productId],
    );
    return rows;
  }

  private async ensureDocuments(
    db: Queryable,
    entry: {
      id: string;
      event_id: string;
      person_id: string;
      ends_on: Date | string;
    },
    requirements: RequirementRow[],
  ): Promise<void> {
    if (requirements.length === 0) return;
    const consent = await db.query<{ id: string }>(
      `SELECT id FROM core.consent
        WHERE person_id = $1 AND kind = 'eligibility_medical_evidence' AND granted
        ORDER BY occurred_at DESC LIMIT 1`,
      [entry.person_id],
    );
    const retain = await db.query<{ d: string }>(
      `SELECT ($1::date + interval '15 months')::date::text AS d`,
      [entry.ends_on],
    );
    const retainUntil = retain.rows[0]?.d;
    if (!retainUntil) refuse('VALIDATION_ERROR', 'evidence.retain_until.invalid');

    const documents = await this.withRestricted(async (tx) => {
      const result = await tx.query<{ id: string; kind: string }>(
        `WITH wanted AS (
           SELECT requirement_set_id, document_kind
             FROM jsonb_to_recordset($6::jsonb)
               AS requirement(requirement_set_id uuid, document_kind text)
         ), existing AS (
           SELECT d.id, d.kind, d.requirement_set_id
             FROM restricted.evidence_document d
             JOIN wanted w ON w.requirement_set_id = d.requirement_set_id
            WHERE d.person_id = $1 AND d.event_id = $2
         ), inserted AS (
           INSERT INTO restricted.evidence_document
             (event_id, person_id, entry_id, kind, requirement_set_id, classification,
              lawful_basis, retain_until, consent_id)
           SELECT $2, $1, $3, w.document_kind, w.requirement_set_id,
                  'restricted', 'explicit_consent', $4, $5
             FROM wanted w
            WHERE NOT EXISTS (
              SELECT 1 FROM existing e WHERE e.requirement_set_id = w.requirement_set_id
            )
           RETURNING id, kind, requirement_set_id
         ), documents AS (
           SELECT id, kind, requirement_set_id FROM existing
           UNION ALL
           SELECT id, kind, requirement_set_id FROM inserted
         ), applied AS (
           INSERT INTO restricted.evidence_document_application (document_id, entry_id)
           SELECT id, $3 FROM documents
           ON CONFLICT DO NOTHING
           RETURNING document_id
         )
         SELECT id, kind FROM documents ORDER BY id`,
        [
          entry.person_id,
          entry.event_id,
          entry.id,
          retainUntil,
          consent.rows[0]?.id ?? null,
          JSON.stringify(
            requirements.map((requirement) => ({
              requirement_set_id: requirement.requirement_set_id,
              document_kind: requirement.document_kind,
            })),
          ),
        ],
      );
      return result.rows;
    });

    await db.query(
      `INSERT INTO core.protected_evidence_ref
         (person_id, event_id, kind, restricted_record_id)
       SELECT $1, $2, document.kind, document.id
         FROM jsonb_to_recordset($3::jsonb) AS document(id uuid, kind text)
        WHERE document.kind IN ('medical_certificate', 'para_classification')
       ON CONFLICT DO NOTHING`,
      [entry.person_id, entry.event_id, JSON.stringify(documents)],
    );
  }

  private async loadOwnDocument(
    _db: Queryable,
    evidenceId: string,
    personId: string,
  ): Promise<{
    id: string;
    person_id: string;
    event_id: string;
    entry_id: string;
    requirement_set_id: string | null;
  }> {
    const row = await this.withRestricted(async (tx) => {
      const found = await tx.query<{
        id: string;
        person_id: string;
        event_id: string;
        entry_id: string | null;
        requirement_set_id: string | null;
      }>(
        `SELECT d.id, d.person_id, d.event_id, d.requirement_set_id,
                COALESCE(a.entry_id, d.entry_id) AS entry_id
           FROM restricted.evidence_document d
           LEFT JOIN restricted.evidence_document_application a
             ON a.document_id = d.id
          WHERE d.id = $1
            AND d.person_id = $2
          LIMIT 1`,
        [evidenceId, personId],
      );
      return found.rows[0];
    });
    if (!row?.entry_id) refuse('EVIDENCE_NOT_FOUND', 'evidence.not_found');
    return { ...row, entry_id: row.entry_id };
  }

  private async loadDocument(
    _db: Queryable,
    evidenceId: string,
  ): Promise<{
    id: string;
    person_id: string;
    event_id: string;
    entry_id: string;
    requirement_set_id: string | null;
  }> {
    const row = await this.withRestricted(async (tx) => {
      const found = await tx.query<{
        id: string;
        person_id: string;
        event_id: string;
        entry_id: string | null;
        requirement_set_id: string | null;
      }>(
        `SELECT d.id, d.person_id, d.event_id, d.requirement_set_id,
                COALESCE(a.entry_id, d.entry_id) AS entry_id
           FROM restricted.evidence_document d
           LEFT JOIN restricted.evidence_document_application a
             ON a.document_id = d.id
          WHERE d.id = $1
          LIMIT 1`,
        [evidenceId],
      );
      return found.rows[0];
    });
    if (!row?.entry_id) refuse('EVIDENCE_NOT_FOUND', 'evidence.not_found');
    return { ...row, entry_id: row.entry_id };
  }

  private async latestUploadId(db: Queryable, documentId: string): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM restricted.evidence_upload
        WHERE document_id = $1
        ORDER BY version_no DESC LIMIT 1`,
      [documentId],
    );
    const id = rows[0]?.id;
    if (!id) refuse('EVIDENCE_NOT_FOUND', 'evidence.upload.not_found');
    return id;
  }

  private async loadItem(
    db: Queryable,
    doc: { id: string; person_id: string; entry_id: string },
  ): Promise<RestrictedEvidence> {
    const requirements = await this.requirementMap(db, [doc.id]);
    const items = await this.loadItems(db, {
      entryId: doc.entry_id,
      personId: doc.person_id,
      actorId: doc.person_id,
      requirements,
      documentId: doc.id,
      logAccess: false,
    });
    const item = items[0];
    if (!item) refuse('EVIDENCE_NOT_FOUND', 'evidence.not_found');
    return item;
  }

  /**
   * The entry follows its evidence: an approval unlocks checkout, a rejection closes it again.
   * Only this service can read restricted statuses, so it passes them to the shared recompute.
   */
  private async persistGate(
    db: Queryable,
    doc: { entry_id: string; person_id: string },
  ): Promise<ReturnType<typeof entryGate>> {
    const items = await this.loadItems(db, {
      entryId: doc.entry_id,
      personId: doc.person_id,
      actorId: doc.person_id,
      requirements: await this.requirementMap(db),
      logAccess: false,
    });
    await recomputeEntryEvidenceGate(
      db,
      doc.entry_id,
      items.map((item) => item.status),
    );
    return entryGate(items);
  }

  private async gateForEntry(
    db: Queryable,
    entryId: string,
    personId: string,
  ): Promise<ReturnType<typeof entryGate>> {
    const items = await this.loadItems(db, {
      entryId,
      personId,
      actorId: personId,
      requirements: await this.requirementMap(db),
      logAccess: false,
    });
    return entryGate(items);
  }

  private async requirementMap(db: Queryable, _documentIds?: string[]): Promise<RequirementRow[]> {
    const { rows } = await db.query<RequirementRow>(
      `SELECT rs.id AS requirement_set_id,
              rs.document_kind,
              rv.id AS requirement_version_id,
              rv.message_key,
              rv.requiredness
         FROM core.evidence_requirement_set rs
         JOIN core.evidence_requirement_version rv
           ON rv.requirement_set_id = rs.id AND rv.status = 'active'
        WHERE rs.classification = 'restricted'`,
    );
    return rows;
  }

  private async loadQueue(db: Queryable): Promise<RestrictedEvidence[]> {
    const requirements = await this.requirementMap(db);
    const rows = await this.withRestricted(async (tx) => {
      const found = await tx.query<DocumentRow>(
        this.documentSql(`latest.decision IS NULL OR latest.decision = 'under_review'`),
        [],
      );
      return found.rows.filter((row) => row.has_upload);
    });
    return this.toItems(db, rows, requirements);
  }

  private async loadItems(
    db: Queryable,
    args: {
      entryId: string;
      personId: string;
      actorId: string;
      requirements: RequirementRow[];
      documentId?: string;
      logAccess: boolean;
      purpose?: string;
    },
  ): Promise<RestrictedEvidence[]> {
    const filters = ['a.entry_id = $1', 'd.person_id = $2'];
    const params: unknown[] = [args.entryId, args.personId];
    if (args.documentId) {
      params.push(args.documentId);
      filters.push(`d.id = $${params.length}`);
    }
    const rows = await this.withRestricted(async (tx) => {
      const found = await tx.query<DocumentRow>(this.documentSql(filters.join(' AND ')), params);
      if (args.logAccess && found.rows.length > 0) {
        await tx.query(
          `INSERT INTO restricted.access_log (document_id, actor_id, action, upload_id, purpose)
           SELECT d.id, $3, 'view', u.id, $4
             FROM restricted.evidence_document d
             JOIN restricted.evidence_document_application a ON a.document_id = d.id
             LEFT JOIN LATERAL (
               SELECT u2.id FROM restricted.evidence_upload u2
                WHERE u2.document_id = d.id
                ORDER BY u2.version_no DESC LIMIT 1
             ) u ON true
            WHERE a.entry_id = $1 AND d.person_id = $2`,
          [
            args.entryId,
            args.personId,
            args.actorId,
            args.purpose ?? 'GET /v1/restricted-evidence',
          ],
        );
      }
      return found.rows;
    });
    return this.toItems(db, rows, args.requirements);
  }

  private async toItems(
    db: Queryable,
    rows: DocumentRow[],
    requirements: RequirementRow[],
  ): Promise<RestrictedEvidence[]> {
    const entryIds = [
      ...new Set(rows.map((row) => row.entry_id).filter((id): id is string => Boolean(id))),
    ];
    const products = new Map<string, string>();
    // A reviewer's work list needs the athlete's name and what the document is for. Names and
    // sports are ordinary data on the core side — nothing restricted crosses the boundary here.
    const labels = new Map<string, { sportName: string; productName: string }>();
    if (entryIds.length > 0) {
      const found = await db.query<{
        id: string;
        sport_entry_product_id: string;
        sport_name: string;
        product_name: string;
      }>(
        `SELECT entry.id, entry.sport_entry_product_id,
                sport.name AS sport_name, product.name AS product_name
           FROM core.registration_entry entry
           JOIN core.sport_entry_product product ON product.id = entry.sport_entry_product_id
           JOIN core.sport sport ON sport.id = product.sport_id
          WHERE entry.id = ANY($1::uuid[])`,
        [entryIds],
      );
      for (const row of found.rows) {
        products.set(row.id, row.sport_entry_product_id);
        labels.set(row.id, { sportName: row.sport_name, productName: row.product_name });
      }
    }
    const athletes = await personNames(
      db,
      rows.map((row) => row.person_id),
    );
    const reviewers = await personNames(
      db,
      rows.map((row) => row.reviewer_id),
    );
    return rows.map((row) => {
      const item = this.toItem(row, requirements, products.get(row.entry_id ?? '') ?? '', reviewers);
      const label = labels.get(row.entry_id ?? '');
      const athleteName = athletes.get(row.person_id);
      return {
        ...item,
        ...(athleteName ? { athleteName } : {}),
        ...(label ? { sportName: label.sportName, productName: label.productName } : {}),
      };
    });
  }

  private documentSql(where: string): string {
    return `
      SELECT d.id,
             d.person_id,
             d.event_id,
             d.kind,
             d.requirement_set_id,
             a.entry_id,
             u.original_file_name,
             u.mime_type,
             u.size_bytes,
             u.uploaded_at,
             latest.occurred_at AS reviewed_at,
             latest.reason_key,
             latest.reviewer_id,
             latest.decision,
             review_started.occurred_at AS review_started_at,
             u.id AS upload_id,
             (u.id IS NOT NULL) AS has_upload,
             (waiver.waived IS NOT NULL) AS waived
        FROM restricted.evidence_document d
        JOIN restricted.evidence_document_application a ON a.document_id = d.id
        LEFT JOIN LATERAL (
          SELECT u2.* FROM restricted.evidence_upload u2
           WHERE u2.document_id = d.id
           ORDER BY u2.version_no DESC LIMIT 1
        ) u ON true
        LEFT JOIN LATERAL (
          SELECT r.* FROM restricted.evidence_review r
           WHERE r.upload_id = u.id
           ORDER BY r.occurred_at DESC LIMIT 1
        ) latest ON true
        LEFT JOIN LATERAL (
          SELECT r.occurred_at FROM restricted.evidence_review r
           WHERE r.upload_id = u.id AND r.decision = 'under_review'
           ORDER BY r.occurred_at ASC LIMIT 1
        ) review_started ON true
        LEFT JOIN LATERAL (
          SELECT 1 AS waived
            FROM restricted.evidence_waiver w
           WHERE w.person_id = d.person_id
             AND w.requirement_set_id = d.requirement_set_id
             AND w.status = 'approved'
             AND (w.entry_id IS NULL OR w.entry_id = a.entry_id)
             AND (w.valid_until IS NULL OR w.valid_until >= CURRENT_DATE)
           LIMIT 1
        ) waiver ON true
       WHERE ${where}
       ORDER BY d.created_at, d.id`;
  }

  private toItem(
    row: DocumentRow,
    requirements: RequirementRow[],
    sportEntryProductId: string,
    reviewers: ReadonlyMap<string, string>,
  ): RestrictedEvidence {
    const req = requirements.find(
      (candidate) => candidate.requirement_set_id === row.requirement_set_id,
    );
    const status = statusFrom(row.decision, row.has_upload, row.waived);
    const reviewerDisplayName = row.reviewer_id ? reviewers.get(row.reviewer_id) : undefined;
    return {
      id: row.id,
      registrationEntryId: row.entry_id ?? '',
      sportEntryProductId,
      athleteId: row.person_id,
      type: restrictedType(row.kind),
      label: restrictedLabel(row.kind, req?.message_key ?? row.kind),
      required: true,
      status,
      accessClassification: 'restricted',
      accessPolicy: ACCESS_POLICY_RESTRICTED,
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
    };
  }
}
