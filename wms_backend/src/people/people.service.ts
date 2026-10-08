import { Inject, Injectable } from '@nestjs/common';
import type { Queryable } from '../common/idempotency/idempotency.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { pool } from '../db/pool';
import { CALLER_EMAIL_SOURCE, type CallerEmailSource } from './caller-email';
import {
  CALLER_MFA_SOURCE,
  MFA_ENFORCEMENT_THRESHOLD,
  countEnrolledOcAdmins,
  type CallerMfaSource,
} from './caller-mfa';
import {
  COGNITO_USER_ADMIN,
  CognitoAdminError,
  type CognitoUserAdmin,
} from '../auth/identity/cognito-user-admin';
import { isOcRole } from './profile.schema';
import {
  ageOn,
  hasRealName,
  isPlaceholderDob,
  parseIsoDate,
  profilePatchSchema,
  todayUtc,
  type ProfilePatch,
} from './profile.schema';
import { refuse } from './refuse';

export interface EmergencyContactView {
  ordinal: number;
  name: string;
  relationship: string | null;
  phone: string;
}

export interface MeProfile {
  id: string;
  email: string | null;
  givenName: string;
  familyName: string;
  dateOfBirth: string;
  nationality: string | null;
  gender: string | null;
  phone: string | null;
  locale: string | null;
  profileStatus: 'placeholder' | 'complete';
  roles: string[];
  emergencyContacts: EmergencyContactView[];
  mfa: {
    enrolled: boolean;
    enforcementActive: boolean;
    enrolledOcAdminCount: number;
  };
}

interface PersonRow {
  id: string;
  email: string | null;
  given_name: string;
  family_name: string;
  date_of_birth: string;
  nationality: string | null;
  gender: string | null;
  phone: string | null;
  locale: string | null;
  profile_status: 'placeholder' | 'complete';
  mfa_enrolled_at: Date | string | null;
}

interface ContactRow {
  ordinal: number;
  name: string;
  relationship: string | null;
  phone: string;
}

function headerKey(headers: { [key: string]: string | string[] | undefined }): string {
  const raw = headers['idempotency-key'];
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0].trim();
  return '';
}

@Injectable()
export class PeopleService {
  constructor(
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
    @Inject(CALLER_EMAIL_SOURCE) private readonly emails: CallerEmailSource,
    @Inject(CALLER_MFA_SOURCE) private readonly mfa: CallerMfaSource,
    @Inject(COGNITO_USER_ADMIN) private readonly cognitoUsers: CognitoUserAdmin,
  ) {}

  async getMe(personId: string): Promise<MeProfile> {
    return this.loadProfile(pool, personId);
  }

