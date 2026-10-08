import { Inject, Injectable } from '@nestjs/common';
import {
  COGNITO_USER_ADMIN,
  CognitoAdminError,
  type CognitoUserAdmin,
} from '../auth/identity/cognito-user-admin';
import {
  clampLimit,
  decodeCursor,
  keysetClause,
  toPage,
  type Page,
} from '../common/pagination/keyset';
import type { Queryable } from '../common/idempotency/idempotency.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { RepositoryError } from '../common/errors/repositoryError';
import { pool } from '../db/pool';
import { adminGrantSchema, adminInviteSchema, isOcRole } from './profile.schema';
import {
  formatPurgeBlockers,
  PERSON_PURGE_BLOCKERS_BATCH_SQL,
  PERSON_PURGE_BLOCKERS_SQL,
} from './purge-blockers.sql';
import { refuse } from './refuse';

export interface PersonRoleGrant {
  roleCode: string;
  eventId: string | null;
}

export interface PersonListItem {
  id: string;
  givenName: string;
  familyName: string;
  email: string | null;
  profileStatus: string;
  roles: PersonRoleGrant[];
  purgeable: boolean;
  purgeBlockers: string[];
  mfaEnrolled: boolean;
}

interface PersonListRow {
  id: string;
  given_name: string;
  family_name: string;
  email: string | null;
  profile_status: string;
  created_at: Date | string;
  mfa_enrolled_at: Date | string | null;
}

function headerKey(headers: { [key: string]: string | string[] | undefined }): string {
  const raw = headers['idempotency-key'];
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0].trim();
  return '';
}

function likePattern(raw: string): string {
  return `%${raw.replace(/([\\%_])/g, '\\$1')}%`;
}

