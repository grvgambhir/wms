/**
 * Profile completion and OC role grants. Real Postgres, fake identity provider
 * — no AWS. AUTH_PROVIDER stays local for the rest of the suite.
 */
import { INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthGuard } from '../src/auth/guards/auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import {
  IDENTITY_PROVIDER,
  InvalidTokenError,
  type AuthenticatedIdentity,
  type IdentityProvider,
  type TokenPair,
} from '../src/auth/identity/identity-provider';
import { configureApp } from '../src/configure-app';
import { pool } from '../src/db/pool';
import { PeopleModule } from '../src/people/people.module';
import {
  CognitoAdminError,
  setCognitoUserAdminForTests,
} from '../src/auth/identity/cognito-user-admin';

class FakeIdentityProvider implements IdentityProvider {
  private readonly tokens = new Map<string, AuthenticatedIdentity>();

  issueToken(identity: AuthenticatedIdentity): string {
    const token = `fake.${identity.personId}.${randomUUID()}`;
    this.tokens.set(token, identity);
    return token;
  }

  authenticate(): Promise<AuthenticatedIdentity | null> {
    return Promise.resolve(null);
  }

  issue(): Promise<TokenPair> {
    throw new InvalidTokenError();
  }

  async verify(accessToken: string): Promise<AuthenticatedIdentity> {
    const identity = this.tokens.get(accessToken);
    if (!identity) throw new InvalidTokenError();
    return identity;
  }

  refresh(): Promise<TokenPair> {
    throw new InvalidTokenError();
  }

  async revoke(): Promise<void> {
    return undefined;
  }
}

const fake = new FakeIdentityProvider();
const cognitoCreate = vi.fn(async (args: { email: string; givenName: string; familyName: string }) => ({
  sub: `sub-${args.email}`,
}));
const cognitoResend = vi.fn(async (_args: { username: string }) => undefined);
const cognitoDelete = vi.fn(async (_args: { username: string }) => undefined);
const cognitoCallOrder: string[] = [];

