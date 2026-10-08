import { Inject, Injectable } from '@nestjs/common';
import type {
  AudienceSubject,
  CommsAudienceFilter,
  CommsChannel,
  CommunicationRecord,
  CommunicationsOverview,
  CommunicationsSummary,
  MessageTemplate,
  SendBroadcastInput,
  SendBroadcastResponse,
} from '@wms/domain';
import { audienceFilterFromId, audienceIncludesParticipant } from '@wms/domain';
import type { PaginatedResponse } from '@wms/domain';
import { z } from 'zod';
import { IdempotencyService, type Queryable } from '../common/idempotency/idempotency.service';
import { clampLimit, decodeCursor, encodeCursor } from '../common/pagination/keyset';
import { pool } from '../db/pool';
import { refuse } from '../people/refuse';
import { asIso, headerKey, requireUuid } from './helpers';

const sendBody = z.object({
  templateId: z.string().uuid().optional(),
  subject: z.string().trim().min(1).max(300),
  audienceId: z.string().trim().min(1).max(80),
  channel: z.enum(['email', 'in-app', 'both']),
});

const DEFAULT_AUDIENCES: ReadonlyArray<{
  code: string;
  name_key: string;
  filter: CommsAudienceFilter;
}> = [
  { code: 'all-participants', name_key: 'comms.audience.all_participants', filter: { all: true } },
  { code: 'pending-payment', name_key: 'comms.audience.pending_payment', filter: { entryStatus: 'pending_payment' } },
  { code: 'incomplete-documents', name_key: 'comms.audience.incomplete_documents', filter: { evidenceIncomplete: true } },
  { code: 'confirmed', name_key: 'comms.audience.confirmed', filter: { entryStatus: 'confirmed' } },
  { code: 'tennis', name_key: 'comms.audience.tennis', filter: { sport: 'tennis' } },
  { code: 'rowing', name_key: 'comms.audience.rowing', filter: { sport: 'rowing' } },
];

type AudienceRow = {
  id: string;
  event_id: string;
  code: string;
  name_key: string;
  filter: unknown;
};

type SubjectRow = {
  person_id: string;
  sport_name: string;
  entry_status: string;
  evidence_status: string;
  event_id: string;
};

type TemplateRow = {
  id: string;
  event_id: string;
  code: string;
  channel: string;
  name_key: string;
  version_id: string | null;
  subject_en: string | null;
  body_en: string | null;
  subject_it: string | null;
  body_it: string | null;
};

type BroadcastRow = {
  id: string;
  audience: unknown;
  channel: string;
  subject_snapshot: string | null;
  status: string;
  sent_at: Date | string | null;
  created_at: Date | string;
  template_id: string | null;
  recipient_count: string;
};

export type BroadcastDeliveryView = {
  record: CommunicationRecord;
  deliveries: Array<{
    id: string;
    personId: string;
    status: string;
    attempts: Array<{ result: string; attemptedAt: string; responseKey: string | null }>;
  }>;
};

@Injectable()
export class CommsService {
  constructor(@Inject(IdempotencyService) private readonly idempotency: IdempotencyService) {}

  async getOverview(): Promise<CommunicationsOverview> {
    const templates = await loadTemplates(pool);
    const subjects = await loadSubjects(pool);
    const audiences = await loadAudiences(pool);
    const history = await loadHistory(pool);
    const segments = audiences.map((audience) => ({
      id: audience.code,
      recipientCount: countReached(audience.filter, subjects),
    }));
    return {
      summary: summarize(history, templates.length),
      segments,
      templates,
      history: { items: history, total: history.length },
    };
  }

