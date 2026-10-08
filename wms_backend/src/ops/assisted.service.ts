import { Inject, Injectable } from '@nestjs/common';
import type {
  AssistedConsentMethod,
  AssistedMutationResponse,
  AssistedParticipant,
  AssistedRegistrationOverview,
  AssistedRegistrationSession,
  AssistedRegistrationStatus,
  PerformProxyActionInput,
  ProxyAuditEntry,
  ProxyConsentRecord,
  RecordProxyConsentInput,
} from '@wms/domain';
import { z } from 'zod';
import { IdempotencyService, type Queryable } from '../common/idempotency/idempotency.service';
import { pool } from '../db/pool';
import { refuse } from '../people/refuse';
import { asIso, headerKey, personName, requireUuid } from './helpers';

const consentBody = z.object({
  participantId: z.string().uuid(),
  operatorId: z.string().uuid().optional(),
  method: z.enum(['phone', 'in_person', 'email']),
});

const actionBody = z.object({
  participantId: z.string().uuid(),
  operatorId: z.string().uuid().optional(),
  action: z.enum(['registration_started', 'registration_submitted']),
});

type SessionRow = {
  id: string;
  participant_id: string;
  operator_id: string;
  consent_id: string | null;
  status: string;
  updated_at: Date | string;
  participant_given: string;
  participant_family: string;
  consent_reference: string | null;
  consent_method: string | null;
  consent_captured_by: string | null;
  consent_captured_at: Date | string | null;
  consent_operator_given: string | null;
  consent_operator_family: string | null;
};

@Injectable()
export class AssistedService {
  constructor(@Inject(IdempotencyService) private readonly idempotency: IdempotencyService) {}

  async getOverview(actorId: string): Promise<AssistedRegistrationOverview> {
    const operatorName = await personName(pool, actorId);
    const participants = await loadParticipants(pool);
    const sessions = await loadSessions(pool);
    const auditTrail = await loadAudit(pool);
    return {
      operator: { id: actorId, name: operatorName },
      participants: { items: participants, total: participants.length },
      sessions: { items: sessions, total: sessions.length },
      auditTrail: { items: auditTrail, total: auditTrail.length },
    };
  }

  async recordConsent(args: {
    actorId: string;
    actorRole: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    body: unknown;
  }): Promise<AssistedMutationResponse> {
    const parsed = consentBody.safeParse(args.body);
    if (!parsed.success) refuse('VALIDATION_ERROR', 'assisted.consent.invalid');
    const input = parsed.data;
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: 'POST /v1/assisted-registration/consents',
        body: { participantId: input.participantId, method: input.method },
        mode: 'local',
      },
      async (tx) => {
        const body = await writeConsent(tx, {
          actorId: args.actorId,
          actorRole: args.actorRole,
          participantId: input.participantId,
          method: input.method,
        });
        return { status: 200, body };
      },
    );
    return result.body as AssistedMutationResponse;
  }

  async performProxyAction(args: {
    actorId: string;
    actorRole: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    body: unknown;
  }): Promise<AssistedMutationResponse> {
    const parsed = actionBody.safeParse(args.body);
    if (!parsed.success) refuse('VALIDATION_ERROR', 'assisted.action.invalid');
    const input = parsed.data;
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: 'POST /v1/assisted-registration/actions',
        body: { participantId: input.participantId, action: input.action },
        mode: 'local',
      },
      async (tx) => {
        const body = await writeAction(tx, {
          actorId: args.actorId,
          actorRole: args.actorRole,
          participantId: input.participantId,
          action: input.action,
        });
        return { status: 200, body };
      },
    );
    return result.body as AssistedMutationResponse;
  }
}

async function loadParticipants(db: Queryable): Promise<AssistedParticipant[]> {
  const { rows } = await db.query<{
    id: string;
    given_name: string;
    family_name: string;
    email: string | null;
    nationality: string | null;
    pre_email: string | null;
  }>(
    `SELECT DISTINCT p.id, p.given_name, p.family_name, p.email, p.nationality,
            pr.email::text AS pre_email
       FROM core.person p
       LEFT JOIN core.person_role r ON r.person_id = p.id AND r.role_code = 'participant'
       LEFT JOIN core.assisted_session s ON s.participant_id = p.id
       LEFT JOIN core.pre_registration pr ON lower(pr.email::text) = lower(p.email::text)
      WHERE r.person_id IS NOT NULL OR s.id IS NOT NULL
      ORDER BY p.family_name, p.given_name`,
  );
  return rows.map((row) => ({
    id: row.id,
    firstName: row.given_name,
    lastName: row.family_name,
    email: row.email ?? '',
    nationalityCountryCode: (row.nationality ?? 'XX').toUpperCase(),
    source: row.pre_email ? 'pre_registration' : 'athlete',
  }));
}

