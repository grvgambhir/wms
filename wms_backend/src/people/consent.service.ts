import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { Queryable } from '../common/idempotency/idempotency.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { pool } from '../db/pool';
import { refuse } from './refuse';

export const CONSENT_KINDS = [
  'terms_and_conditions',
  'privacy_policy',
  'eligibility_medical_evidence',
  'photo_media_accreditation',
  'marketing_communications',
] as const;

export type ConsentKind = (typeof CONSENT_KINDS)[number];

type ConsentCatalogueEntry = {
  kind: ConsentKind;
  required: boolean;
  sensitive: boolean;
  version: string;
};

/**
 * Required vs optional is not the participant's choice. Matches the P06 mock:
 * T&C and privacy required; eligibility-medical required + sensitive; photo and marketing optional.
 */
export const CONSENT_CATALOGUE: readonly ConsentCatalogueEntry[] = [
  { kind: 'terms_and_conditions', required: true, sensitive: false, version: 'T&C v1.2' },
  { kind: 'privacy_policy', required: true, sensitive: false, version: 'Privacy v3.0' },
  {
    kind: 'eligibility_medical_evidence',
    required: true,
    sensitive: true,
    version: 'Evidence processing v1.0',
  },
  {
    kind: 'photo_media_accreditation',
    required: false,
    sensitive: false,
    version: 'Media & accreditation v1.1',
  },
  { kind: 'marketing_communications', required: false, sensitive: false, version: 'Marketing v2.0' },
];

export type ConsentRecordView = {
  id: string;
  participantId: string;
  kind: ConsentKind;
  required: boolean;
  sensitive: boolean;
  status: 'granted' | 'withdrawn';
  policyVersion: string;
  updatedAt: string;
  grantedAt?: string;
  withdrawnAt?: string;
};

export type ConsentListView = {
  items: ConsentRecordView[];
  total: number;
};

const consentWriteSchema = z.object({
  kind: z.enum(CONSENT_KINDS),
  granted: z.boolean(),
  version: z.string().trim().min(1).max(100).optional(),
});

interface ConsentRow {
  id: string;
  kind: string;
  granted: boolean;
  version: string;
  occurred_at: Date | string;
}

function headerKey(headers: { [key: string]: string | string[] | undefined }): string {
  const raw = headers['idempotency-key'];
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0].trim();
  return '';
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isKind(value: string): value is ConsentKind {
  return (CONSENT_KINDS as readonly string[]).includes(value);
}

@Injectable()
export class ConsentService {
  constructor(@Inject(IdempotencyService) private readonly idempotency: IdempotencyService) {}

  async list(personId: string): Promise<ConsentListView> {
    return this.listFor(pool, personId);
  }

  async write(args: {
    personId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    body: unknown;
  }): Promise<ConsentRecordView> {
    const parsed = consentWriteSchema.safeParse(args.body ?? {});
    if (!parsed.success) refuse('VALIDATION_ERROR', 'consent.invalid');
    const kind = parsed.data.kind;
    const granted = parsed.data.granted;
    const catalogue = CONSENT_CATALOGUE.find((entry) => entry.kind === kind);
    if (!catalogue) refuse('VALIDATION_ERROR', 'consent.invalid');
    const version = parsed.data.version ?? catalogue.version;

    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: 'POST /v1/me/consents',
        body: { kind, granted, version },
        mode: 'local',
      },
      async (tx) => {
        const history = await this.rowsForKind(tx, args.personId, kind);
        const latest = history[0];
        if (latest && latest.granted === granted && latest.version === version) {
          const items = await this.listFor(tx, args.personId);
          const record = items.items.find((item) => item.kind === kind);
          if (!record) refuse('CONSENT_NOT_FOUND', 'consent.not_found');
          return { status: 200, body: record };
        }

        const event = await tx.query<{ id: string | null }>(
          `SELECT core.current_event_id() AS id`,
        );
        await tx.query(
          `INSERT INTO core.consent (person_id, event_id, kind, granted, version, source)
           VALUES ($1, $2, $3, $4, $5, 'participant')`,
          [args.personId, event.rows[0]?.id ?? null, kind, granted, version],
        );
        const items = await this.listFor(tx, args.personId);
        const record = items.items.find((item) => item.kind === kind);
        if (!record) refuse('CONSENT_NOT_FOUND', 'consent.not_found');
        return { status: 200, body: record };
      },
    );
    return result.body as ConsentRecordView;
  }

  private async listFor(db: Queryable, personId: string): Promise<ConsentListView> {
    const { rows } = await db.query<ConsentRow>(
      `SELECT id, kind, granted, version, occurred_at
         FROM core.consent
        WHERE person_id = $1
          AND kind = ANY($2::text[])
        ORDER BY occurred_at DESC`,
      [personId, [...CONSENT_KINDS]],
    );
    const byKind = new Map<ConsentKind, ConsentRow[]>();
    for (const row of rows) {
      if (!isKind(row.kind)) continue;
      const list = byKind.get(row.kind) ?? [];
      list.push(row);
      byKind.set(row.kind, list);
    }
    const items = CONSENT_CATALOGUE.map((entry) =>
      this.view(personId, entry, byKind.get(entry.kind) ?? []),
    );
    return { items, total: items.length };
  }

  private async rowsForKind(
    tx: Queryable,
    personId: string,
    kind: ConsentKind,
  ): Promise<ConsentRow[]> {
    const { rows } = await tx.query<ConsentRow>(
      `SELECT id, kind, granted, version, occurred_at
         FROM core.consent
        WHERE person_id = $1 AND kind = $2
        ORDER BY occurred_at DESC`,
      [personId, kind],
    );
    return rows;
  }

  private view(
    personId: string,
    entry: ConsentCatalogueEntry,
    history: ConsentRow[],
  ): ConsentRecordView {
    const latest = history[0];
    const lastGrant = history.find((row) => row.granted);
    const lastWithdraw = history.find((row) => !row.granted);
    const granted = latest?.granted === true;
    return {
      id: entry.kind,
      participantId: personId,
      kind: entry.kind,
      required: entry.required,
      sensitive: entry.sensitive,
      status: granted ? 'granted' : 'withdrawn',
      policyVersion: latest?.version ?? entry.version,
      updatedAt: latest ? iso(latest.occurred_at) : new Date(0).toISOString(),
      ...(lastGrant ? { grantedAt: iso(lastGrant.occurred_at) } : {}),
      ...(granted ? {} : lastWithdraw ? { withdrawnAt: iso(lastWithdraw.occurred_at) } : {}),
    };
  }
}