  async getBroadcast(broadcastId: string): Promise<BroadcastDeliveryView> {
    const id = requireUuid(broadcastId, 'comms.broadcast.invalid');
    const history = await loadHistory(pool);
    const record = history.find((item) => item.id === id);
    if (!record) refuse('BROADCAST_NOT_FOUND', 'comms.broadcast.not_found');
    const { rows: deliveries } = await pool.query<{
      id: string;
      person_id: string;
      status: string;
    }>(`SELECT id, person_id, status FROM core.delivery WHERE broadcast_id = $1`, [id]);
    const { rows: attempts } = await pool.query<{
      delivery_id: string;
      result: string;
      attempted_at: Date | string;
      response_key: string | null;
    }>(
      `SELECT delivery_id, result, attempted_at, response_key
         FROM core.delivery_attempt
        WHERE delivery_id = ANY($1::uuid[])
        ORDER BY attempted_at`,
      [deliveries.map((row) => row.id)],
    );
    return {
      record,
      deliveries: deliveries.map((delivery) => ({
        id: delivery.id,
        personId: delivery.person_id,
        status: delivery.status,
        attempts: attempts
          .filter((attempt) => attempt.delivery_id === delivery.id)
          .map((attempt) => ({
            result: attempt.result,
            attemptedAt: asIso(attempt.attempted_at),
            responseKey: attempt.response_key,
          })),
      })),
    };
  }

  async sendBroadcast(args: {
    actorId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    body: unknown;
  }): Promise<SendBroadcastResponse> {
    const parsed = sendBody.safeParse(args.body);
    if (!parsed.success) refuse('VALIDATION_ERROR', 'comms.broadcast.invalid');
    const input = parsed.data;
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: 'POST /v1/communications/broadcasts',
        body: input,
        mode: 'local',
      },
      async (tx) => {
        const record = await insertBroadcast(tx, args.actorId, input);
        const history = await loadHistory(tx);
        const templates = await loadTemplates(tx);
        return {
          status: 200,
          body: {
            record,
            summary: summarize(history, templates.length),
          } satisfies SendBroadcastResponse,
        };
      },
    );
    return result.body as SendBroadcastResponse;
  }

  /**
   * The caller's in-app inbox. Identity is the SQL `person_id = $1` predicate —
   * never an athlete id from the path. Audience membership is still
   * `audienceIncludesParticipant()` in JS; do not copy that rule into SQL.
   */
  async listInbox(
    personId: string,
    cursor?: string,
    limit?: string,
  ): Promise<PaginatedResponse<CommunicationRecord>> {
    const subjects = await loadSubjectsForPerson(pool, personId);
    const eventIds = [...new Set(subjects.map((row) => row.event_id))];
    if (eventIds.length === 0) {
      return { items: [], total: 0 };
    }
    const history = await loadHistoryForEvents(pool, eventIds);
    const matching = history.filter((record) =>
      subjects.some((row) => audienceIncludesParticipant(record.audienceId, subjectOf(row))),
    );
    return pageInbox(matching, cursor, limit);
  }
}

function toDbChannel(channel: CommsChannel): 'email' | 'inapp' {
  return channel === 'in-app' ? 'inapp' : 'email';
}

function fromDbChannel(channel: string, original?: string): CommsChannel {
  if (original === 'email' || original === 'in-app' || original === 'both') return original;
  return channel === 'inapp' ? 'in-app' : 'email';
}

function asFilter(value: unknown, code: string): CommsAudienceFilter {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    if (row.all === true || row.sport || row.entryStatus || row.evidenceIncomplete) {
      return {
        ...(row.all === true ? { all: true } : {}),
        ...(typeof row.sport === 'string' ? { sport: row.sport } : {}),
        ...(typeof row.entryStatus === 'string' ? { entryStatus: row.entryStatus } : {}),
        ...(typeof row.evidenceIncomplete === 'boolean'
          ? { evidenceIncomplete: row.evidenceIncomplete }
          : {}),
      };
    }
    if (typeof row.segment === 'string') return audienceFilterFromId(row.segment);
    if (typeof row.audienceId === 'string') return audienceFilterFromId(row.audienceId);
  }
  return audienceFilterFromId(code);
}