  async patchProfile(args: {
    personId: string;
    accessToken: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    body: unknown;
  }): Promise<MeProfile> {
    // personId is taken from the token by the caller. Anything named personId
    // in the body is stripped by the schema and never read.
    const patch = this.parsePatch(args.body);
    this.assertDateOfBirth(patch.dateOfBirth);

    const email = await this.emails.emailFor(args.accessToken, args.personId);

    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: 'PATCH /v1/me/profile',
        body: patch,
        mode: 'local',
      },
      async (tx) => {
        const body = await this.applyPatch(tx, args.personId, patch, email);
        return { status: 200, body };
      },
    );
    return result.body as MeProfile;
  }

  async completeMfa(args: { personId: string; accessToken: string; roles: string[] }): Promise<MeProfile> {
    const state = await this.mfa.inspect(args.accessToken);
    if (!state.enrolled) refuse('MFA_NOT_ENROLLED', 'auth.mfa.not_enrolled');
    const person = await this.loadProfile(pool, args.personId);
    const username = state.username ?? person.email;
    if (!username) refuse('PERSON_NOT_FOUND', 'profile.person.not_found');
    try {
      // Close the pre-enrolment refresh-token hole before we count this admin.
      await this.cognitoUsers.globalSignOut({ username });
    } catch (err) {
      if (err instanceof CognitoAdminError) {
        refuse('COGNITO_ADMIN_UNAVAILABLE', 'admin.invite.cognito_unavailable');
      }
      throw err;
    }
    await pool.query(`UPDATE core.person SET mfa_enrolled_at = COALESCE(mfa_enrolled_at, now()) WHERE id = $1`, [
      args.personId,
    ]);
    return this.loadProfile(pool, args.personId);
  }

  async disableMfa(args: { personId: string; roles: string[] }): Promise<MeProfile> {
    if (args.roles.some((role) => isOcRole(role))) {
      refuse('MFA_SELF_RESET', 'auth.mfa.self_reset');
    }
    await pool.query(`UPDATE core.person SET mfa_enrolled_at = NULL WHERE id = $1`, [args.personId]);
    return this.loadProfile(pool, args.personId);
  }

  private parsePatch(body: unknown): ProfilePatch {
    const parsed = profilePatchSchema.safeParse(body ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path[0];
      const key =
        path === 'dateOfBirth'
          ? 'profile.date_of_birth.invalid'
          : path === 'emergencyContacts'
            ? 'profile.emergency_contact.invalid'
            : 'profile.validation.invalid';
      refuse('VALIDATION_ERROR', key);
    }
    const patch = parsed.data;
    if (patch.emergencyContacts) {
      const ordinals = patch.emergencyContacts.map((c) => c.ordinal);
      if (new Set(ordinals).size !== ordinals.length) {
        refuse('VALIDATION_ERROR', 'profile.emergency_contact.ordinal');
      }
    }
    return patch;
  }

  private assertDateOfBirth(value: string | undefined): void {
    if (value === undefined) return;
    if (isPlaceholderDob(value)) {
      refuse('VALIDATION_ERROR', 'profile.date_of_birth.placeholder');
    }
    const dob = parseIsoDate(value);
    if (!dob) refuse('VALIDATION_ERROR', 'profile.date_of_birth.invalid');
    const today = todayUtc();
    if (dob.getTime() > today.getTime()) {
      refuse('VALIDATION_ERROR', 'profile.date_of_birth.future');
    }
    if (ageOn(dob, today) < 18) {
      refuse('VALIDATION_ERROR', 'profile.date_of_birth.under_18');
    }
  }

  private async applyPatch(
    tx: Queryable,
    personId: string,
    patch: ProfilePatch,
    email: string | null,
  ): Promise<MeProfile> {
    const current = await this.lockPerson(tx, personId);

    if (patch.dateOfBirth && patch.dateOfBirth !== current.date_of_birth) {
      await this.assertDobUnlocked(tx, personId);
    }
    if (patch.locale) {
      await this.assertLocale(tx, patch.locale);
    }

    const givenName = patch.givenName ?? current.given_name;
    const familyName = patch.familyName ?? current.family_name;
    const dateOfBirth = patch.dateOfBirth ?? current.date_of_birth;
    const complete = hasRealName(givenName, familyName) && !isPlaceholderDob(dateOfBirth);

    await tx.query(
      `UPDATE core.person
          SET given_name    = $2,
              family_name   = $3,
              date_of_birth = $4::date,
              nationality   = COALESCE($5, nationality),
              gender        = COALESCE($6, gender),
              phone         = COALESCE($7, phone),
              locale        = COALESCE($8, locale),
              email         = COALESCE($9, email),
              profile_status = CASE
                WHEN $10 THEN 'complete'
                ELSE profile_status
              END,
              updated_at    = now()
        WHERE id = $1`,
      [
        personId,
        givenName,
        familyName,
        dateOfBirth,
        patch.nationality ?? null,
        patch.gender ?? null,
        patch.phone ?? null,
        patch.locale ?? null,
        email,
        complete,
      ],
    );

    if (patch.emergencyContacts) {
      await tx.query(`DELETE FROM core.emergency_contact WHERE person_id = $1`, [personId]);
      for (const contact of patch.emergencyContacts) {
        await tx.query(
          `INSERT INTO core.emergency_contact (person_id, name, relationship, phone, ordinal)
           VALUES ($1, $2, $3, $4, $5)`,
          [personId, contact.name, contact.relationship ?? null, contact.phone, contact.ordinal],
        );
      }
    }

    if (complete) {
      const granted = await tx.query<{ grant_participant: string | null }>(
        `SELECT core.grant_participant($1, $1) AS grant_participant`,
        [personId],
      );
      const eventId = granted.rows[0]?.grant_participant ?? null;
      if (eventId) {
        await tx.query(
          `INSERT INTO audit.activity_log
             (event_id, actor_id, actor_role, action, subject_type, subject_id, after)
           VALUES ($1, $2, 'participant', 'role.grant', 'person_role', $2, $3::jsonb)`,
          [eventId, personId, JSON.stringify({ roleCode: 'participant', eventId })],
        );
      }
    }

    return this.loadProfile(tx, personId);
  }

  private async lockPerson(tx: Queryable, personId: string): Promise<PersonRow> {
    const { rows } = await tx.query<PersonRow>(
      `SELECT id,
              email::text AS email,
              given_name,
              family_name,
              date_of_birth::text AS date_of_birth,
              NULLIF(BTRIM(nationality), '') AS nationality,
              gender,
              phone,
              locale,
              profile_status
         FROM core.person
        WHERE id = $1
        FOR UPDATE`,
      [personId],
    );
    const row = rows[0];
    if (!row) refuse('PERSON_NOT_FOUND', 'profile.person.not_found');
    return row;
  }

  private async assertDobUnlocked(tx: Queryable, personId: string): Promise<void> {
    const { rows } = await tx.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n
         FROM core.athlete_profile ap
         JOIN core.registration_entry re ON re.athlete_profile_id = ap.id
        WHERE ap.person_id = $1`,
      [personId],
    );
    if (Number(rows[0]?.n ?? 0) > 0) {
      refuse('DOB_CHANGE_NEEDS_REVIEW', 'profile.date_of_birth.needs_review');
    }
  }

  private async assertLocale(tx: Queryable, locale: string): Promise<void> {
    const { rows } = await tx.query<{ code: string }>(
      `SELECT code FROM core.locale WHERE code = $1 AND active`,
      [locale],
    );
    if (!rows[0]) refuse('VALIDATION_ERROR', 'profile.locale.invalid');
  }

  private async loadProfile(db: Queryable, personId: string): Promise<MeProfile> {
    const { rows } = await db.query<PersonRow>(
      `SELECT id,
              email::text AS email,
              given_name,
              family_name,
              date_of_birth::text AS date_of_birth,
              NULLIF(BTRIM(nationality), '') AS nationality,
              gender,
              phone,
              locale,
              profile_status,
              mfa_enrolled_at
         FROM core.person
        WHERE id = $1`,
      [personId],
    );
    const person = rows[0];
    if (!person) refuse('PERSON_NOT_FOUND', 'profile.person.not_found');

    const contacts = await db.query<ContactRow>(
      `SELECT ordinal, name, relationship, phone
         FROM core.emergency_contact
        WHERE person_id = $1
        ORDER BY ordinal`,
      [personId],
    );
    const roles = await db.query<{ role_code: string }>(
      `SELECT role_code FROM core.person_role WHERE person_id = $1 ORDER BY role_code`,
      [personId],
    );

    const enrolledOcAdminCount = await countEnrolledOcAdmins();
    return {
      id: person.id,
      email: person.email,
      givenName: person.given_name,
      familyName: person.family_name,
      dateOfBirth: person.date_of_birth,
      nationality: person.nationality,
      gender: person.gender,
      phone: person.phone,
      locale: person.locale,
      profileStatus: person.profile_status,
      roles: roles.rows.map((r) => r.role_code),
      emergencyContacts: contacts.rows.map((c) => ({
        ordinal: c.ordinal,
        name: c.name,
        relationship: c.relationship,
        phone: c.phone,
      })),
      mfa: {
        enrolled: person.mfa_enrolled_at != null,
        enforcementActive: enrolledOcAdminCount >= MFA_ENFORCEMENT_THRESHOLD,
        enrolledOcAdminCount,
      },
    };
  }
}