async function loadSessions(db: Queryable): Promise<AssistedRegistrationSession[]> {
  const { rows } = await db.query<SessionRow>(sessionSelect());
  return rows.map(toSession);
}

async function loadSession(db: Queryable, sessionId: string): Promise<AssistedRegistrationSession> {
  const { rows } = await db.query<SessionRow>(`${sessionSelect()} WHERE s.id = $1`, [sessionId]);
  const row = rows[0];
  if (!row) refuse('SESSION_NOT_FOUND', 'assisted.session.not_found');
  return toSession(row);
}

function sessionSelect(): string {
  return `
    SELECT s.id, s.participant_id, s.operator_id, s.consent_id, s.status, s.updated_at,
           p.given_name AS participant_given, p.family_name AS participant_family,
           c.reference AS consent_reference, c.method AS consent_method,
           c.captured_by AS consent_captured_by, c.captured_at AS consent_captured_at,
           op.given_name AS consent_operator_given, op.family_name AS consent_operator_family
      FROM core.assisted_session s
      JOIN core.person p ON p.id = s.participant_id
      LEFT JOIN core.proxy_consent c ON c.id = s.consent_id
      LEFT JOIN core.person op ON op.id = c.captured_by`;
}

function toSession(row: SessionRow): AssistedRegistrationSession {
  const consent: ProxyConsentRecord | undefined =
    row.consent_id && row.consent_reference && row.consent_method && row.consent_captured_by
      ? {
          id: row.consent_id,
          reference: row.consent_reference,
          participantId: row.participant_id,
          participantName: `${row.participant_given} ${row.participant_family}`.trim(),
          method: row.consent_method as AssistedConsentMethod,
          capturedByOperatorId: row.consent_captured_by,
          capturedByOperatorName: `${row.consent_operator_given ?? ''} ${row.consent_operator_family ?? ''}`.trim(),
          capturedAt: asIso(row.consent_captured_at),
        }
      : undefined;
  return {
    id: row.id,
    participantId: row.participant_id,
    registrationStatus: asStatus(row.status),
    ...(consent ? { consent } : {}),
    updatedAt: asIso(row.updated_at),
  };
}

function asStatus(value: string): AssistedRegistrationStatus {
  if (value === 'draft' || value === 'submitted') return value;
  return 'not_started';
}

async function loadAudit(db: Queryable): Promise<ProxyAuditEntry[]> {
  const { rows } = await db.query<{
    id: string;
    action: string;
    actor_id: string | null;
    subject_id: string | null;
    after: unknown;
    occurred_at: Date | string;
  }>(
    `SELECT id, action, actor_id, subject_id, after, occurred_at
       FROM audit.activity_log
      WHERE subject_type = 'assisted_session'
      ORDER BY occurred_at DESC`,
  );
  const items: ProxyAuditEntry[] = [];
  for (const row of rows) {
    const after = asObject(row.after);
    const action = asAuditAction(row.action);
    if (!action || !row.actor_id || !row.subject_id) continue;
    items.push({
      id: row.id,
      action,
      operatorId: row.actor_id,
      operatorName: String(after.operatorName ?? ''),
      participantId: String(after.participantId ?? ''),
      participantName: String(after.participantName ?? ''),
      consentReference: String(after.consentReference ?? ''),
      occurredAt: asIso(row.occurred_at),
    });
  }
  return items;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asAuditAction(action: string): ProxyAuditEntry['action'] | null {
  if (action === 'assisted.consent_recorded' || action === 'consent_recorded') return 'consent_recorded';
  if (action === 'assisted.registration_started' || action === 'registration_started') {
    return 'registration_started';
  }
  if (action === 'assisted.registration_submitted' || action === 'registration_submitted') {
    return 'registration_submitted';
  }
  return null;
}

async function eventForParticipant(db: Queryable, participantId: string): Promise<string> {
  const profile = await db.query<{ event_id: string }>(
    `SELECT event_id FROM core.athlete_profile WHERE person_id = $1 ORDER BY created_at LIMIT 1`,
    [participantId],
  );
  if (profile.rows[0]) return profile.rows[0].event_id;
  const event = await db.query<{ id: string }>(`SELECT id FROM core.event ORDER BY starts_on LIMIT 1`);
  if (!event.rows[0]) refuse('EVENT_UNAVAILABLE', 'profile.event.unavailable');
  return event.rows[0].id;
}

async function writeConsent(
  tx: Queryable,
  args: { actorId: string; actorRole: string; participantId: string; method: AssistedConsentMethod },
): Promise<AssistedMutationResponse> {
  requireUuid(args.participantId, 'assisted.participant.invalid');
  const eventId = await eventForParticipant(tx, args.participantId);
  const n = await tx.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM core.proxy_consent WHERE event_id = $1`,
    [eventId],
  );
  const reference = `CONSENT-COMO27-${String(Number(n.rows[0]?.n ?? '0') + 1).padStart(4, '0')}`;
  const consent = await tx.query<{ id: string; captured_at: Date | string }>(
    `INSERT INTO core.proxy_consent
       (event_id, reference, participant_id, method, captured_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, captured_at`,
    [eventId, reference, args.participantId, args.method, args.actorId],
  );
  const existing = await tx.query<{ id: string }>(
    `SELECT id FROM core.assisted_session WHERE event_id = $1 AND participant_id = $2
     ORDER BY updated_at DESC LIMIT 1`,
    [eventId, args.participantId],
  );
  let sessionId = existing.rows[0]?.id;
  if (sessionId) {
    await tx.query(
      `UPDATE core.assisted_session
          SET consent_id = $2, operator_id = $3, updated_at = now()
        WHERE id = $1`,
      [sessionId, consent.rows[0]!.id, args.actorId],
    );
  } else {
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO core.assisted_session
         (event_id, participant_id, operator_id, consent_id, status)
       VALUES ($1, $2, $3, $4, 'not_started')
       RETURNING id`,
      [eventId, args.participantId, args.actorId, consent.rows[0]!.id],
    );
    sessionId = inserted.rows[0]!.id;
  }
  const session = await loadSession(tx, sessionId);
  const participantName = await personName(tx, args.participantId);
  const operatorName = await personName(tx, args.actorId);
  const auditEntry = await writeAssistedAudit(tx, {
    eventId,
    actorId: args.actorId,
    actorRole: args.actorRole,
    action: 'assisted.consent_recorded',
    sessionId,
    after: {
      operatorName,
      participantId: args.participantId,
      participantName,
      consentReference: reference,
    },
  });
  return { session, auditEntry };
}