function titleFromCode(code: string): string {
  return code
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function defaultAudienceFromCode(code: string): string {
  if (code.includes('payment')) return 'pending-payment';
  if (code.includes('document')) return 'incomplete-documents';
  if (code.includes('welcome') || code.includes('confirm')) return 'confirmed';
  return 'all-participants';
}

function subjectOf(row: SubjectRow): AudienceSubject {
  return {
    sportName: row.sport_name,
    entryStatus: row.entry_status,
    evidenceStatus: row.evidence_status,
  };
}

function countReached(filter: CommsAudienceFilter, subjects: SubjectRow[]): number {
  const seen = new Set<string>();
  for (const row of subjects) {
    if (seen.has(row.person_id)) continue;
    if (audienceIncludesParticipant(filter, subjectOf(row))) seen.add(row.person_id);
  }
  return seen.size;
}

function reachedPeople(filter: CommsAudienceFilter, subjects: SubjectRow[]): SubjectRow[] {
  const first = new Map<string, SubjectRow>();
  for (const row of subjects) {
    if (first.has(row.person_id)) continue;
    const entries = subjects.filter((item) => item.person_id === row.person_id);
    if (entries.some((item) => audienceIncludesParticipant(filter, subjectOf(item)))) {
      first.set(row.person_id, row);
    }
  }
  return [...first.values()];
}

/** Identity-scoped subjects for the inbox. Tests import this so the WHERE is asserted in SQL. */
export const INBOX_SUBJECTS_SQL = `
SELECT ap.person_id,
       s.name AS sport_name,
       e.status AS entry_status,
       e.evidence_status,
       e.event_id
  FROM core.registration_entry e
  JOIN core.athlete_profile ap ON ap.id = e.athlete_profile_id
  JOIN core.sport_entry_product sep ON sep.id = e.sport_entry_product_id
  JOIN core.sport s ON s.id = sep.sport_id
 WHERE ap.person_id = $1
   AND e.status NOT IN ('cancelled','withdrawn','substituted')
`;

async function loadSubjects(db: Queryable): Promise<SubjectRow[]> {
  const { rows } = await db.query<SubjectRow>(
    `SELECT ap.person_id,
            s.name AS sport_name,
            e.status AS entry_status,
            e.evidence_status,
            e.event_id
       FROM core.registration_entry e
       JOIN core.athlete_profile ap ON ap.id = e.athlete_profile_id
       JOIN core.sport_entry_product sep ON sep.id = e.sport_entry_product_id
       JOIN core.sport s ON s.id = sep.sport_id
      WHERE e.status NOT IN ('cancelled','withdrawn','substituted')`,
  );
  return rows;
}

async function loadSubjectsForPerson(db: Queryable, personId: string): Promise<SubjectRow[]> {
  const { rows } = await db.query<SubjectRow>(INBOX_SUBJECTS_SQL, [personId]);
  return rows;
}

async function loadAudiences(db: Queryable): Promise<Array<{ code: string; filter: CommsAudienceFilter }>> {
  const { rows } = await db.query<AudienceRow>(
    `SELECT DISTINCT ON (code) id, event_id, code, name_key, filter
       FROM core.comms_audience
      ORDER BY code, event_id`,
  );
  if (rows.length === 0) {
    return DEFAULT_AUDIENCES.map((item) => ({ code: item.code, filter: item.filter }));
  }
  return rows.map((row) => ({ code: row.code, filter: asFilter(row.filter, row.code) }));
}

async function loadAudience(
  db: Queryable,
  code: string,
): Promise<{ eventId: string | null; filter: CommsAudienceFilter }> {
  const { rows } = await db.query<AudienceRow>(
    `SELECT id, event_id, code, name_key, filter
       FROM core.comms_audience
      WHERE code = $1
      ORDER BY event_id
      LIMIT 1`,
    [code],
  );
  const row = rows[0];
  if (row) return { eventId: row.event_id, filter: asFilter(row.filter, row.code) };
  const fallback = DEFAULT_AUDIENCES.find((item) => item.code === code);
  return {
    eventId: null,
    filter: fallback?.filter ?? audienceFilterFromId(code),
  };
}

async function loadTemplates(db: Queryable): Promise<MessageTemplate[]> {
  const { rows } = await db.query<TemplateRow>(
    `SELECT t.id, t.event_id, t.code, t.channel, t.name_key,
            tv.id AS version_id,
            en.subject AS subject_en, en.body AS body_en,
            it.subject AS subject_it, it.body AS body_it
       FROM core.comms_template t
       LEFT JOIN core.comms_template_version tv
         ON tv.template_id = t.id AND tv.status = 'approved'
       LEFT JOIN core.comms_template_copy en
         ON en.template_version_id = tv.id AND en.locale = 'en'
       LEFT JOIN core.comms_template_copy it
         ON it.template_version_id = tv.id AND it.locale = 'it'
      ORDER BY t.created_at`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: titleFromCode(row.code),
    subjectEn: row.subject_en ?? '',
    bodyEn: row.body_en ?? '',
    subjectIt: row.subject_it ?? '',
    bodyIt: row.body_it ?? '',
    defaultAudienceId: defaultAudienceFromCode(row.code),
    channel: fromDbChannel(row.channel),
  }));
}

