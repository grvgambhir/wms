import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { Queryable } from '../common/idempotency/idempotency.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { pool } from '../db/pool';
import { refuse } from './refuse';

export type PreRegistrationStatus = 'unclaimed' | 'claimed';

export type PreRegistrationRecordView = {
  id: string;
  reference: string;
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: string;
  nationalityCountryCode: string;
  intendedSports: string[];
  sourceList: string;
  status: PreRegistrationStatus;
  migratedAt: string;
  claimedAt?: string;
};

export type PreRegistrationPreviewView = {
  id: string;
  reference: string;
  maskedName: string;
  maskedEmail: string;
  birthYear: number;
  nationalityCountryCode: string;
  intendedSports: string[];
  status: PreRegistrationStatus;
};

export type PreRegistrationLookupView =
  | { outcome: 'found'; preview: PreRegistrationPreviewView }
  | { outcome: 'already_claimed'; preview: PreRegistrationPreviewView }
  | { outcome: 'not_found' };

export type ClaimPreRegistrationView = {
  record: PreRegistrationRecordView;
  alreadyClaimed: boolean;
};

interface PreRegistrationRow {
  id: string;
  reference: string;
  first_name: string;
  last_name: string;
  email: string;
  date_of_birth: string;
  nationality: string | null;
  intended_sports: string[];
  source_list: string;
  status: string;
  migrated_at: Date | string;
  claimed_at: Date | string | null;
  claimed_by: string | null;
}

const recordIdSchema = z.string().uuid();

function headerKey(headers: { [key: string]: string | string[] | undefined }): string {
  const raw = headers['idempotency-key'];
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0].trim();
  return '';
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** "Daniel Harper" -> "D••• H•••" — recognisable, not harvestable. */
function maskName(firstName: string, lastName: string): string {
  const mask = (part: string) => (part ? `${part[0]}•••` : '');
  return [mask(firstName), mask(lastName)].filter(Boolean).join(' ');
}

/** "daniel.harper@example.com" -> "d••••@example.com". */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  // `local` is only `string | undefined` to the type checker (noUncheckedIndexedAccess);
  // a non-empty split always yields index 0. Narrow it rather than asserting.
  if (!domain || local === undefined) return '•••';
  return `${local[0] ?? ''}••••@${domain}`;
}

function asStatus(value: string): PreRegistrationStatus {
  return value === 'claimed' ? 'claimed' : 'unclaimed';
}

function toRecord(row: PreRegistrationRow): PreRegistrationRecordView {
  return {
    id: row.id,
    reference: row.reference,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    dateOfBirth: row.date_of_birth,
    nationalityCountryCode: row.nationality ?? '',
    intendedSports: [...(row.intended_sports ?? [])],
    sourceList: row.source_list,
    status: asStatus(row.status),
    migratedAt: iso(row.migrated_at),
    ...(row.claimed_at ? { claimedAt: iso(row.claimed_at) } : {}),
  };
}

function toPreview(row: PreRegistrationRow): PreRegistrationPreviewView {
  return {
    id: row.id,
    reference: row.reference,
    maskedName: maskName(row.first_name, row.last_name),
    maskedEmail: maskEmail(row.email),
    birthYear: Number(row.date_of_birth.slice(0, 4)),
    nationalityCountryCode: row.nationality ?? '',
    intendedSports: [...(row.intended_sports ?? [])],
    status: asStatus(row.status),
  };
}

const SELECT_COLUMNS = `
  id,
  reference,
  first_name,
  last_name,
  email::text AS email,
  date_of_birth::text AS date_of_birth,
  NULLIF(BTRIM(nationality), '') AS nationality,
  intended_sports,
  source_list,
  status,
  migrated_at,
  claimed_at,
  claimed_by::text AS claimed_by
`;

@Injectable()
export class PreRegistrationService {
  constructor(@Inject(IdempotencyService) private readonly idempotency: IdempotencyService) {}

  async lookup(query: string | undefined): Promise<PreRegistrationLookupView> {
    const q = (query ?? '').trim();
    if (!q) return { outcome: 'not_found' };

    const { rows } = await pool.query<PreRegistrationRow>(
      `SELECT ${SELECT_COLUMNS}
         FROM core.pre_registration
        WHERE lower(reference) = lower($1)
           OR email = $1::citext
        ORDER BY CASE WHEN lower(reference) = lower($1) THEN 0 ELSE 1 END,
                 CASE WHEN event_id = core.current_event_id() THEN 0 ELSE 1 END,
                 migrated_at ASC
        LIMIT 1`,
      [q],
    );
    const row = rows[0];
    if (!row) return { outcome: 'not_found' };
    const preview = toPreview(row);
    return row.status === 'claimed'
      ? { outcome: 'already_claimed', preview }
      : { outcome: 'found', preview };
  }

  async claim(args: {
    personId: string;
    recordId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
  }): Promise<ClaimPreRegistrationView> {
    const parsedId = recordIdSchema.safeParse(args.recordId);
    if (!parsedId.success) refuse('PRE_REGISTRATION_NOT_FOUND', 'pre_registration.not_found');
    const recordId = parsedId.data;

    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: 'POST /v1/me/pre-registrations/:id/claim',
        body: { recordId },
        mode: 'local',
      },
      async (tx) => {
        const body = await this.claimIn(tx, args.personId, recordId);
        return { status: 200, body };
      },
    );
    return result.body as ClaimPreRegistrationView;
  }

  /**
   * claimed_by is the token person. Body fields such as personId / claimedBy are
   * never read. A second EOI for the same person is refused by the unique index,
   * not by a pre-check that can race.
   */
  private async claimIn(
    tx: Queryable,
    personId: string,
    recordId: string,
  ): Promise<ClaimPreRegistrationView> {
    const updated = await tx.query<PreRegistrationRow>(
      `UPDATE core.pre_registration
          SET status = 'claimed',
              claimed_by = $2,
              claimed_at = now()
        WHERE id = $1
          AND status = 'unclaimed'
      RETURNING ${SELECT_COLUMNS}`,
      [recordId, personId],
    );
    const won = updated.rows[0];
    if (won) {
      return { record: toRecord(won), alreadyClaimed: false };
    }

    const existing = await this.load(tx, recordId);
    if (!existing) refuse('PRE_REGISTRATION_NOT_FOUND', 'pre_registration.not_found');
    if (existing.claimed_by === personId) {
      return { record: toRecord(existing), alreadyClaimed: true };
    }
    refuse('PRE_REGISTRATION_ALREADY_CLAIMED', 'pre_registration.already_claimed');
  }

  private async load(db: Queryable, recordId: string): Promise<PreRegistrationRow | null> {
    const { rows } = await db.query<PreRegistrationRow>(
      `SELECT ${SELECT_COLUMNS}
         FROM core.pre_registration
        WHERE id = $1`,
      [recordId],
    );
    return rows[0] ?? null;
  }
}