async function writeAction(
  tx: Queryable,
  args: {
    actorId: string;
    actorRole: string;
    participantId: string;
    action: PerformProxyActionInput['action'];
  },
): Promise<AssistedMutationResponse> {
  requireUuid(args.participantId, 'assisted.participant.invalid');
  const eventId = await eventForParticipant(tx, args.participantId);
  const nextStatus = args.action === 'registration_started' ? 'draft' : 'submitted';
  const existing = await tx.query<{ id: string; status: string; consent_id: string | null }>(
    `SELECT id, status, consent_id FROM core.assisted_session
      WHERE event_id = $1 AND participant_id = $2
      ORDER BY updated_at DESC LIMIT 1`,
    [eventId, args.participantId],
  );
  const current = existing.rows[0];
  if (current && args.action === 'registration_started' && current.status !== 'not_started') {
    refuse('INVALID_TRANSITION', 'assisted.action.already_started');
  }
  if (current && args.action === 'registration_submitted' && current.status !== 'draft') {
    refuse('INVALID_TRANSITION', 'assisted.action.not_draft');
  }
  let sessionId = current?.id;
  if (sessionId) {
    await tx.query(
      `UPDATE core.assisted_session
          SET status = $2, operator_id = $3, updated_at = now()
        WHERE id = $1`,
      [sessionId, nextStatus, args.actorId],
    );
  } else {
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO core.assisted_session
         (event_id, participant_id, operator_id, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [eventId, args.participantId, args.actorId, nextStatus],
    );
    sessionId = inserted.rows[0]!.id;
  }
  const session = await loadSession(tx, sessionId);
  const participantName = await personName(tx, args.participantId);
  const operatorName = await personName(tx, args.actorId);
  const auditEntry = await writeAssistedAudit(tx, {
    eventId,
    actorId: args.actorId,
    actorRole: args.actorRole,
    action: `assisted.${args.action}`,
    sessionId,
    after: {
      operatorName,
      participantId: args.participantId,
      participantName,
      consentReference: session.consent?.reference ?? '',
    },
  });
  return { session, auditEntry };
}

async function writeAssistedAudit(
  tx: Queryable,
  args: {
    eventId: string;
    actorId: string;
    actorRole: string;
    action: string;
    sessionId: string;
    after: Record<string, unknown>;
  },
): Promise<ProxyAuditEntry> {
  const inserted = await tx.query<{ id: string; occurred_at: Date | string }>(
    `INSERT INTO audit.activity_log
       (event_id, actor_id, actor_role, action, subject_type, subject_id, after)
     VALUES ($1, $2, $3, $4, 'assisted_session', $5, $6::jsonb)
     RETURNING id, occurred_at`,
    [args.eventId, args.actorId, args.actorRole, args.action, args.sessionId, JSON.stringify(args.after)],
  );
  const mapped = asAuditAction(args.action) ?? 'consent_recorded';
  return {
    id: inserted.rows[0]!.id,
    action: mapped,
    operatorId: args.actorId,
    operatorName: String(args.after.operatorName ?? ''),
    participantId: String(args.after.participantId ?? ''),
    participantName: String(args.after.participantName ?? ''),
    consentReference: String(args.after.consentReference ?? ''),
    occurredAt: asIso(inserted.rows[0]!.occurred_at),
  };
}