function recordFromBroadcast(row: BroadcastRow): CommunicationRecord {
  const audience = asAudienceMeta(row.audience);
  return {
    id: row.id,
    subject: row.subject_snapshot ?? '',
    audienceId: audience.audienceId,
    channel: fromDbChannel(row.channel, audience.channel),
    recipientCount: Number(row.recipient_count),
    status: row.status === 'sent' ? 'sent' : row.status === 'sending' ? 'sending' : 'draft',
    sentAt: asIso(row.sent_at ?? row.created_at),
    ...(row.template_id ? { templateId: row.template_id } : {}),
  };
}

async function loadHistory(db: Queryable): Promise<CommunicationRecord[]> {
  const { rows } = await db.query<BroadcastRow>(
    `SELECT b.id, b.audience, b.channel, b.subject_snapshot, b.status, b.sent_at, b.created_at,
            b.template_id, COUNT(d.id)::text AS recipient_count
       FROM core.broadcast b
       LEFT JOIN core.delivery d ON d.broadcast_id = b.id
      GROUP BY b.id
      ORDER BY COALESCE(b.sent_at, b.created_at) DESC`,
  );
  return rows.map(recordFromBroadcast);
}

async function loadHistoryForEvents(db: Queryable, eventIds: string[]): Promise<CommunicationRecord[]> {
  const { rows } = await db.query<BroadcastRow>(
    `SELECT b.id, b.audience, b.channel, b.subject_snapshot, b.status, b.sent_at, b.created_at,
            b.template_id, COUNT(d.id)::text AS recipient_count
       FROM core.broadcast b
       LEFT JOIN core.delivery d ON d.broadcast_id = b.id
      WHERE b.status = 'sent'
        AND b.event_id = ANY($1::uuid[])
      GROUP BY b.id
      ORDER BY COALESCE(b.sent_at, b.created_at) DESC, b.id DESC`,
    [eventIds],
  );
  return rows.map(recordFromBroadcast);
}

function pageInbox(
  records: CommunicationRecord[],
  cursor: string | undefined,
  limit: string | undefined,
): PaginatedResponse<CommunicationRecord> {
  const decoded = decodeCursor(cursor);
  const cap = clampLimit(limit);
  const sorted = [...records].sort((a, b) => {
    const byTime = b.sentAt.localeCompare(a.sentAt);
    return byTime !== 0 ? byTime : b.id.localeCompare(a.id);
  });
  const after = decoded
    ? sorted.filter(
        (row) => row.sentAt < decoded.at || (row.sentAt === decoded.at && row.id < decoded.id),
      )
    : sorted;
  const items = after.slice(0, cap);
  const last = items[items.length - 1];
  return {
    items,
    total: records.length,
    ...(after.length > cap && last ? { cursor: encodeCursor({ at: last.sentAt, id: last.id }) } : {}),
  };
}

function asAudienceMeta(value: unknown): { audienceId: string; channel?: CommsChannel } {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    const audienceId =
      (typeof row.audienceId === 'string' && row.audienceId) ||
      (typeof row.segment === 'string' && row.segment) ||
      'all-participants';
    const channel =
      row.channel === 'email' || row.channel === 'in-app' || row.channel === 'both'
        ? row.channel
        : undefined;
    return { audienceId, channel };
  }
  return { audienceId: 'all-participants' };
}