@Module({
  imports: [PeopleModule],
  providers: [
    { provide: IDENTITY_PROVIDER, useValue: fake },
    AuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
})
class ProfileRolesTestModule {}

let app: INestApplication;
let baseUrl: string;
let eventId: string;
let productId: string;
let ruleVersionId: string;

function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

function bearer(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${token}`, ...extra };
}

function mutationHeaders(token: string, key = randomUUID()): Record<string, string> {
  return bearer(token, { 'idempotency-key': key });
}

async function insertPerson(args: {
  email?: string | null;
  givenName?: string;
  familyName?: string;
  dob?: string;
  profileStatus?: 'placeholder' | 'complete';
  role?: string;
  idpSubject?: string | null;
}): Promise<string> {
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO core.person (email, given_name, family_name, date_of_birth, profile_status, idp_subject)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      args.email ?? `p.${randomUUID()}@example.com`,
      args.givenName ?? 'Pending',
      args.familyName ?? 'User',
      args.dob ?? '1900-01-01',
      args.profileStatus ?? 'placeholder',
      args.idpSubject ?? null,
    ],
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error('person insert failed');
  if (args.role) {
    await pool.query(
      `INSERT INTO core.person_role (person_id, role_code, granted_by)
       VALUES ($1, $2, CASE WHEN $2 = 'participant' THEN $1 ELSE COALESCE((SELECT pr.person_id FROM core.person_role pr WHERE pr.role_code = 'oc_admin' LIMIT 1), $1) END)`,
      [id, args.role],
    );
  }
  return id;
}

async function insertAthleteProfile(personId: string): Promise<string> {
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO core.athlete_profile (person_id, event_id)
     VALUES ($1, $2)
     RETURNING id`,
    [personId, eventId],
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error('athlete_profile insert failed');
  return id;
}

async function insertEntry(athleteProfileId: string): Promise<void> {
  await pool.query(
    `INSERT INTO core.registration_entry
       (event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id, status)
     VALUES ($1, $2, $3, 'competitive', $4, 'draft')`,
    [eventId, athleteProfileId, productId, ruleVersionId],
  );
}

beforeAll(async () => {
  setCognitoUserAdminForTests({
    createInvitedUser: async (args) => {
      cognitoCallOrder.push('create');
      return cognitoCreate(args);
    },
    resendInvitation: async (args) => {
      cognitoCallOrder.push('resend');
      return cognitoResend(args);
    },
    deleteUser: async (args) => {
      cognitoCallOrder.push('delete');
      return cognitoDelete(args);
    },
    setSoftwareTokenMfa: async () => undefined,
    globalSignOut: async () => undefined,
  });
  const event = await pool.query<{ id: string }>(
    `INSERT INTO core.event (slug, name, starts_on, ends_on, age_reference_date, status)
     VALUES ($1, 'Profile Roles Event', '2027-09-17', '2027-09-26', '2027-12-31', 'registration_open')
     RETURNING id`,
    [`profile-roles-${randomUUID()}`],
  );
  const foundEvent = event.rows[0]?.id;
  if (!foundEvent) throw new Error('event insert failed');
  eventId = foundEvent;

  const sport = await pool.query<{ id: string }>(
    `INSERT INTO core.sport (event_id, code, name) VALUES ($1, 'tennis', 'Tennis') RETURNING id`,
    [eventId],
  );
  const sportId = sport.rows[0]?.id;
  if (!sportId) throw new Error('sport insert failed');

  const ruleSet = await pool.query<{ id: string }>(
    `INSERT INTO core.rule_set (event_id, sport_code) VALUES ($1, 'tennis') RETURNING id`,
    [eventId],
  );
  const ruleSetId = ruleSet.rows[0]?.id;
  if (!ruleSetId) throw new Error('rule_set insert failed');

  const version = await pool.query<{ id: string }>(
    `INSERT INTO core.rule_version (rule_set_id, version_no, reference_date, effective, status)
     VALUES ($1, 1, '2027-12-31', tstzrange(now(), NULL), 'draft')
     RETURNING id`,
    [ruleSetId],
  );
  const versionId = version.rows[0]?.id;
  if (!versionId) throw new Error('rule_version insert failed');
  ruleVersionId = versionId;

  const product = await pool.query<{ id: string }>(
    `INSERT INTO core.sport_entry_product
       (event_id, sport_id, name, participant_type, rule_set_id)
     VALUES ($1, $2, 'Tennis Singles', 'individual', $3)
     RETURNING id`,
    [eventId, sportId, ruleSetId],
  );
  const foundProduct = product.rows[0]?.id;
  if (!foundProduct) throw new Error('product insert failed');
  productId = foundProduct;

  app = await NestFactory.create(ProfileRolesTestModule, { logger: false });
  configureApp(app);
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  setCognitoUserAdminForTests(undefined);
  await app.close();
});

describe('profile completion and role grants', () => {
  it('completes a placeholder profile, grants participant, and allows a registration insert', async () => {
    const email = `complete.${randomUUID()}@example.com`;
    const personId = await insertPerson({ email, profileStatus: 'placeholder' });
    const profileId = await insertAthleteProfile(personId);

    await expect(insertEntry(profileId)).rejects.toMatchObject({ code: '23514' });

    const token = fake.issueToken({ personId, roles: [] });
    const res = await api('/v1/me/profile', {
      method: 'PATCH',
      headers: mutationHeaders(token),
      body: JSON.stringify({
        personId: randomUUID(),
        email: 'attacker@example.com',
        givenName: 'Ada',
        familyName: 'Lovelace',
        dateOfBirth: '1985-12-10',
        nationality: 'gb',
        gender: 'female',
        phone: '+44 7700 900001',
        locale: 'en',
        emergencyContacts: [
          { ordinal: 1, name: 'William King', relationship: 'Spouse', phone: '+44 7700 900002' },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      email: string | null;
      givenName: string;
      profileStatus: string;
      roles: string[];
      emergencyContacts: Array<{ name: string }>;
    };
    expect(body.id).toBe(personId);
    expect(body.givenName).toBe('Ada');
    expect(body.profileStatus).toBe('complete');
    expect(body.roles).toContain('participant');
    expect(body.email).toBe(email);
    expect(body.email).not.toBe('attacker@example.com');
    expect(body.emergencyContacts).toHaveLength(1);

    const me = await api('/v1/me', { headers: bearer(token) });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { id: string; profileStatus: string; roles: string[] };
    expect(meBody.id).toBe(personId);
    expect(meBody.profileStatus).toBe('complete');
    expect(meBody.roles).toContain('participant');

    await insertEntry(profileId);

    const row = await pool.query<{ profile_status: string; email: string | null }>(
      `SELECT profile_status, email::text AS email FROM core.person WHERE id = $1`,
      [personId],
    );
    expect(row.rows[0]?.profile_status).toBe('complete');
    expect(row.rows[0]?.email).toBe(email);
  });

  it('ignores personId in the body — the caller cannot edit anyone else', async () => {
    const callerId = await insertPerson({
      email: `caller.${randomUUID()}@example.com`,
      profileStatus: 'placeholder',
    });
    const otherId = await insertPerson({
      email: `other.${randomUUID()}@example.com`,
      givenName: 'Other',
      familyName: 'Person',
      dob: '1970-01-01',
      profileStatus: 'complete',
    });
    const token = fake.issueToken({ personId: callerId, roles: [] });
    const res = await api('/v1/me/profile', {
      method: 'PATCH',
      headers: mutationHeaders(token),
      body: JSON.stringify({
        personId: otherId,
        givenName: 'Caller',
        familyName: 'Edited',
        dateOfBirth: '1980-05-05',
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; givenName: string };
    expect(body.id).toBe(callerId);
    expect(body.givenName).toBe('Caller');

    const other = await pool.query<{ given_name: string }>(
      `SELECT given_name FROM core.person WHERE id = $1`,
      [otherId],
    );
    expect(other.rows[0]?.given_name).toBe('Other');
  });

  it('allows a date of birth change before any entry and refuses after one', async () => {
    const personId = await insertPerson({
      email: `dob.${randomUUID()}@example.com`,
      profileStatus: 'placeholder',
    });
    const token = fake.issueToken({ personId, roles: [] });
    const first = await api('/v1/me/profile', {
      method: 'PATCH',
      headers: mutationHeaders(token),
      body: JSON.stringify({
        givenName: 'Dob',
        familyName: 'Change',
        dateOfBirth: '1982-03-03',
      }),
    });
    expect(first.status).toBe(200);

    const beforeEntry = await api('/v1/me/profile', {
      method: 'PATCH',
      headers: mutationHeaders(token),
      body: JSON.stringify({ dateOfBirth: '1982-04-04' }),
    });
    expect(beforeEntry.status).toBe(200);
    const beforeBody = (await beforeEntry.json()) as { dateOfBirth: string };
    expect(beforeBody.dateOfBirth).toBe('1982-04-04');

    const profileId = await insertAthleteProfile(personId);
    await insertEntry(profileId);

    const afterEntry = await api('/v1/me/profile', {
      method: 'PATCH',
      headers: mutationHeaders(token),
      body: JSON.stringify({ dateOfBirth: '1983-01-01' }),
    });
    expect(afterEntry.status).toBe(422);
    const problem = (await afterEntry.json()) as {
      code: string;
      message_key?: string;
      detail: string;
    };
    expect(problem.code).toBe('DOB_CHANGE_NEEDS_REVIEW');
    expect(problem.message_key).toBe('profile.date_of_birth.needs_review');
    expect(problem.detail.includes(' ')).toBe(false);
  });

  it('refuses a future date of birth with a message key rather than a sentence', async () => {
    const personId = await insertPerson({
      email: `future.${randomUUID()}@example.com`,
      profileStatus: 'placeholder',
    });
    const token = fake.issueToken({ personId, roles: [] });
    const res = await api('/v1/me/profile', {
      method: 'PATCH',
      headers: mutationHeaders(token),
      body: JSON.stringify({
        givenName: 'Future',
        familyName: 'Born',
        dateOfBirth: '2099-01-01',
      }),
    });
    expect(res.status).toBe(400);
    const problem = (await res.json()) as { code: string; message_key?: string; detail: string };
    expect(problem.message_key).toBe('profile.date_of_birth.future');
    expect(problem.detail.includes(' ')).toBe(false);
    expect(problem.message_key?.includes(' ')).toBe(false);
  });

  it('returns 403 when a participant calls the admin role endpoint', async () => {
    const personId = await insertPerson({
      email: `part.${randomUUID()}@example.com`,
      givenName: 'Pat',
      familyName: 'Icipant',
      dob: '1980-01-01',
      profileStatus: 'complete',
      role: 'participant',
    });
    const token = fake.issueToken({ personId, roles: ['participant'] });
    const res = await api(`/v1/admin/people/${personId}/roles`, {
      method: 'POST',
      headers: mutationHeaders(token),
      body: JSON.stringify({ roleCode: 'oc_staff' }),
    });
    expect(res.status).toBe(403);
  });

  it('lets oc_admin grant oc_staff, refuses granting participant, and records grant and revoke', async () => {
    const adminId = await insertPerson({
      email: `admin.${randomUUID()}@example.com`,
      givenName: 'Olga',
      familyName: 'Admin',
      dob: '1975-01-01',
      profileStatus: 'complete',
      role: 'oc_admin',
    });
    const targetId = await insertPerson({
      email: `staff.${randomUUID()}@example.com`,
      givenName: 'Sam',
      familyName: 'Staff',
      dob: '1978-01-01',
      profileStatus: 'complete',
    });
    const token = fake.issueToken({ personId: adminId, roles: ['oc_admin'] });

    const grant = await api(`/v1/admin/people/${targetId}/roles`, {
      method: 'POST',
      headers: mutationHeaders(token),
      body: JSON.stringify({ roleCode: 'oc_staff', eventId }),
    });
    expect(grant.status).toBe(200);
    const granted = (await grant.json()) as { roleCode: string; eventId: string | null };
    expect(granted.roleCode).toBe('oc_staff');
    expect(granted.eventId).toBe(eventId);

    const participantGrant = await api(`/v1/admin/people/${targetId}/roles`, {
      method: 'POST',
      headers: mutationHeaders(token),
      body: JSON.stringify({ roleCode: 'participant', eventId }),
    });
    expect(participantGrant.status).toBe(422);
    const refused = (await participantGrant.json()) as { code: string; message_key?: string };
    expect(refused.code).toBe('ROLE_NOT_GRANTABLE');
    expect(refused.message_key).toBe('admin.role.participant_self_service');

    const revoke = await api(`/v1/admin/people/${targetId}/roles/oc_staff?eventId=${eventId}`, {
      method: 'DELETE',
      headers: mutationHeaders(token),
    });
    expect(revoke.status).toBe(204);

    const log = await pool.query<{ action: string }>(
      `SELECT action FROM audit.activity_log
        WHERE subject_id = $1 AND action IN ('role.grant', 'role.revoke')
        ORDER BY occurred_at`,
      [targetId],
    );
    expect(log.rows.map((r) => r.action)).toEqual(['role.grant', 'role.revoke']);
  });

  it('refuses an oc_admin removing their own last oc_admin grant', async () => {
    const adminId = await insertPerson({
      email: `lastadmin.${randomUUID()}@example.com`,
      givenName: 'Last',
      familyName: 'Admin',
      dob: '1972-01-01',
      profileStatus: 'complete',
      role: 'oc_admin',
    });
    const token = fake.issueToken({ personId: adminId, roles: ['oc_admin'] });
    const res = await api(`/v1/admin/people/${adminId}/roles/oc_admin`, {
      method: 'DELETE',
      headers: mutationHeaders(token),
    });
    expect(res.status).toBe(422);
    const problem = (await res.json()) as { code: string; message_key?: string };
    expect(problem.code).toBe('LAST_OC_ADMIN');
    expect(problem.message_key).toBe('admin.role.last_oc_admin');

    const still = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM core.person_role
        WHERE person_id = $1 AND role_code = 'oc_admin'`,
      [adminId],
    );
    expect(still.rows[0]?.n).toBe('1');
  });

  it('lets an administrator find a person with keyset search', async () => {
    const needle = `findme.${randomUUID()}@example.com`;
    const personId = await insertPerson({
      email: needle,
      givenName: 'Find',
      familyName: 'Me',
      dob: '1981-01-01',
      profileStatus: 'complete',
    });
    const adminId = await insertPerson({
      email: `searchadmin.${randomUUID()}@example.com`,
      givenName: 'Search',
      familyName: 'Admin',
      dob: '1970-01-01',
      profileStatus: 'complete',
      role: 'oc_admin',
    });
    const token = fake.issueToken({ personId: adminId, roles: ['oc_admin'] });
    const res = await api(`/v1/admin/people?search=${encodeURIComponent(needle)}&limit=10`, {
      headers: bearer(token),
    });
    expect(res.status).toBe(200);
    const page = (await res.json()) as { items: Array<{ id: string; email: string | null }> };
    expect(page.items.some((item) => item.id === personId && item.email === needle)).toBe(true);
  });

  it('lists the same role twice when one grant is global and one is event-scoped', async () => {
    const adminId = await insertPerson({
      email: `scopedadmin.${randomUUID()}@example.com`,
      givenName: 'Scoped',
      familyName: 'Admin',
      dob: '1970-01-01',
      profileStatus: 'complete',
      role: 'oc_admin',
    });
    const email = `dualrole.${randomUUID()}@example.com`;
    const targetId = await insertPerson({
      email,
      givenName: 'Dual',
      familyName: 'Role',
      dob: '1982-01-01',
      profileStatus: 'complete',
    });
    const token = fake.issueToken({ personId: adminId, roles: ['oc_admin'] });

    const globalGrant = await api(`/v1/admin/people/${targetId}/roles`, {
      method: 'POST',
      headers: mutationHeaders(token),
      body: JSON.stringify({ roleCode: 'oc_staff' }),
    });
    expect(globalGrant.status).toBe(200);

    const eventGrant = await api(`/v1/admin/people/${targetId}/roles`, {
      method: 'POST',
      headers: mutationHeaders(token),
      body: JSON.stringify({ roleCode: 'oc_staff', eventId }),
    });
    expect(eventGrant.status).toBe(200);

    const res = await api(`/v1/admin/people?search=${encodeURIComponent(email)}&limit=10`, {
      headers: bearer(token),
    });
    expect(res.status).toBe(200);
    const page = (await res.json()) as {
      items: Array<{
        id: string;
        roles: Array<{ roleCode: string; eventId: string | null }>;
      }>;
    };
    const person = page.items.find((item) => item.id === targetId);
    expect(person?.roles).toEqual([
      { roleCode: 'oc_staff', eventId: null },
      { roleCode: 'oc_staff', eventId },
    ]);
  });

  it('refuses an OC role whose granted_by is not an oc_admin', async () => {
    const personId = await insertPerson({
      email: `selfgrant.${randomUUID()}@example.com`,
      givenName: 'Self',
      familyName: 'Grant',
      dob: '1979-01-01',
      profileStatus: 'complete',
    });
    await expect(
      pool.query(
        `INSERT INTO core.person_role (person_id, role_code, granted_by)
         VALUES ($1, 'oc_staff', $1)`,
        [personId],
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'person_role_oc_needs_admin_granter' });
  });
});

describe('admin invite', () => {
  it('creates the person with idp_subject and the granted role in one go', async () => {
    cognitoCreate.mockClear();
    const adminId = await insertPerson({
      email: `inviteadmin.${randomUUID()}@example.com`,
      givenName: 'Olga',
      familyName: 'Admin',
      dob: '1975-01-01',
      profileStatus: 'complete',
      role: 'oc_admin',
    });
    const token = fake.issueToken({ personId: adminId, roles: ['oc_admin'] });
    const email = `invited.${randomUUID()}@example.com`;
    const res = await api('/v1/admin/people/invite', {
      method: 'POST',
      headers: mutationHeaders(token),
      body: JSON.stringify({
        email,
        givenName: 'Ivy',
        familyName: 'Invited',
        roleCode: 'oc_staff',
        eventId,
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      email: string;
      givenName: string;
      profileStatus: string;
      roles: Array<{ roleCode: string; eventId: string | null }>;
    };
    expect(body.email).toBe(email);
    expect(body.givenName).toBe('Ivy');
    expect(body.profileStatus).toBe('placeholder');
    expect(body.roles).toEqual([{ roleCode: 'oc_staff', eventId }]);
    expect(cognitoCreate).toHaveBeenCalledTimes(1);

    const row = await pool.query<{ idp_subject: string | null; role_code: string }>(
      `SELECT p.idp_subject, pr.role_code
         FROM core.person p
         JOIN core.person_role pr ON pr.person_id = p.id
        WHERE p.id = $1`,
      [body.id],
    );
    expect(row.rows[0]?.idp_subject).toBe(`sub-${email}`);
    expect(row.rows[0]?.role_code).toBe('oc_staff');
  });

  it('refuses inviting a participant role', async () => {
    const adminId = await insertPerson({
      email: `invitepart.${randomUUID()}@example.com`,
      givenName: 'Olga',
      familyName: 'Admin',
      dob: '1975-01-01',
      profileStatus: 'complete',
      role: 'oc_admin',
    });
    const token = fake.issueToken({ personId: adminId, roles: ['oc_admin'] });
    const res = await api('/v1/admin/people/invite', {
      method: 'POST',
      headers: mutationHeaders(token),
      body: JSON.stringify({
        email: `nope.${randomUUID()}@example.com`,
        givenName: 'Pat',
        familyName: 'Icipant',
        roleCode: 'participant',
      }),
    });
    expect(res.status).toBe(422);
    const problem = (await res.json()) as { code: string; message_key?: string };
    expect(problem.code).toBe('ROLE_NOT_GRANTABLE');
    expect(problem.message_key).toBe('admin.role.participant_self_service');
  });

  it('does not call Cognito twice for a repeated Idempotency-Key', async () => {
    cognitoCreate.mockClear();
    const adminId = await insertPerson({
      email: `inviteidem.${randomUUID()}@example.com`,
      givenName: 'Olga',
      familyName: 'Admin',
      dob: '1975-01-01',
      profileStatus: 'complete',
      role: 'oc_admin',
    });
    const token = fake.issueToken({ personId: adminId, roles: ['oc_admin'] });
    const email = `once.${randomUUID()}@example.com`;
    const key = randomUUID();
    const payload = {
      email,
      givenName: 'Once',
      familyName: 'Only',
      roleCode: 'finance',
    };
    const first = await api('/v1/admin/people/invite', {
      method: 'POST',
      headers: mutationHeaders(token, key),
      body: JSON.stringify(payload),
    });
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { id: string };
    const second = await api('/v1/admin/people/invite', {
      method: 'POST',
      headers: mutationHeaders(token, key),
      body: JSON.stringify(payload),
    });
    expect(second.status).toBe(201);
    const secondBody = (await second.json()) as { id: string };
    expect(secondBody.id).toBe(firstBody.id);
    expect(cognitoCreate).toHaveBeenCalledTimes(1);
  });

  it('surfaces USER_ALREADY_EXISTS when the pool already has the email', async () => {
    cognitoCreate.mockReset();
    cognitoCreate.mockRejectedValueOnce(
      new CognitoAdminError('UsernameExistsException', 'admin.invite.already_exists'),
    );
    const adminId = await insertPerson({
      email: `inviteexists.${randomUUID()}@example.com`,
      givenName: 'Olga',
      familyName: 'Admin',
      dob: '1975-01-01',
      profileStatus: 'complete',
      role: 'oc_admin',
    });
    const token = fake.issueToken({ personId: adminId, roles: ['oc_admin'] });
    const res = await api('/v1/admin/people/invite', {
      method: 'POST',
      headers: mutationHeaders(token),
      body: JSON.stringify({
        email: `dup.${randomUUID()}@example.com`,
        givenName: 'Dup',
        familyName: 'User',
        roleCode: 'oc_staff',
      }),
    });
    expect(res.status).toBe(409);
    const problem = (await res.json()) as { code: string; message_key?: string };
    expect(problem.code).toBe('USER_ALREADY_EXISTS');
    expect(problem.message_key).toBe('admin.invite.already_exists');
    cognitoCreate.mockReset();
    cognitoCreate.mockImplementation(async (args: { email: string }) => ({
      sub: `sub-${args.email}`,
    }));
  });
});

describe('admin invite resend', () => {
  async function ocAdminToken(): Promise<string> {
    const adminId = await insertPerson({
      email: `resendadmin.${randomUUID()}@example.com`,
      givenName: 'Olga',
      familyName: 'Admin',
      dob: '1975-01-01',
      profileStatus: 'complete',
      role: 'oc_admin',
    });
    return fake.issueToken({ personId: adminId, roles: ['oc_admin'] });
  }

  it('calls Cognito with the existing username and writes only an audit row', async () => {
    cognitoResend.mockClear();
    cognitoCreate.mockClear();
    const token = await ocAdminToken();
    const email = `stuck.${randomUUID()}@example.com`;
    const personId = await insertPerson({
      email,
      givenName: 'Riya',
      familyName: 'Stuck',
      profileStatus: 'placeholder',
      idpSubject: `sub-${email}`,
      role: 'oc_staff',
    });
    const before = await pool.query<{
      email: string | null;
      given_name: string;
      family_name: string;
      date_of_birth: string;
      profile_status: string;
      idp_subject: string | null;
      updated_at: Date;
    }>(
      `SELECT email::text AS email, given_name, family_name, date_of_birth::text AS date_of_birth,
              profile_status, idp_subject, updated_at
         FROM core.person
        WHERE id = $1`,
      [personId],
    );

    const res = await api(`/v1/admin/people/${personId}/invite/resend`, {
      method: 'POST',
      headers: mutationHeaders(token),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(cognitoResend).toHaveBeenCalledTimes(1);
    expect(cognitoResend).toHaveBeenCalledWith({ username: email });
    expect(cognitoCreate).not.toHaveBeenCalled();

    const after = await pool.query(
      `SELECT email::text AS email, given_name, family_name, date_of_birth::text AS date_of_birth,
              profile_status, idp_subject, updated_at
         FROM core.person
        WHERE id = $1`,
      [personId],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);

    const log = await pool.query<{ action: string }>(
      `SELECT action FROM audit.activity_log WHERE subject_id = $1 AND action = 'user.invite_resend'`,
      [personId],
    );
    expect(log.rows).toHaveLength(1);
  });

  it('refuses a person who has already signed in and does not call Cognito', async () => {
    cognitoResend.mockClear();
    const token = await ocAdminToken();
    const email = `signedin.${randomUUID()}@example.com`;
    const personId = await insertPerson({
      email,
      givenName: 'Signed',
      familyName: 'In',
      dob: '1990-01-01',
      profileStatus: 'complete',
      idpSubject: `sub-${email}`,
      role: 'oc_staff',
    });
    const res = await api(`/v1/admin/people/${personId}/invite/resend`, {
      method: 'POST',
      headers: mutationHeaders(token),
    });
    expect(res.status).toBe(409);
    const problem = (await res.json()) as { code: string; message_key?: string };
    expect(problem.code).toBe('INVITE_ALREADY_ACCEPTED');
    expect(problem.message_key).toBe('admin.invite.already_accepted');
    expect(cognitoResend).not.toHaveBeenCalled();
  });

  it('refuses PERSON_NOT_FOUND when the person is absent', async () => {
    cognitoResend.mockClear();
    const token = await ocAdminToken();
    const res = await api(`/v1/admin/people/${randomUUID()}/invite/resend`, {
      method: 'POST',
      headers: mutationHeaders(token),
    });
    expect(res.status).toBe(404);
    const problem = (await res.json()) as { code: string };
    expect(problem.code).toBe('PERSON_NOT_FOUND');
    expect(cognitoResend).not.toHaveBeenCalled();
  });

  it('does not send twice for a repeated Idempotency-Key', async () => {
    cognitoResend.mockClear();
    const token = await ocAdminToken();
    const email = `once.${randomUUID()}@example.com`;
    const personId = await insertPerson({
      email,
      givenName: 'Once',
      familyName: 'Resend',
      profileStatus: 'placeholder',
      idpSubject: `sub-${email}`,
      role: 'oc_staff',
    });
    const key = randomUUID();
    const first = await api(`/v1/admin/people/${personId}/invite/resend`, {
      method: 'POST',
      headers: mutationHeaders(token, key),
    });
    expect(first.status).toBe(200);
    const second = await api(`/v1/admin/people/${personId}/invite/resend`, {
      method: 'POST',
      headers: mutationHeaders(token, key),
    });
    expect(second.status).toBe(200);
    expect(cognitoResend).toHaveBeenCalledTimes(1);
    expect(cognitoResend).toHaveBeenCalledWith({ username: email });

    const log = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM audit.activity_log
        WHERE subject_id = $1 AND action = 'user.invite_resend'`,
      [personId],
    );
    expect(log.rows[0]?.n).toBe('1');
  });

  it('surfaces Cognito FORCE_CHANGE_PASSWORD refusal as INVITE_ALREADY_ACCEPTED', async () => {
    cognitoResend.mockReset();
    cognitoResend.mockRejectedValueOnce(
      new CognitoAdminError('InviteAlreadyAccepted', 'admin.invite.already_accepted'),
    );
    const token = await ocAdminToken();
    const email = `force.${randomUUID()}@example.com`;
    const personId = await insertPerson({
      email,
      givenName: 'Almost',
      familyName: 'In',
      profileStatus: 'placeholder',
      idpSubject: `sub-${email}`,
      role: 'oc_staff',
    });
    const res = await api(`/v1/admin/people/${personId}/invite/resend`, {
      method: 'POST',
      headers: mutationHeaders(token),
    });
    expect(res.status).toBe(409);
    const problem = (await res.json()) as { code: string; message_key?: string };
    expect(problem.code).toBe('INVITE_ALREADY_ACCEPTED');
    expect(problem.message_key).toBe('admin.invite.already_accepted');
    cognitoResend.mockReset();
    cognitoResend.mockImplementation(async () => undefined);
  });
});

describe('admin purge invited user', () => {
  beforeEach(() => {
    cognitoDelete.mockClear();
    cognitoCallOrder.length = 0;
  });

  async function ocAdminToken(): Promise<string> {
    const adminId = await insertPerson({
      email: `purgeadmin.${randomUUID()}@example.com`,
      givenName: 'Olga',
      familyName: 'Admin',
      dob: '1975-01-01',
      profileStatus: 'complete',
      role: 'oc_admin',
    });
    return fake.issueToken({ personId: adminId, roles: ['oc_admin'] });
  }

  async function invitedPerson(emailPrefix = 'purgeable'): Promise<string> {
    const email = `${emailPrefix}.${randomUUID()}@example.com`;
    return insertPerson({
      email,
      givenName: 'Ivy',
      familyName: 'Invited',
      profileStatus: 'placeholder',
      idpSubject: `sub-${email}`,
      role: 'oc_staff',
    });
  }

  it('purges a clean invited user, removes roles and consents, and leaves audit rows', async () => {
    cognitoDelete.mockClear();
    cognitoCallOrder.length = 0;
    const token = await ocAdminToken();
    const email = `clean.${randomUUID()}@example.com`;
    const personId = await insertPerson({
      email,
      givenName: 'Clean',
      familyName: 'Invite',
      profileStatus: 'placeholder',
      idpSubject: `sub-${email}`,
      role: 'oc_staff',
    });
    await pool.query(
      `INSERT INTO core.consent (person_id, event_id, kind, granted, version, source)
       VALUES ($1, $2, 'marketing_email', true, 'v1', 'invite')`,
      [personId, eventId],
    );
    await pool.query(
      `INSERT INTO audit.activity_log (actor_id, actor_role, action, subject_type, subject_id, after)
       VALUES ($1, 'oc_admin', 'user.invite', 'person', $2, '{"email":"x"}'::jsonb)`,
      [personId, personId],
    );

    const res = await api(`/v1/admin/people/${personId}`, {
      method: 'DELETE',
      headers: mutationHeaders(token),
    });
    expect(res.status).toBe(204);
    expect(cognitoDelete).toHaveBeenCalledTimes(1);
    expect(cognitoDelete).toHaveBeenCalledWith({ username: email });
    expect(cognitoCallOrder).toEqual(['delete']);

    const person = await pool.query(`SELECT 1 FROM core.person WHERE id = $1`, [personId]);
    expect(person.rows).toHaveLength(0);
    const roles = await pool.query(`SELECT 1 FROM core.person_role WHERE person_id = $1`, [personId]);
    expect(roles.rows).toHaveLength(0);
    const consents = await pool.query(`SELECT 1 FROM core.consent WHERE person_id = $1`, [personId]);
    expect(consents.rows).toHaveLength(0);
    const audit = await pool.query(`SELECT 1 FROM audit.activity_log WHERE subject_id = $1`, [
      personId,
    ]);
    expect(audit.rows.length).toBeGreaterThan(0);
  });

  it('completes when Cognito reports the pool user is already gone', async () => {
    cognitoDelete.mockReset();
    cognitoDelete.mockImplementation(async () => undefined);
    const token = await ocAdminToken();
    const personId = await invitedPerson('orphan');
    const res = await api(`/v1/admin/people/${personId}`, {
      method: 'DELETE',
      headers: mutationHeaders(token),
    });
    expect(res.status).toBe(204);
    const person = await pool.query(`SELECT 1 FROM core.person WHERE id = $1`, [personId]);
    expect(person.rows).toHaveLength(0);
  });

  it('calls Cognito before deleting the database row', async () => {
    cognitoDelete.mockReset();
    cognitoCallOrder.length = 0;
    const token = await ocAdminToken();
    const email = `ordering.${randomUUID()}@example.com`;
    const personId = await insertPerson({
      email,
      givenName: 'Order',
      familyName: 'Check',
      profileStatus: 'placeholder',
      idpSubject: `sub-${email}`,
      role: 'oc_staff',
    });
    cognitoDelete.mockImplementation(async () => {
      const row = await pool.query(`SELECT 1 FROM core.person WHERE id = $1`, [personId]);
      expect(row.rows).toHaveLength(1);
    });
    const res = await api(`/v1/admin/people/${personId}`, {
      method: 'DELETE',
      headers: mutationHeaders(token),
    });
    expect(res.status).toBe(204);
    expect(cognitoCallOrder).toEqual(['delete']);
    cognitoDelete.mockReset();
    cognitoDelete.mockImplementation(async () => undefined);
  });

  it('refuses purge when the person has only a registration order', async () => {
    const token = await ocAdminToken();
    const personId = await invitedPerson('order');
    await pool.query(
      `INSERT INTO core.registration_order (event_id, payer_person_id)
       VALUES ($1, $2)`,
      [eventId, personId],
    );
    const res = await api(`/v1/admin/people/${personId}`, {
      method: 'DELETE',
      headers: mutationHeaders(token),
    });
    expect(res.status).toBe(422);
    const problem = (await res.json()) as { code: string; detail: string };
    expect(problem.code).toBe('PURGE_BLOCKED');
    expect(problem.detail).toContain('registration order');
    expect(cognitoDelete).not.toHaveBeenCalled();
  });

  it('refuses purge when the person has only a roster member row', async () => {
    const token = await ocAdminToken();
    const personId = await invitedPerson('roster');
    const roster = await pool.query<{ id: string }>(
      `INSERT INTO core.team_roster
         (event_id, sport_entry_product_id, name, visibility, matching_authority)
       VALUES ($1, $2, 'Purge Roster', 'members', 'captain')
       RETURNING id`,
      [eventId, productId],
    );
    const rosterId = roster.rows[0]?.id;
    if (!rosterId) throw new Error('roster insert failed');
    await pool.query(
      `INSERT INTO core.roster_member (roster_id, person_id, display_name, date_of_birth, position)
       VALUES ($1, $2, 'Roster Person', '1990-01-01', 1)`,
      [rosterId, personId],
    );
    const res = await api(`/v1/admin/people/${personId}`, {
      method: 'DELETE',
      headers: mutationHeaders(token),
    });
    expect(res.status).toBe(422);
    const problem = (await res.json()) as { code: string; detail: string };
    expect(problem.code).toBe('PURGE_BLOCKED');
    expect(problem.detail).toContain('team roster');
  });

  it('refuses purge when the person has only a payment intent', async () => {
    const token = await ocAdminToken();
    const personId = await invitedPerson('intent');
    const order = await pool.query<{ id: string }>(
      `INSERT INTO core.registration_order (event_id, payer_person_id)
       VALUES ($1, $2)
       RETURNING id`,
      [eventId, personId],
    );
    const orderId = order.rows[0]?.id;
    if (!orderId) throw new Error('order insert failed');
    await pool.query(
      `INSERT INTO core.payment_intent (order_id, payer_person_id, amount_minor)
       VALUES ($1, $2, 1000)`,
      [orderId, personId],
    );
    const res = await api(`/v1/admin/people/${personId}`, {
      method: 'DELETE',
      headers: mutationHeaders(token),
    });
    expect(res.status).toBe(422);
    const problem = (await res.json()) as { code: string; detail: string };
    expect(problem.code).toBe('PURGE_BLOCKED');
    expect(problem.detail).toContain('payment intent');
  });

  it('refuses purge when the person has only a payment allocation', async () => {
    const token = await ocAdminToken();
    const personId = await invitedPerson('allocation');
    const order = await pool.query<{ id: string }>(
      `INSERT INTO core.registration_order (event_id, payer_person_id)
       VALUES ($1, $2)
       RETURNING id`,
      [eventId, personId],
    );
    const orderId = order.rows[0]?.id;
    if (!orderId) throw new Error('order insert failed');
    const line = await pool.query<{ id: string }>(
      `INSERT INTO core.order_line
         (order_id, kind, description, unit_net_minor, net_minor, tax_rate_bp, tax_minor, tax_code, gross_minor)
       VALUES ($1, 'entry_fee', 'Entry', 1000, 1000, 0, 0, 'N1', 1000)
       RETURNING id`,
      [orderId],
    );
    const lineId = line.rows[0]?.id;
    if (!lineId) throw new Error('line insert failed');
    const intent = await pool.query<{ id: string }>(
      `INSERT INTO core.payment_intent (order_id, amount_minor)
       VALUES ($1, 1000)
       RETURNING id`,
      [orderId],
    );
    const intentId = intent.rows[0]?.id;
    if (!intentId) throw new Error('intent insert failed');
    await pool.query(
      `INSERT INTO core.payment_allocation
         (intent_id, order_line_id, amount_minor, net_minor, tax_minor)
       VALUES ($1, $2, 1000, 1000, 0)`,
      [intentId, lineId],
    );
    const res = await api(`/v1/admin/people/${personId}`, {
      method: 'DELETE',
      headers: mutationHeaders(token),
    });
    expect(res.status).toBe(422);
    const problem = (await res.json()) as { code: string; detail: string };
    expect(problem.code).toBe('PURGE_BLOCKED');
    expect(problem.detail).toContain('payment allocation');
  });

  it('refuses purge when the person has only a registration entry', async () => {
    const token = await ocAdminToken();
    const personId = await insertPerson({
      email: `entry.${randomUUID()}@example.com`,
      givenName: 'Entry',
      familyName: 'Holder',
      dob: '1990-01-01',
      profileStatus: 'complete',
    });
    const profileId = await insertAthleteProfile(personId);
    await insertEntry(profileId);
    const res = await api(`/v1/admin/people/${personId}`, {
      method: 'DELETE',
      headers: mutationHeaders(token),
    });
    expect(res.status).toBe(422);
    const problem = (await res.json()) as { code: string; detail: string };
    expect(problem.code).toBe('PURGE_BLOCKED');
    expect(problem.detail).toContain('registration entry');
  });

  it('refuses purge when the person has only accreditation', async () => {
    const token = await ocAdminToken();
    const personId = await invitedPerson('accred');
    await pool.query(
      `INSERT INTO core.accreditation
         (event_id, person_id, role, sport_name, status, valid_from, valid_until)
       VALUES ($1, $2, 'Staff', 'Operations', 'pending', '2027-09-17', '2027-09-26')`,
      [eventId, personId],
    );
    const res = await api(`/v1/admin/people/${personId}`, {
      method: 'DELETE',
      headers: mutationHeaders(token),
    });
    expect(res.status).toBe(422);
    const problem = (await res.json()) as { code: string; detail: string };
    expect(problem.code).toBe('PURGE_BLOCKED');
    expect(problem.detail).toContain('accreditation');
  });

  it('refuses purge when the person has only a roster selection row', async () => {
    const token = await ocAdminToken();
    const personId = await invitedPerson('selection');
    const roster = await pool.query<{ id: string }>(
      `INSERT INTO core.team_roster
         (event_id, sport_entry_product_id, name, visibility, matching_authority)
       VALUES ($1, $2, 'Selection Roster', 'members', 'captain')
       RETURNING id`,
      [eventId, productId],
    );
    const rosterId = roster.rows[0]?.id;
    if (!rosterId) throw new Error('roster insert failed');
    const version = await pool.query<{ id: string }>(
      `INSERT INTO core.roster_version (team_id, version_no, status)
       VALUES ($1, 1, 'draft')
       RETURNING id`,
      [rosterId],
    );
    const versionId = version.rows[0]?.id;
    if (!versionId) throw new Error('version insert failed');
    await pool.query(
      `INSERT INTO core.roster_selection
         (roster_version_id, person_id, display_name, date_of_birth, role, position, competes)
       VALUES ($1, $2, 'Selected', '1990-01-01', 'athlete', 1, true)`,
      [versionId, personId],
    );
    const res = await api(`/v1/admin/people/${personId}`, {
      method: 'DELETE',
      headers: mutationHeaders(token),
    });
    expect(res.status).toBe(422);
    const problem = (await res.json()) as { code: string; detail: string };
    expect(problem.code).toBe('PURGE_BLOCKED');
    expect(problem.detail).toContain('roster selection');
  });

  it('refuses purge when the person has only restricted data', async () => {
    const token = await ocAdminToken();
    const personId = await invitedPerson('restricted');
    await pool.query(
      `INSERT INTO core.protected_evidence_ref
         (person_id, event_id, kind, restricted_record_id)
       VALUES ($1, $2, 'identity', $3)`,
      [personId, eventId, randomUUID()],
    );
    const res = await api(`/v1/admin/people/${personId}`, {
      method: 'DELETE',
      headers: mutationHeaders(token),
    });
    expect(res.status).toBe(422);
    const problem = (await res.json()) as { code: string; detail: string };
    expect(problem.code).toBe('PURGE_BLOCKED');
    expect(problem.detail).toContain('restricted');
  });

  it('refuses purge when the person has only a retention hold', async () => {
    const token = await ocAdminToken();
    const personId = await invitedPerson('hold');
    const dpoId = await insertPerson({
      email: `dpo.${randomUUID()}@example.com`,
      givenName: 'Dana',
      familyName: 'Officer',
      profileStatus: 'complete',
      role: 'oc_admin',
    });
    await pool.query(
      `INSERT INTO core.retention_hold
         (person_id, subject_schema, subject_table, subject_id, reason_key, placed_by)
       VALUES ($1, 'core', 'person', $2, 'privacy.hold.legal', $3)`,
      [personId, personId, dpoId],
    );
    const res = await api(`/v1/admin/people/${personId}`, {
      method: 'DELETE',
      headers: mutationHeaders(token),
    });
    expect(res.status).toBe(422);
    const problem = (await res.json()) as { code: string; detail: string };
    expect(problem.code).toBe('PURGE_BLOCKED');
    expect(problem.detail).toContain('retention hold');
  });

  it('lists purgeable=true only for invited users with no obligations', async () => {
    const token = await ocAdminToken();
    const purgeableId = await invitedPerson('listed');
    const blockedId = await insertPerson({
      email: `blocked.${randomUUID()}@example.com`,
      givenName: 'Signed',
      familyName: 'In',
      dob: '1990-01-01',
      profileStatus: 'complete',
      role: 'oc_staff',
    });
    const res = await api('/v1/admin/people?limit=50', { headers: bearer(token) });
    expect(res.status).toBe(200);
    const page = (await res.json()) as {
      items: Array<{ id: string; purgeable: boolean; purgeBlockers: string[] }>;
    };
    const purgeable = page.items.find((item) => item.id === purgeableId);
    const blocked = page.items.find((item) => item.id === blockedId);
    expect(purgeable?.purgeable).toBe(true);
    expect(purgeable?.purgeBlockers).toEqual([]);
    expect(blocked?.purgeable).toBe(false);
    expect(blocked?.purgeBlockers).toContain('has_signed_in');
  });
});