function inetOrNull(ip?: string): string | null {
  if (!ip || ip === 'unknown') return null;
  return ip;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PLACEHOLDER_DOB = '1900-01-01';

@Injectable()
export class AdminPeopleService {
  constructor(
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
    @Inject(COGNITO_USER_ADMIN) private readonly cognitoUsers: CognitoUserAdmin,
  ) {}

  async list(args: {
    search?: string;
    cursor?: string;
    limit?: unknown;
  }): Promise<Page<PersonListItem>> {
    const search = args.search?.trim() ?? '';
    const cursor = decodeCursor(args.cursor);
    const requested = clampLimit(args.limit);
    const params: unknown[] = [];
    let next = 1;
    let searchSql = '';
    if (search) {
      searchSql = ` AND (
           p.given_name ILIKE $${next} ESCAPE '\\'
        OR p.family_name ILIKE $${next} ESCAPE '\\'
        OR COALESCE(p.email::text, '') ILIKE $${next} ESCAPE '\\'
        OR (p.given_name || ' ' || p.family_name) ILIKE $${next} ESCAPE '\\'
      )`;
      params.push(likePattern(search.slice(0, 100)));
      next += 1;
    }
    const keyset = keysetClause({
      table: 'p',
      cursor,
      limit: requested,
      nextParamIndex: next,
    });
    const { rows } = await pool.query<PersonListRow>(
      `SELECT p.id,
              p.given_name,
              p.family_name,
              p.email::text AS email,
              p.profile_status,
              p.created_at,
              p.mfa_enrolled_at
         FROM core.person p
        WHERE 1=1
          ${searchSql}
          ${keyset.where}
        ${keyset.orderBy}
        LIMIT ${keyset.limit}`,
      [...params, ...keyset.params],
    );
    const page = toPage(rows, requested);
    const ids = page.items.map((row) => row.id);
    const blockersByPerson = await this.purgeBlockersFor(ids);
    const rolesByPerson = new Map<string, PersonRoleGrant[]>();
    if (ids.length > 0) {
      const roles = await pool.query<{
        person_id: string;
        role_code: string;
        event_id: string | null;
      }>(
        `SELECT person_id, role_code, event_id
           FROM core.person_role
          WHERE person_id = ANY($1::uuid[])
          ORDER BY role_code, event_id NULLS FIRST`,
        [ids],
      );
      for (const row of roles.rows) {
        const list = rolesByPerson.get(row.person_id) ?? [];
        list.push({ roleCode: row.role_code, eventId: row.event_id ?? null });
        rolesByPerson.set(row.person_id, list);
      }
    }
    return {
      items: page.items.map((row) => {
        const purgeBlockers = blockersByPerson.get(row.id) ?? ['has_signed_in'];
        return {
          id: row.id,
          givenName: row.given_name,
          familyName: row.family_name,
          email: row.email,
          profileStatus: row.profile_status,
          roles: rolesByPerson.get(row.id) ?? [],
          purgeable: purgeBlockers.length === 0,
          purgeBlockers,
          mfaEnrolled: row.mfa_enrolled_at != null,
        };
      }),
      ...(page.cursor ? { cursor: page.cursor } : {}),
    };
  }

  async grant(args: {
    actorId: string;
    personId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    body: unknown;
    ip?: string;
  }): Promise<{ personId: string; roleCode: string; eventId: string | null }> {
    this.assertUuid(args.personId);
    const parsed = adminGrantSchema.safeParse(args.body ?? {});
    if (!parsed.success) refuse('VALIDATION_ERROR', 'admin.role.invalid');
    const { roleCode, eventId } = parsed.data;
    if (roleCode === 'participant') {
      refuse('ROLE_NOT_GRANTABLE', 'admin.role.participant_self_service');
    }
    if (!isOcRole(roleCode)) {
      refuse('VALIDATION_ERROR', 'admin.role.unknown');
    }

    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/admin/people/${args.personId}/roles`,
        body: { roleCode, eventId: eventId ?? null },
        mode: 'local',
      },
      async (tx) => {
        await this.assertPerson(tx, args.personId);
        await this.assertEvent(tx, eventId);
        const inserted = await tx.query<{ id: string }>(
          `INSERT INTO core.person_role (person_id, role_code, event_id, granted_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT ON CONSTRAINT person_role_unique_per_event DO NOTHING
           RETURNING id`,
          [args.personId, roleCode, eventId ?? null, args.actorId],
        );
        if (inserted.rows[0]) {
          await this.audit(tx, {
            eventId: eventId ?? null,
            actorId: args.actorId,
            action: 'role.grant',
            subjectId: args.personId,
            before: null,
            after: { roleCode, eventId: eventId ?? null },
            ip: args.ip,
          });
        }
        return {
          status: 200,
          body: { personId: args.personId, roleCode, eventId: eventId ?? null },
        };
      },
    );
    return result.body as { personId: string; roleCode: string; eventId: string | null };
  }

  async invite(args: {
    actorId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    body: unknown;
    ip?: string;
  }): Promise<PersonListItem> {
    const parsed = adminInviteSchema.safeParse(args.body ?? {});
    if (!parsed.success) refuse('VALIDATION_ERROR', 'admin.invite.invalid');
    const email = parsed.data.email.toLowerCase();
    const givenName = parsed.data.givenName;
    const familyName = parsed.data.familyName;
    const roleCode = parsed.data.roleCode;
    const eventId = parsed.data.eventId ?? null;
    if (roleCode === 'participant') {
      refuse('ROLE_NOT_GRANTABLE', 'admin.role.participant_self_service');
    }
    if (!isOcRole(roleCode)) {
      refuse('VALIDATION_ERROR', 'admin.role.unknown');
    }

    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: 'POST /v1/admin/people/invite',
        body: { email, givenName, familyName, roleCode, eventId },
        mode: 'external',
      },
      async (db) => {
        await this.assertEvent(db, eventId);
        const existing = await db.query<{ id: string }>(
          `SELECT id FROM core.person WHERE email = $1`,
          [email],
        );
        if (existing.rows[0]) refuse('USER_ALREADY_EXISTS', 'admin.invite.already_exists');
        let sub: string;
        try {
          const created = await this.cognitoUsers.createInvitedUser({
            email,
            givenName,
            familyName,
          });
          sub = created.sub;
        } catch (err) {
          if (err instanceof CognitoAdminError) {
            if (err.code === 'UsernameExistsException') {
              refuse('USER_ALREADY_EXISTS', 'admin.invite.already_exists');
            }
            if (err.code === 'InvalidParameterException') {
              refuse('VALIDATION_ERROR', 'admin.invite.invalid');
            }
            refuse('COGNITO_ADMIN_UNAVAILABLE', 'admin.invite.cognito_unavailable');
          }
          throw err;
        }

        try {
          const inserted = await db.query<{ id: string }>(
            `INSERT INTO core.person
               (idp_subject, email, given_name, family_name, date_of_birth, profile_status)
             VALUES ($1, $2, $3, $4, $5::date, 'placeholder')
             RETURNING id`,
            [sub, email, givenName, familyName, PLACEHOLDER_DOB],
          );
          const personId = inserted.rows[0]?.id;
          if (!personId) refuse('COGNITO_USER_ORPHANED', 'admin.invite.cognito_orphaned');

          await db.query(
            `INSERT INTO core.person_role (person_id, role_code, event_id, granted_by)
             VALUES ($1, $2, $3, $4)`,
            [personId, roleCode, eventId, args.actorId],
          );
          await this.audit(db, {
            eventId,
            actorId: args.actorId,
            action: 'user.invite',
            subjectId: personId,
            before: null,
            after: { email, roleCode, eventId, idpSubject: sub },
            ip: args.ip,
          });
          return {
            status: 201,
            body: {
              id: personId,
              givenName,
              familyName,
              email,
              profileStatus: 'placeholder',
              roles: [{ roleCode, eventId }],
              purgeable: true,
              purgeBlockers: [],
              mfaEnrolled: false,
            } satisfies PersonListItem,
          };
        } catch (err) {
          if (err instanceof RepositoryError) throw err;
          refuse('COGNITO_USER_ORPHANED', 'admin.invite.cognito_orphaned');
        }
      },
    );
    return result.body as PersonListItem;
  }

  async resendInvite(args: {
    actorId: string;
    personId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    ip?: string;
  }): Promise<{ ok: true }> {
    this.assertUuid(args.personId);

    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/admin/people/${args.personId}/invite/resend`,
        body: { personId: args.personId },
        // Audit is the only write. Cognito runs in the same transaction so a
        // repeated key cannot send a second email.
        mode: 'local',
      },
      async (tx) => {
        const { rows } = await tx.query<{
          id: string;
          email: string | null;
          idp_subject: string | null;
          profile_status: string;
        }>(
          `SELECT id, email::text AS email, idp_subject, profile_status
             FROM core.person
            WHERE id = $1
            FOR UPDATE`,
          [args.personId],
        );
        const person = rows[0];
        if (!person) refuse('PERSON_NOT_FOUND', 'admin.person.not_found');
        if (!person.email) refuse('PERSON_NOT_FOUND', 'admin.person.not_found');
        // Complete means they signed in and finished a profile. Placeholder is
        // not enough on its own — they can set a password and still be
        // placeholder — so Cognito RESEND is the real gate: it only succeeds
        // while the pool user is FORCE_CHANGE_PASSWORD. AdminGetUser would be
        // a clearer pre-check, but it is a different IAM action than the
        // existing wms-backend-invite policy (AdminCreateUser only).
        if (person.profile_status !== 'placeholder') {
          refuse('INVITE_ALREADY_ACCEPTED', 'admin.invite.already_accepted');
        }

        try {
          await this.cognitoUsers.resendInvitation({ username: person.email });
        } catch (err) {
          if (err instanceof CognitoAdminError) {
            if (err.code === 'InviteAlreadyAccepted') {
              refuse('INVITE_ALREADY_ACCEPTED', 'admin.invite.already_accepted');
            }
            if (err.code === 'UserNotFound') {
              refuse('PERSON_NOT_FOUND', 'admin.person.not_found');
            }
            if (err.code === 'InvalidParameterException') {
              refuse('VALIDATION_ERROR', 'admin.invite.invalid');
            }
            refuse('COGNITO_ADMIN_UNAVAILABLE', 'admin.invite.cognito_unavailable');
          }
          throw err;
        }

        await this.audit(tx, {
          eventId: null,
          actorId: args.actorId,
          action: 'user.invite_resend',
          subjectId: person.id,
          before: null,
          after: { email: person.email, idpSubject: person.idp_subject },
          ip: args.ip,
        });
        return { status: 200, body: { ok: true } as const };
      },
    );
    return result.body as { ok: true };
  }

  async revoke(args: {
    actorId: string;
    personId: string;
    roleCode: string;
    eventId?: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    ip?: string;
  }): Promise<void> {
    this.assertUuid(args.personId);
    if (args.eventId) this.assertUuid(args.eventId);
    if (args.roleCode === 'participant') {
      refuse('ROLE_NOT_GRANTABLE', 'admin.role.participant_self_service');
    }
    if (!isOcRole(args.roleCode)) {
      refuse('VALIDATION_ERROR', 'admin.role.unknown');
    }

    await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `DELETE /v1/admin/people/${args.personId}/roles/${args.roleCode}`,
        body: { eventId: args.eventId ?? null },
        mode: 'local',
      },
      async (tx) => {
        const existing = await tx.query<{ id: string; role_code: string; event_id: string | null }>(
          `SELECT id, role_code, event_id
             FROM core.person_role
            WHERE person_id = $1
              AND role_code = $2
              AND event_id IS NOT DISTINCT FROM $3::uuid
            FOR UPDATE`,
          [args.personId, args.roleCode, args.eventId ?? null],
        );
        const row = existing.rows[0];
        if (!row) refuse('PERSON_ROLE_NOT_FOUND', 'admin.role.not_found');

        if (args.roleCode === 'oc_admin' && args.personId === args.actorId) {
          const remaining = await tx.query<{ n: string }>(
            `SELECT COUNT(*)::text AS n
               FROM core.person_role
              WHERE person_id = $1 AND role_code = 'oc_admin' AND id IS DISTINCT FROM $2`,
            [args.actorId, row.id],
          );
          if (Number(remaining.rows[0]?.n ?? 0) === 0) {
            refuse('LAST_OC_ADMIN', 'admin.role.last_oc_admin');
          }
        }

        await tx.query(`DELETE FROM core.person_role WHERE id = $1`, [row.id]);
        await this.audit(tx, {
          eventId: row.event_id,
          actorId: args.actorId,
          action: 'role.revoke',
          subjectId: args.personId,
          before: { roleCode: row.role_code, eventId: row.event_id },
          after: null,
          ip: args.ip,
        });
        return { status: 204, body: null };
      },
    );
  }

  async purge(args: {
    actorId: string;
    personId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    ip?: string;
  }): Promise<void> {
    this.assertUuid(args.personId);

    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `DELETE /v1/admin/people/${args.personId}`,
        body: { personId: args.personId },
        mode: 'external',
      },
      async (db) => {
        const person = await this.loadPersonForPurge(db, args.personId);
        const blockers = await this.purgeBlockers(db, args.personId);
        if (blockers.length > 0) {
          throw new RepositoryError({
            code: 'PURGE_BLOCKED',
            message: formatPurgeBlockers(blockers),
          });
        }
        if (!person.email) refuse('PERSON_NOT_FOUND', 'admin.person.not_found');

        try {
          await this.cognitoUsers.deleteUser({ username: person.email });
        } catch (err) {
          if (err instanceof CognitoAdminError) {
            refuse('COGNITO_ADMIN_UNAVAILABLE', 'admin.invite.cognito_unavailable');
          }
          throw err;
        }

        const deleted = await db.query<{ id: string }>(
          `SELECT core.purge_invited_person($1) AS id`,
          [args.personId],
        );
        if (!deleted.rows[0]?.id) refuse('PERSON_NOT_FOUND', 'admin.person.not_found');

        await this.audit(db, {
          eventId: null,
          actorId: args.actorId,
          action: 'user.purge',
          subjectId: args.personId,
          subjectType: 'person',
          before: {
            email: person.email,
            givenName: person.given_name,
            familyName: person.family_name,
            idpSubject: person.idp_subject,
          },
          after: null,
          ip: args.ip,
        });
        return { status: 204, body: null };
      },
    );
    void result;
  }

  async resetMfa(args: {
    actorId: string;
    personId: string;
    ip?: string;
  }): Promise<{ ok: true }> {
    this.assertUuid(args.personId);
    if (args.actorId === args.personId) refuse('MFA_SELF_RESET', 'auth.mfa.self_reset');
    const person = await this.loadPersonForPurge(pool, args.personId);
    if (!person.email) refuse('PERSON_NOT_FOUND', 'admin.person.not_found');
    try {
      await this.cognitoUsers.setSoftwareTokenMfa({ username: person.email, enabled: false });
    } catch (err) {
      if (err instanceof CognitoAdminError) {
        if (err.code === 'UserNotFound') refuse('PERSON_NOT_FOUND', 'admin.person.not_found');
        refuse('COGNITO_ADMIN_UNAVAILABLE', 'admin.invite.cognito_unavailable');
      }
      throw err;
    }
    await pool.query(`UPDATE core.person SET mfa_enrolled_at = NULL WHERE id = $1`, [args.personId]);
    await this.audit(pool, {
      eventId: null,
      actorId: args.actorId,
      action: 'user.mfa_reset',
      subjectId: args.personId,
      subjectType: 'person',
      before: { mfaEnrolled: true },
      after: { mfaEnrolled: false },
      ip: args.ip,
    });
    return { ok: true };
  }

  private async loadPersonForPurge(
    db: Queryable,
    personId: string,
  ): Promise<{
    id: string;
    email: string | null;
    given_name: string;
    family_name: string;
    idp_subject: string | null;
  }> {
    const { rows } = await db.query<{
      id: string;
      email: string | null;
      given_name: string;
      family_name: string;
      idp_subject: string | null;
    }>(
      `SELECT id, email::text AS email, given_name, family_name, idp_subject
         FROM core.person
        WHERE id = $1`,
      [personId],
    );
    const person = rows[0];
    if (!person) refuse('PERSON_NOT_FOUND', 'admin.person.not_found');
    return person;
  }

  private async purgeBlockers(db: Queryable, personId: string): Promise<string[]> {
    const { rows } = await db.query<{ blockers: string[] }>(PERSON_PURGE_BLOCKERS_SQL, [
      personId,
    ]);
    return rows[0]?.blockers ?? ['has_signed_in'];
  }

  private async purgeBlockersFor(personIds: string[]): Promise<Map<string, string[]>> {
    const blockersByPerson = new Map<string, string[]>();
    if (personIds.length === 0) return blockersByPerson;
    const { rows } = await pool.query<{ person_id: string; blockers: string[] }>(
      PERSON_PURGE_BLOCKERS_BATCH_SQL,
      [personIds],
    );
    for (const row of rows) {
      blockersByPerson.set(row.person_id, row.blockers ?? []);
    }
    return blockersByPerson;
  }

  private assertUuid(value: string): void {
    if (!UUID_RE.test(value)) refuse('VALIDATION_ERROR', 'admin.person.invalid');
  }

  private async assertPerson(tx: Queryable, personId: string): Promise<void> {
    const { rows } = await tx.query<{ id: string }>(`SELECT id FROM core.person WHERE id = $1`, [
      personId,
    ]);
    if (!rows[0]) refuse('PERSON_NOT_FOUND', 'admin.person.not_found');
  }

  private async assertEvent(tx: Queryable, eventId: string | null | undefined): Promise<void> {
    if (!eventId) return;
    const { rows } = await tx.query<{ id: string }>(`SELECT id FROM core.event WHERE id = $1`, [
      eventId,
    ]);
    if (!rows[0]) refuse('EVENT_NOT_FOUND', 'admin.event.not_found');
  }

  private async audit(
    tx: Queryable,
    args: {
      eventId: string | null;
      actorId: string;
      action: string;
      subjectId: string;
      subjectType?: string;
      before: unknown;
      after: unknown;
      ip?: string;
    },
  ): Promise<void> {
    await tx.query(
      `INSERT INTO audit.activity_log
         (event_id, actor_id, actor_role, action, subject_type, subject_id, before, after, ip)
       VALUES ($1, $2, 'oc_admin', $3, $4, $5, $6::jsonb, $7::jsonb, $8::inet)`,
      [
        args.eventId,
        args.actorId,
        args.action,
        args.subjectType ?? 'person_role',
        args.subjectId,
        args.before === null ? null : JSON.stringify(args.before),
        args.after === null ? null : JSON.stringify(args.after),
        inetOrNull(args.ip),
      ],
    );
  }
}
