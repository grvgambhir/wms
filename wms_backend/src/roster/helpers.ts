import { createHash, randomBytes } from 'node:crypto';
import type { Queryable } from '../common/idempotency/idempotency.service';
import { refuse } from '../people/refuse';
import { deriveEntryCategory } from '../rules/entry-category';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function headerKey(headers: { [key: string]: string | string[] | undefined }): string {
  const raw = headers['idempotency-key'];
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0].trim();
  return '';
}

export function requireUuid(value: string | undefined, key: string): string {
  if (!value || !UUID_RE.test(value)) refuse('VALIDATION_ERROR', key);
  return value;
}

export function iso(value: Date | string | null | undefined): string {
  if (value == null) return new Date(0).toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function asDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

export function inviteTokenHash(): string {
  return createHash('sha256').update(randomBytes(32)).digest('hex');
}

export function mapRosterRole(role: string): 'captain' | 'player' | 'rower' | 'coxswain' {
  if (role === 'captain' || role === 'rower' || role === 'coxswain') return role;
  return 'player';
}

export async function captainOwns(
  db: Queryable,
  teamId: string,
  personId: string,
): Promise<boolean> {
  const { rows } = await db.query<{ ok: number }>(
    `SELECT 1 AS ok
       FROM core.team_roster tr
       JOIN core.athlete_profile ap ON ap.id = tr.captain_profile_id
      WHERE tr.id = $1
        AND ap.person_id = $2`,
    [teamId, personId],
  );
  return Boolean(rows[0]);
}

export async function categoryForVersion(
  db: Queryable,
  entryId: string,
  rosterVersionId: string,
): Promise<{
  id: string;
  name: string;
  value: number;
  ruleVersionId: string;
  memberAges: Array<{ id: string; name: string; age: number; excluded: boolean }>;
}> {
  const entry = await db.query<{ rule_version_id: string; event_id: string }>(
    `SELECT rule_version_id, event_id FROM core.registration_entry WHERE id = $1`,
    [entryId],
  );
  const header = entry.rows[0];
  if (!header) refuse('REGISTRATION_ENTRY_NOT_FOUND', 'roster.entry.not_found');
  const members = await db.query<{
    person_id: string;
    display_name: string;
    date_of_birth: Date | string;
    role: string;
  }>(
    `SELECT person_id, display_name, date_of_birth, role
       FROM core.roster_selection
      WHERE roster_version_id = $1 AND competes
      ORDER BY position`,
    [rosterVersionId],
  );
  const derived = await deriveEntryCategory(db, {
    ruleVersionId: header.rule_version_id,
    eventId: header.event_id,
    members: members.rows.map((member) => ({
      id: member.person_id,
      personId: member.person_id,
      name: member.display_name,
      dob: asDate(member.date_of_birth),
      role: member.role,
    })),
  });
  if (!derived.id || !derived.name || derived.derivation.blockedBy.length > 0) {
    refuse('CATEGORY_NOT_ELIGIBLE', 'roster.category.no_band');
  }
  const ageDimension = derived.derivation.dimensions.find(
    (dimension) => dimension.attribute === 'age',
  );
  return {
    id: derived.id,
    name: derived.name,
    value: typeof ageDimension?.value === 'number' ? ageDimension.value : 0,
    ruleVersionId: header.rule_version_id,
    memberAges: derived.memberAges,
  };
}

/**
 * CMP-04's accreditation half. The rule lives in `core.roster_accreditation_unmet`, which
 * reuses the ACC-03 gate evaluator rather than restating which checks matter — so a gate the
 * OC adds to `accreditation_gate` starts applying to substitutions with no code change.
 *
 * An empty array means checked and clean. It is never `null` here: the database returns `{}`
 * for a clean crew, and "not checked" is expressed by not having called this at all.
 */
export async function accreditationUnmet(
  db: Queryable,
  rosterVersionId: string,
  eventId: string,
): Promise<string[]> {
  const { rows } = await db.query<{ unmet: string[] | null }>(
    `SELECT core.roster_accreditation_unmet($1, $2) AS unmet`,
    [rosterVersionId, eventId],
  );
  return rows[0]?.unmet ?? [];
}