function summarize(history: CommunicationRecord[], templateCount: number): CommunicationsSummary {
  return {
    sentCount: history.length,
    totalRecipients: history.reduce((sum, item) => sum + item.recipientCount, 0),
    templateCount,
  };
}

async function insertBroadcast(
  tx: Queryable,
  actorId: string,
  input: Omit<SendBroadcastInput, 'idempotencyKey'>,
): Promise<CommunicationRecord> {
  const audience = await loadAudience(tx, input.audienceId);
  const subjects = await loadSubjects(tx);
  const recipients = reachedPeople(audience.filter, subjects);
  const dbChannel = toDbChannel(input.channel);
  let templateId: string | null = input.templateId ?? null;
  let versionId: string | null = null;
  let body = input.subject;
  let eventId = audience.eventId ?? recipients[0]?.event_id ?? null;

  if (templateId) {
    const { rows } = await tx.query<{
      event_id: string;
      channel: string;
      version_id: string | null;
      body: string | null;
    }>(
      `SELECT t.event_id, t.channel, tv.id AS version_id, c.body
         FROM core.comms_template t
         LEFT JOIN core.comms_template_version tv
           ON tv.template_id = t.id AND tv.status = 'approved'
         LEFT JOIN core.comms_template_copy c
           ON c.template_version_id = tv.id AND c.locale = 'en'
        WHERE t.id = $1`,
      [templateId],
    );
    const template = rows[0];
    if (!template) refuse('TEMPLATE_NOT_FOUND', 'comms.template.not_found');
    eventId = template.event_id;
    body = template.body ?? input.subject;
    if (template.channel === dbChannel && template.version_id) {
      versionId = template.version_id;
    } else {
      templateId = input.templateId ?? null;
      versionId = null;
    }
  }

  if (!eventId) refuse('EVENT_UNAVAILABLE', 'profile.event.unavailable');

  const inserted = await tx.query<{ id: string; sent_at: Date | string }>(
    `INSERT INTO core.broadcast
       (event_id, template_id, template_version_id, channel, classification, audience,
        locale, subject_snapshot, body_snapshot, bindings, status, sent_by, sent_at)
     VALUES ($1, $2, $3, $4, 'transactional', $5::jsonb, 'en', $6, $7, '{}'::jsonb,
             'sent', $8, now())
     RETURNING id, sent_at`,
    [
      eventId,
      versionId ? templateId : null,
      versionId,
      dbChannel,
      JSON.stringify({
        audienceId: input.audienceId,
        filter: audience.filter,
        channel: input.channel,
      }),
      input.subject,
      body,
      actorId,
    ],
  );
  const broadcastId = inserted.rows[0]!.id;
  let delivered = 0;
  for (const recipient of recipients) {
    await tx.query('SAVEPOINT delivery_one');
    try {
      const delivery = await tx.query<{ id: string }>(
        `INSERT INTO core.delivery (broadcast_id, person_id, status)
         VALUES ($1, $2, 'sent')
         RETURNING id`,
        [broadcastId, recipient.person_id],
      );
      await tx.query(
        `INSERT INTO core.delivery_attempt (delivery_id, provider, result, response_key)
         VALUES ($1, 'unspecified', 'accepted', 'comms.delivery.accepted')`,
        [delivery.rows[0]!.id],
      );
      await tx.query('RELEASE SAVEPOINT delivery_one');
      delivered += 1;
    } catch (err) {
      await tx.query('ROLLBACK TO SAVEPOINT delivery_one');
      if (!isSuppressed(err)) throw err;
    }
  }

  return {
    id: broadcastId,
    subject: input.subject,
    audienceId: input.audienceId,
    channel: input.channel,
    recipientCount: delivered,
    status: 'sent',
    sentAt: asIso(inserted.rows[0]!.sent_at),
    ...(input.templateId ? { templateId: input.templateId } : {}),
  };
}

function isSuppressed(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: string; message?: string };
  return e.code === '23514' && /comms\.suppressed/.test(e.message ?? '');
}
