import { Inject, Injectable } from '@nestjs/common';
import type { TeamRoster, TeamRosterMember } from '@wms/domain';
import { z } from 'zod';
import type { Queryable } from '../common/idempotency/idempotency.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { pool } from '../db/pool';
import { refuse } from '../people/refuse';
import {
  accreditationUnmet,
  asDate,
  captainOwns,
  categoryForVersion,
  headerKey,
  inviteTokenHash,
  iso,
  mapRosterRole,
  requireUuid,
} from './helpers';

const inviteBody = z.object({
  inviteePersonId: z.string().uuid(),
  sportEntryProductId: z.string().uuid(),
  role: z.string().trim().min(1).max(64).optional(),
});

const substitutionBody = z.object({
  // Absent for a pure addition (REG-03 "youngest member added" story, e.g. A2's extra
  // basketball player) — present for a like-for-like swap (REG-06/CMP-04, e.g. A3's rower).
  // Either way this is a *proposal*: nothing on the live roster moves until an OC approves it.
  replacePersonId: z.string().uuid().optional(),
  withPersonId: z.string().uuid(),
});

type EntryRow = {
  id: string;
  event_id: string;
  team_roster_id: string | null;
  sport_entry_product_id: string;
  original_roster_version_id: string | null;
  current_roster_version_id: string | null;
  original_category_id: string | null;
  original_category_name: string | null;
  current_category_id: string | null;
  current_category_name: string | null;
  rule_version_id: string;
};

@Injectable()
export class RosterService {
  constructor(@Inject(IdempotencyService) private readonly idempotency: IdempotencyService) {}

  /**
   * A team is born from its participant-owned entry, never from a seeded roster id.  The
   * draft version is intentionally created at the same time as the durable team: accepted
   * invitations can change only that draft selection until an official publishes it.
   */
  async createTeam(args: {
    entryId: string;
    personId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
  }): Promise<{ id: string; teamId: string; status: 'draft' }> {
    const entryId = requireUuid(args.entryId, 'registration.entry.invalid');
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/me/entries/${entryId}/team`,
        body: { entryId },
        mode: 'local',
      },
      async (tx) => {
        const owned = await tx.query<{
          id: string;
          event_id: string;
          sport_entry_product_id: string;
          team_roster_id: string | null;
          athlete_profile_id: string;
          participant_type: string;
          product_name: string;
          given_name: string;
          family_name: string;
          date_of_birth: Date | string;
        }>(
          `SELECT e.id, e.event_id, e.sport_entry_product_id, e.team_roster_id,
                  e.athlete_profile_id, sp.participant_type, sp.name AS product_name,
                  p.given_name, p.family_name, p.date_of_birth
             FROM core.registration_entry e
             JOIN core.athlete_profile ap ON ap.id = e.athlete_profile_id
             JOIN core.person p ON p.id = ap.person_id
             JOIN core.sport_entry_product sp ON sp.id = e.sport_entry_product_id
            WHERE e.id = $1 AND ap.person_id = $2
            FOR UPDATE OF e`,
          [entryId, args.personId],
        );
        const entry = owned.rows[0];
        // Token scoping is deliberately part of the lookup, so another athlete receives the
        // same non-existence response as an unknown entry.
        if (!entry) refuse('REGISTRATION_ENTRY_NOT_FOUND', 'roster.entry.not_found');
        if (entry.participant_type === 'individual') {
          // `VALIDATION_ERROR` is the shared client-facing code; this is a domain-state
          // rejection, not malformed JSON, so its established route contract is 422.
          refuse('VALIDATION_ERROR', 'roster.team.individual_product', undefined, 422);
        }
        if (entry.team_roster_id) {
          refuse('TEAM_ALREADY_EXISTS', 'roster.team.already_exists', {
            teamId: entry.team_roster_id,
          });
        }
        await this.assertEntryConfigurable(tx, entry.id);
        // The captain is also a competing member.  Its roster role must use the policy just
        // like an invitation does: hard-coding `captain` here leaves a crew policy requiring
        // (for example) four `rower` roles permanently one member short.
        const initialRole = await this.initialRosterRole(tx, entry.id);

        const team = await tx.query<{ id: string }>(
          `INSERT INTO core.team_roster
             (event_id, captain_profile_id, sport_entry_product_id, name, visibility, matching_authority)
           VALUES ($1, $2, $3, $4, 'members', 'captain')
           RETURNING id`,
          [
            entry.event_id,
            entry.athlete_profile_id,
            entry.sport_entry_product_id,
            `${entry.family_name} ${entry.product_name}`,
          ],
        );
        const teamId = team.rows[0]!.id;
        const member = await tx.query<{ id: string }>(
          `INSERT INTO core.roster_member
             (roster_id, person_id, display_name, date_of_birth, role, position)
           VALUES ($1, $2, $3, $4, $5, 1)
           RETURNING id`,
          [
            teamId,
            args.personId,
            `${entry.given_name} ${entry.family_name}`,
            asDate(entry.date_of_birth),
            initialRole,
          ],
        );
        const version = await tx.query<{ id: string }>(
          `INSERT INTO core.roster_version (team_id, version_no, status)
           VALUES ($1, 1, 'draft') RETURNING id`,
          [teamId],
        );
        await tx.query(
          `INSERT INTO core.roster_selection
             (roster_version_id, person_id, membership_id, display_name, date_of_birth,
              role, position, competes)
           VALUES ($1, $2, $3, $4, $5, $6, 1, true)`,
          [
            version.rows[0]!.id,
            args.personId,
            member.rows[0]!.id,
            `${entry.given_name} ${entry.family_name}`,
            asDate(entry.date_of_birth),
            initialRole,
          ],
        );
        await tx.query(
          `UPDATE core.registration_entry SET team_roster_id = $2, updated_at = now() WHERE id = $1`,
          [entry.id, teamId],
        );
        return { status: 201, body: { id: entry.id, teamId, status: 'draft' as const } };
      },
    );
    return result.body as { id: string; teamId: string; status: 'draft' };
  }

  async getTeamRoster(args: {
    entryId: string;
    productId: string;
    personId: string;
  }): Promise<TeamRoster> {
    const entryId = requireUuid(args.entryId, 'registration.entry.invalid');
    const productId = requireUuid(args.productId, 'registration.product.invalid');
    const { rows } = await pool.query<
      EntryRow & { team_name: string | null; event_id: string; created_at: Date; updated_at: Date }
    >(
      `SELECT re.id,
              re.event_id,
              re.team_roster_id,
              re.sport_entry_product_id,
              re.original_roster_version_id,
              re.current_roster_version_id,
              re.original_category_id,
              re.original_category_name,
              re.current_category_id,
              re.current_category_name,
              re.rule_version_id,
              tr.name AS team_name,
              tr.created_at,
              re.updated_at
         FROM core.registration_entry re
         JOIN core.athlete_profile ap ON ap.id = re.athlete_profile_id
         JOIN core.team_roster tr ON tr.id = re.team_roster_id
        WHERE re.id = $1
          AND re.sport_entry_product_id = $2
          AND (ap.person_id = $3 OR EXISTS (
            SELECT 1 FROM core.roster_member member
             WHERE member.roster_id = tr.id AND member.person_id = $3
          ))`,
      [entryId, productId, args.personId],
    );
    const entry = rows[0];
    if (!entry?.team_roster_id) refuse('TEAM_ROSTER_NOT_FOUND', 'roster.not_found');
    return this.view(pool, entry);
  }

  async invite(args: {
    teamId: string;
    personId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    body: unknown;
  }): Promise<{ id: string; teamId: string; status: string }> {
    const teamId = requireUuid(args.teamId, 'roster.team.invalid');
    const parsed = inviteBody.safeParse(args.body ?? {});
    if (!parsed.success) refuse('VALIDATION_ERROR', 'roster.invite.invalid');

    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/teams/${teamId}/invitations`,
        body: parsed.data,
        mode: 'local',
      },
      async (tx) => {
        const team = await tx.query<{
          event_id: string;
          sport_entry_product_id: string;
          locked_at: Date | null;
        }>(
          `SELECT tr.event_id, tr.sport_entry_product_id, tr.locked_at
             FROM core.team_roster tr
             JOIN core.athlete_profile ap ON ap.id = tr.captain_profile_id
            WHERE tr.id = $1 AND ap.person_id = $2`,
          [teamId, args.personId],
        );
        const teamRow = team.rows[0];
        if (!teamRow) refuse('ACTOR_NOT_PERMITTED', 'roster.invite.not_captain');
        if (teamRow.locked_at && teamRow.locked_at.getTime() <= Date.now()) {
          refuse('ROSTER_LOCKED', 'roster.locked');
        }
        if (teamRow.sport_entry_product_id !== parsed.data.sportEntryProductId) {
          refuse('VALIDATION_ERROR', 'roster.invite.product_mismatch');
        }
        const role = await this.invitationRole(tx, teamId, parsed.data.role);
        const inserted = await tx.query<{ id: string; status: string }>(
          `INSERT INTO core.team_invitation
             (team_id, sport_entry_product_id, token_hash, expires_at,
              inviter_person_id, invitee_person_id, role, status)
           VALUES ($1, $2, $3, now() + interval '14 days', $4, $5, $6, 'pending')
           RETURNING id, status`,
          [
            teamId,
            parsed.data.sportEntryProductId,
            inviteTokenHash(),
            args.personId,
            parsed.data.inviteePersonId,
            role,
          ],
        );
        const row = inserted.rows[0]!;
        return { status: 200, body: { id: row.id, teamId, status: row.status } };
      },
    );
    return result.body as { id: string; teamId: string; status: string };
  }

  async respondInvitation(args: {
    invitationId: string;
    personId: string;
    decision: 'accepted' | 'declined';
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
  }): Promise<{ id: string; status: string }> {
    const invitationId = requireUuid(args.invitationId, 'roster.invite.invalid');
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/team-invitations/${invitationId}/${args.decision}`,
        body: { invitationId, decision: args.decision },
        mode: 'local',
      },
      async (tx) => {
        const current = await tx.query<{
          id: string;
          team_id: string;
          event_id: string;
          inviter_person_id: string;
          invitee_person_id: string | null;
          role: string | null;
          status: string;
          locked_at: Date | null;
        }>(
          `SELECT invitation.id, invitation.team_id, invitation.inviter_person_id,
                  invitation.invitee_person_id, invitation.role, invitation.status,
                  team.event_id, team.locked_at
             FROM core.team_invitation invitation
             JOIN core.team_roster team ON team.id = invitation.team_id
            WHERE invitation.id = $1 AND invitation.invitee_person_id = $2`,
          [invitationId, args.personId],
        );
        const row = current.rows[0];
        if (!row || row.status !== 'pending')
          refuse('TEAM_INVITATION_NOT_FOUND', 'roster.invite.not_found');

        if (args.decision === 'accepted') {
          if (row.locked_at && row.locked_at.getTime() <= Date.now()) {
            refuse('ROSTER_LOCKED', 'roster.locked');
          }
          await tx.query(
            `UPDATE core.team_invitation
                SET status = 'cancelled'
              WHERE inviter_person_id = $1
                AND status = 'pending'
                AND id <> $2`,
            [row.inviter_person_id, invitationId],
          );
          await tx.query(
            `UPDATE core.team_invitation
                SET status = 'accepted', accepted_by = $2, accepted_at = now()
              WHERE id = $1
                AND invitee_person_id = $2
                AND status = 'pending'`,
            [invitationId, args.personId],
          );
          await this.addAcceptedMember(tx, {
            teamId: row.team_id,
            eventId: row.event_id,
            personId: args.personId,
            role: row.role ?? 'member',
          });
        } else {
          await tx.query(
            `UPDATE core.team_invitation
                SET status = 'declined', accepted_by = $2, accepted_at = now()
              WHERE id = $1
                AND invitee_person_id = $2
                AND status = 'pending'`,
            [invitationId, args.personId],
          );
        }
        return { status: 200, body: { id: invitationId, status: args.decision } };
      },
    );
    return result.body as { id: string; status: string };
  }

  async cancelInvitation(args: {
    invitationId: string;
    personId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
  }): Promise<{ id: string; status: 'cancelled' }> {
    const invitationId = requireUuid(args.invitationId, 'roster.invite.invalid');
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/team-invitations/${invitationId}/cancel`,
        body: { invitationId },
        mode: 'local',
      },
      async (tx) => {
        const updated = await tx.query<{ id: string }>(
          `UPDATE core.team_invitation invitation
              SET status = 'cancelled'
             FROM core.team_roster team
             JOIN core.athlete_profile captain ON captain.id = team.captain_profile_id
            WHERE invitation.id = $1 AND invitation.team_id = team.id
              AND captain.person_id = $2 AND invitation.status = 'pending'
            RETURNING invitation.id`,
          [invitationId, args.personId],
        );
        if (!updated.rows[0]) refuse('TEAM_INVITATION_NOT_FOUND', 'roster.invite.not_found');
        return { status: 200, body: { id: invitationId, status: 'cancelled' as const } };
      },
    );
    return result.body as { id: string; status: 'cancelled' };
  }

  async listIncomingInvitations(personId: string): Promise<
    Array<{
      kind: 'team';
      id: string;
      teamId: string;
      teamName: string;
      sportEntryProductId: string;
      fromName: string;
      role: string | null;
      expiresAt: string;
      createdAt: string;
    }>
  > {
    const { rows } = await pool.query<{
      id: string;
      team_id: string;
      team_name: string | null;
      sport_entry_product_id: string;
      role: string | null;
      expires_at: Date | string;
      created_at: Date | string;
      given_name: string;
      family_name: string;
    }>(
      `SELECT invitation.id, invitation.team_id, team.name AS team_name,
              invitation.sport_entry_product_id, invitation.role,
              invitation.expires_at, invitation.created_at,
              inviter.given_name, inviter.family_name
         FROM core.team_invitation invitation
         JOIN core.team_roster team ON team.id = invitation.team_id
         JOIN core.person inviter ON inviter.id = invitation.inviter_person_id
        WHERE invitation.invitee_person_id = $1
          AND invitation.status = 'pending'
          AND invitation.expires_at > now()
        ORDER BY invitation.created_at DESC`,
      [personId],
    );
    return rows.map((row) => ({
      kind: 'team' as const,
      id: row.id,
      teamId: row.team_id,
      teamName: row.team_name ?? 'Team',
      sportEntryProductId: row.sport_entry_product_id,
      fromName: `${row.given_name} ${row.family_name}`,
      role: row.role,
      expiresAt: iso(row.expires_at),
      createdAt: iso(row.created_at),
    }));
  }

  async proposeSubstitution(args: {
    entryId: string;
    personId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    body: unknown;
  }): Promise<{
    id: string;
    fromCategoryId: string;
    toCategoryId: string;
    fromCategoryName: string;
    toCategoryName: string;
    ruleVersionId: string;
  }> {
    const entryId = requireUuid(args.entryId, 'registration.entry.invalid');
    const parsed = substitutionBody.safeParse(args.body ?? {});
    if (!parsed.success) refuse('VALIDATION_ERROR', 'roster.substitution.invalid');

    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/registration-entries/${entryId}/roster-substitutions`,
        body: parsed.data,
        mode: 'local',
      },
      async (tx) => {
        const entry = await this.loadOwnedCrewEntry(tx, entryId, args.personId);
        if (!(await captainOwns(tx, entry.team_roster_id, args.personId))) {
          refuse('ACTOR_NOT_PERMITTED', 'roster.substitution.not_captain');
        }
        if (!entry.current_roster_version_id)
          refuse('TEAM_ROSTER_NOT_FOUND', 'roster.version.missing');
        const fromCategory = await categoryForVersion(tx, entryId, entry.current_roster_version_id);
        const proposedId = parsed.data.replacePersonId
          ? await this.cloneVersionWithSwap(
              tx,
              entry.team_roster_id,
              entry.current_roster_version_id,
              parsed.data.replacePersonId,
              parsed.data.withPersonId,
            )
          : await this.cloneVersionWithAddition(
              tx,
              entry.team_roster_id,
              entry.current_roster_version_id,
              parsed.data.withPersonId,
            );
        await tx.query(`UPDATE core.roster_version SET status = 'proposed' WHERE id = $1`, [
          proposedId,
        ]);
        const toCategory = await categoryForVersion(tx, entryId, proposedId);
        // CMP-04. This used to be the literal string `accreditation.unchanged`, which asserted
        // the one thing the requirement asks us to check. It is now computed — the incoming
        // athlete usually has no badge, and that is precisely what the proposer needs to see
        // before an official is asked to approve anything.
        const unmet = await accreditationUnmet(tx, proposedId, entry.event_id);
        const inserted = await tx.query<{ id: string }>(
          `INSERT INTO core.roster_substitution
             (entry_id, from_version_id, proposed_version_id, status,
              fee_impact_minor, refund_impact_minor, from_category_id, to_category_id,
              accreditation_unmet, accreditation_impact_key, proposed_by, message_key)
           VALUES ($1, $2, $3, 'proposed', 0, 0, $4, $5, $7::text[], $8, $6,
                   'roster.substitution.proposed')
           RETURNING id`,
          [
            entryId,
            entry.current_roster_version_id,
            proposedId,
            fromCategory.id,
            toCategory.id,
            args.personId,
            unmet,
            unmet.length === 0 ? 'accreditation.unchanged' : 'accreditation.review_required',
          ],
        );
        return {
          status: 200,
          body: {
            id: inserted.rows[0]!.id,
            fromCategoryId: fromCategory.id,
            toCategoryId: toCategory.id,
            fromCategoryName: fromCategory.name,
            toCategoryName: toCategory.name,
            ruleVersionId: fromCategory.ruleVersionId,
          },
        };
      },
    );
    return result.body as {
      id: string;
      fromCategoryId: string;
      toCategoryId: string;
      fromCategoryName: string;
      toCategoryName: string;
      ruleVersionId: string;
    };
  }

  /**
   * The OC's work queue for proposed team-roster changes (additions and substitutions alike —
   * `core.roster_substitution` doesn't distinguish them, only the version it points at does).
   * Nothing here is trusted from proposal time: the category shown is recomputed against the
   * versions the row points at, same as `revalidateSubstitution`, so a stale proposal can't
   * show a category that no longer matches the roster it would actually apply.
   */
  async reviewQueue(): Promise<{
    items: Array<{
      id: string;
      entryId: string;
      teamName: string;
      sportName: string;
      productName: string;
      captainName?: string;
      fromCategoryName: string;
      toCategoryName: string;
      proposedAt: string;
      accreditationUnmet: string[];
    }>;
  }> {
    const { rows } = await pool.query<{
      id: string;
      entry_id: string;
      from_version_id: string;
      proposed_version_id: string;
      proposed_at: Date | string;
      accreditation_unmet: string[] | null;
      team_name: string | null;
      sport_name: string;
      product_name: string;
      captain_given_name: string | null;
      captain_family_name: string | null;
    }>(
      `SELECT s.id, s.entry_id, s.from_version_id, s.proposed_version_id, s.proposed_at,
              s.accreditation_unmet, tr.name AS team_name,
              sport.name AS sport_name, product.name AS product_name,
              captain.given_name AS captain_given_name, captain.family_name AS captain_family_name
         FROM core.roster_substitution s
         JOIN core.registration_entry re ON re.id = s.entry_id
         JOIN core.sport_entry_product product ON product.id = re.sport_entry_product_id
         JOIN core.sport sport ON sport.id = product.sport_id
         LEFT JOIN core.team_roster tr ON tr.id = re.team_roster_id
         LEFT JOIN core.athlete_profile captain_profile ON captain_profile.id = tr.captain_profile_id
         LEFT JOIN core.person captain ON captain.id = captain_profile.person_id
        WHERE s.status = 'proposed'
        ORDER BY s.proposed_at ASC`,
    );
    const items = [];
    for (const row of rows) {
      const [fromCategory, toCategory] = await Promise.all([
        categoryForVersion(pool, row.entry_id, row.from_version_id),
        categoryForVersion(pool, row.entry_id, row.proposed_version_id),
      ]);
      items.push({
        id: row.id,
        entryId: row.entry_id,
        teamName: row.team_name ?? row.product_name,
        sportName: row.sport_name,
        productName: row.product_name,
        ...(row.captain_given_name
          ? { captainName: `${row.captain_given_name} ${row.captain_family_name ?? ''}`.trim() }
          : {}),
        fromCategoryName: fromCategory.name,
        toCategoryName: toCategory.name,
        proposedAt: iso(row.proposed_at),
        accreditationUnmet: row.accreditation_unmet ?? [],
      });
    }
    return { items };
  }

  async publishVersion(args: {
    versionId: string;
    actorId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
  }): Promise<{ id: string; status: string }> {
    const versionId = requireUuid(args.versionId, 'roster.version.invalid');
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/roster-versions/${versionId}/publish`,
        body: { versionId },
        mode: 'local',
      },
      async (tx) => {
        const updated = await tx
          .query<{ id: string; status: string; team_id: string }>(
            `UPDATE core.roster_version
              SET status = 'approved',
                  approved_by = $2,
                  approved_at = now(),
                  published_by = $2,
                  published_at = now()
            WHERE id = $1
              AND status = 'draft'
          RETURNING id, status, team_id`,
            [versionId, args.actorId],
          )
          .catch((err: { message?: string }) => {
            // CMP-04: after the lock a team cannot publish a fresh roster — the only way to
            // change a locked crew is a revalidated substitution. Refused by
            // `roster_version_respects_lock`; translated here.
            if (err.message === 'roster.locked') refuse('ROSTER_LOCKED', 'roster.locked');
            throw err;
          });
        const row = updated.rows[0];
        if (!row) refuse('TEAM_ROSTER_NOT_FOUND', 'roster.version.not_draft');
        const entries = await tx.query<{
          id: string;
          original_category_id: string | null;
          current_category_id: string | null;
        }>(
          `SELECT id, original_category_id, current_category_id
             FROM core.registration_entry
            WHERE team_roster_id = $1
            FOR UPDATE`,
          [row.team_id],
        );
        for (const entry of entries.rows) {
          // Do not repeat the age/mean/sum maths here: `categoryForVersion` adapts the
          // selection to `rules/load.deriveLoaded`, the same authoritative derivation used
          // by previews and entry creation.
          const category = await categoryForVersion(tx, entry.id, versionId);
          await tx.query(
            `UPDATE core.registration_entry
                SET original_roster_version_id = COALESCE(original_roster_version_id, $2),
                    current_roster_version_id = $2,
                    original_category_id = COALESCE(original_category_id, $3),
                    original_category_name = COALESCE(original_category_name, $4),
                    current_category_id = $3,
                    current_category_name = $4,
                    category_change_reason = CASE WHEN current_category_id IS DISTINCT FROM $3
                                                  THEN 'roster.published' ELSE NULL END,
                    updated_at = now()
              WHERE id = $1`,
            [entry.id, versionId, category.id, category.name],
          );
          if (entry.current_category_id !== category.id) {
            await tx.query(
              `INSERT INTO core.category_audit
                 (entry_id, from_category, to_category, trigger, member_ages, approved_by, reason)
               VALUES ($1, $2, $3, 'roster_published', $4::jsonb, $5, 'roster.published')`,
              [
                entry.id,
                entry.current_category_id,
                category.id,
                JSON.stringify(category.memberAges),
                args.actorId,
              ],
            );
          }
        }
        return { status: 200, body: { id: row.id, status: row.status } };
      },
    );
    return result.body as { id: string; status: string };
  }

  /**
   * CMP-04 — the revalidation a Games-time substitution cannot be approved without.
   *
   * WHY THIS IS A SEPARATE ACT AND NOT PART OF APPROVAL
   * ---------------------------------------------------
   * Folding the checks into `approve` would make them run, and would also make them
   * invisible: the official clicking approve would never see what the checks found, only
   * whether the button worked. CMP-04 asks for *controlled* substitutions, and control means
   * a person looked at the two answers before deciding.
   *
   * So this computes and records; approval refuses without it. The refusal is a database
   * constraint (`games_time_substitution_is_revalidated`), not an `if` in this method, because
   * `core.approve_roster_substitution` can be called from a migration, a seed or a future
   * endpoint that has never heard of this service.
   *
   * Both halves are recomputed here rather than trusted from proposal time — between the
   * proposal and the Games the crew\'s accreditation can be revoked and the roster can change.
   */
  async revalidateSubstitution(args: {
    substitutionId: string;
    actorId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
  }): Promise<{
    id: string;
    gamesTime: boolean;
    fromCategoryId: string;
    toCategoryId: string;
    categoryWouldChange: boolean;
    accreditationUnmet: string[];
    approvable: boolean;
  }> {
    const substitutionId = requireUuid(args.substitutionId, 'roster.substitution.invalid');
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/roster-substitutions/${substitutionId}/revalidate`,
        body: { substitutionId },
        mode: 'local',
      },
      async (tx) => {
        const sub = await tx.query<{
          entry_id: string;
          from_version_id: string;
          proposed_version_id: string;
          status: string;
          event_id: string;
          locked_at: Date | null;
        }>(
          `SELECT s.entry_id, s.from_version_id, s.proposed_version_id, s.status,
                  re.event_id, tr.locked_at
             FROM core.roster_substitution s
             JOIN core.registration_entry re ON re.id = s.entry_id
             LEFT JOIN core.team_roster tr ON tr.id = re.team_roster_id
            WHERE s.id = $1`,
          [substitutionId],
        );
        const row = sub.rows[0];
        if (!row) refuse('TEAM_ROSTER_NOT_FOUND', 'roster.substitution.not_found');
        if (row.status !== 'proposed') {
          refuse('ILLEGAL_STATUS_TRANSITION', 'roster.substitution.not_proposed');
        }

        const fromCategory = await categoryForVersion(tx, row.entry_id, row.from_version_id);
        const toCategory = await categoryForVersion(tx, row.entry_id, row.proposed_version_id);
        const unmet = await accreditationUnmet(tx, row.proposed_version_id, row.event_id);

        await tx.query(
          `UPDATE core.roster_substitution
              SET from_category_id = $2,
                  to_category_id = $3,
                  accreditation_unmet = $4::text[],
                  accreditation_impact_key = $5,
                  category_revalidated_at = now(),
                  accreditation_revalidated_at = now(),
                  revalidated_by = $6
            WHERE id = $1`,
          [
            substitutionId,
            fromCategory.id,
            toCategory.id,
            unmet,
            unmet.length === 0 ? 'accreditation.unchanged' : 'accreditation.review_required',
            args.actorId,
          ],
        );

        const gamesTime = Boolean(row.locked_at && row.locked_at.getTime() <= Date.now());
        const categoryWouldChange = fromCategory.id !== toCategory.id;
        return {
          status: 200,
          body: {
            id: substitutionId,
            gamesTime,
            fromCategoryId: fromCategory.id,
            toCategoryId: toCategory.id,
            categoryWouldChange,
            accreditationUnmet: unmet,
            // Reported, not enforced. The refusal that matters is the constraint on approval;
            // this tells the screen whether to offer the button.
            approvable: !gamesTime || (!categoryWouldChange && unmet.length === 0),
          },
        };
      },
    );
    return result.body as {
      id: string;
      gamesTime: boolean;
      fromCategoryId: string;
      toCategoryId: string;
      categoryWouldChange: boolean;
      accreditationUnmet: string[];
      approvable: boolean;
    };
  }

  async approveSubstitution(args: {
    substitutionId: string;
    actorId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
  }): Promise<{
    id: string;
    currentRosterVersionId: string;
    currentCategoryId: string;
    currentCategoryName: string;
  }> {
    const substitutionId = requireUuid(args.substitutionId, 'roster.substitution.invalid');
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/roster-substitutions/${substitutionId}/approve`,
        body: { substitutionId },
        mode: 'local',
      },
      async (tx) => {
        const sub = await tx.query<{ entry_id: string; proposed_version_id: string }>(
          `SELECT entry_id, proposed_version_id FROM core.roster_substitution WHERE id = $1`,
          [substitutionId],
        );
        const row = sub.rows[0];
        if (!row) refuse('TEAM_ROSTER_NOT_FOUND', 'roster.substitution.not_found');
        try {
          await tx.query(`SELECT core.approve_roster_substitution($1, $2)`, [
            substitutionId,
            args.actorId,
          ]);
        } catch (err) {
          // CMP-04's three Games-time refusals. They are constraints rather than checks in
          // this method, so this only has to translate them into something the desk can read.
          const constraint = (err as { constraint?: string }).constraint;
          if (constraint === 'games_time_substitution_is_revalidated') {
            refuse('REVALIDATION_REQUIRED', 'roster.substitution.revalidation_required');
          }
          if (constraint === 'games_time_accreditation_is_clean') {
            refuse('ACCREDITATION_NOT_VALID', 'roster.substitution.accreditation_unmet');
          }
          if (constraint === 'games_time_award_category_survives') {
            // Not a substitution at all once the field is set — the crew would be racing in a
            // category it is not entered in. The override is the exception queue, which is
            // dual-signed and leaves a record; silently allowing it here would not be.
            refuse('CATEGORY_WOULD_CHANGE', 'roster.substitution.category_would_change');
          }
          throw err;
        }
        const category = await categoryForVersion(tx, row.entry_id, row.proposed_version_id);
        await tx.query(
          `UPDATE core.registration_entry
              SET current_category_id = $2,
                  current_category_name = $3,
                  updated_at = now()
            WHERE id = $1`,
          [row.entry_id, category.id, category.name],
        );
        return {
          status: 200,
          body: {
            id: substitutionId,
            currentRosterVersionId: row.proposed_version_id,
            currentCategoryId: category.id,
            currentCategoryName: category.name,
          },
        };
      },
    );
    return result.body as {
      id: string;
      currentRosterVersionId: string;
      currentCategoryId: string;
      currentCategoryName: string;
    };
  }

  async lockTeam(args: {
    teamId: string;
    actorId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
  }): Promise<{ id: string; lockedAt: string }> {
    const teamId = requireUuid(args.teamId, 'roster.team.invalid');
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/teams/${teamId}/lock`,
        body: { teamId },
        mode: 'local',
      },
      async (tx) => {
        const updated = await tx.query<{ locked_at: Date }>(
          `UPDATE core.team_roster SET locked_at = now() WHERE id = $1 RETURNING locked_at`,
          [teamId],
        );
        const lockedAt = updated.rows[0]?.locked_at;
        if (!lockedAt) refuse('TEAM_ROSTER_NOT_FOUND', 'roster.not_found');
        await tx.query(
          `INSERT INTO audit.activity_log
             (actor_id, actor_role, action, subject_type, subject_id, after)
           VALUES ($1, 'oc_staff', 'roster.lock', 'team_roster', $2, $3::jsonb)`,
          [args.actorId, teamId, JSON.stringify({ lockedAt: iso(lockedAt) })],
        );
        return { status: 200, body: { id: teamId, lockedAt: iso(lockedAt) } };
      },
    );
    return result.body as { id: string; lockedAt: string };
  }

  private async loadOwnedCrewEntry(
    db: Queryable,
    entryId: string,
    personId: string,
  ): Promise<EntryRow & { team_roster_id: string }> {
    const { rows } = await db.query<EntryRow>(
      `SELECT re.id, re.event_id, re.team_roster_id, re.sport_entry_product_id,
              re.original_roster_version_id, re.current_roster_version_id,
              re.original_category_id, re.original_category_name,
              re.current_category_id, re.current_category_name, re.rule_version_id
         FROM core.registration_entry re
         JOIN core.athlete_profile ap ON ap.id = re.athlete_profile_id
        WHERE re.id = $1
          AND ap.person_id = $2`,
      [entryId, personId],
    );
    const row = rows[0];
    if (!row?.team_roster_id) refuse('TEAM_ROSTER_NOT_FOUND', 'roster.not_found');
    return { ...row, team_roster_id: row.team_roster_id };
  }

  private async cloneVersionWithSwap(
    db: Queryable,
    teamId: string,
    fromVersionId: string,
    replacePersonId: string,
    withPersonId: string,
  ): Promise<string> {
    const nextNo = await db.query<{ n: number }>(
      `SELECT COALESCE(MAX(version_no), 0) + 1 AS n FROM core.roster_version WHERE team_id = $1`,
      [teamId],
    );
    const created = await db.query<{ id: string }>(
      `INSERT INTO core.roster_version (team_id, version_no, status, supersedes)
       VALUES ($1, $2, 'draft', $3)
       RETURNING id`,
      [teamId, nextNo.rows[0]?.n ?? 1, fromVersionId],
    );
    const versionId = created.rows[0]?.id;
    if (!versionId) refuse('TEAM_ROSTER_NOT_FOUND', 'roster.version.create_failed');
    const replacement = await db.query<{
      id: string;
      person_id: string;
      display_name: string;
      date_of_birth: Date | string;
      role: string;
    }>(
      `SELECT id, person_id, display_name, date_of_birth, role
         FROM core.roster_member
        WHERE roster_id = $1 AND person_id = $2`,
      [teamId, withPersonId],
    );
    const incoming = replacement.rows[0];
    if (!incoming) refuse('ROSTER_MEMBER_NOT_FOUND', 'roster.member.not_found');

    const fromRows = await db.query<{
      person_id: string;
      membership_id: string | null;
      display_name: string;
      date_of_birth: Date | string;
      role: string;
      position: number;
      competes: boolean;
    }>(
      `SELECT person_id, membership_id, display_name, date_of_birth, role, position, competes
         FROM core.roster_selection
        WHERE roster_version_id = $1
        ORDER BY position`,
      [fromVersionId],
    );
    const outgoing = fromRows.rows.find((row) => row.person_id === replacePersonId);
    if (!outgoing) refuse('ROSTER_MEMBER_NOT_FOUND', 'roster.member.not_on_version');
    for (const row of fromRows.rows) {
      const isOutgoing = row.person_id === replacePersonId;
      const isIncoming = row.person_id === withPersonId;
      await db.query(
        `INSERT INTO core.roster_selection
           (roster_version_id, person_id, membership_id, display_name, date_of_birth,
            role, position, competes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        isOutgoing
          ? [
              versionId,
              incoming.person_id,
              incoming.id,
              incoming.display_name,
              incoming.date_of_birth,
              outgoing.role === 'coxswain' ? 'coxswain' : outgoing.role,
              row.position,
              true,
            ]
          : isIncoming
            ? [
                versionId,
                outgoing.person_id,
                outgoing.membership_id,
                outgoing.display_name,
                outgoing.date_of_birth,
                'reserve',
                row.position,
                false,
              ]
            : [
                versionId,
                row.person_id,
                row.membership_id,
                row.display_name,
                row.date_of_birth,
                row.role,
                row.position,
                row.competes,
              ],
      );
    }
    if (!fromRows.rows.some((row) => row.person_id === withPersonId)) {
      const maxPos = Math.max(0, ...fromRows.rows.map((row) => row.position));
      await db.query(
        `INSERT INTO core.roster_selection
           (roster_version_id, person_id, membership_id, display_name, date_of_birth,
            role, position, competes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, false)`,
        [
          versionId,
          outgoing.person_id,
          outgoing.membership_id,
          outgoing.display_name,
          outgoing.date_of_birth,
          'reserve',
          maxPos + 1,
        ],
      );
    }
    return versionId;
  }

  /**
   * A2's story: nobody leaves, someone joins — the youngest-member/crew-average recalculation
   * still needs a proposed version an OC can approve, it just has one more competing row than
   * the version it was cloned from instead of a swapped one.
   */
  private async cloneVersionWithAddition(
    db: Queryable,
    teamId: string,
    fromVersionId: string,
    withPersonId: string,
  ): Promise<string> {
    const nextNo = await db.query<{ n: number }>(
      `SELECT COALESCE(MAX(version_no), 0) + 1 AS n FROM core.roster_version WHERE team_id = $1`,
      [teamId],
    );
    const created = await db.query<{ id: string }>(
      `INSERT INTO core.roster_version (team_id, version_no, status, supersedes)
       VALUES ($1, $2, 'draft', $3)
       RETURNING id`,
      [teamId, nextNo.rows[0]?.n ?? 1, fromVersionId],
    );
    const versionId = created.rows[0]?.id;
    if (!versionId) refuse('TEAM_ROSTER_NOT_FOUND', 'roster.version.create_failed');

    const incoming = await db.query<{
      id: string;
      person_id: string;
      display_name: string;
      date_of_birth: Date | string;
      role: string;
    }>(
      `SELECT id, person_id, display_name, date_of_birth, role
         FROM core.roster_member
        WHERE roster_id = $1 AND person_id = $2`,
      [teamId, withPersonId],
    );
    const added = incoming.rows[0];
    if (!added) refuse('ROSTER_MEMBER_NOT_FOUND', 'roster.member.not_found');

    const fromRows = await db.query<{
      person_id: string;
      membership_id: string | null;
      display_name: string;
      date_of_birth: Date | string;
      role: string;
      position: number;
      competes: boolean;
    }>(
      `SELECT person_id, membership_id, display_name, date_of_birth, role, position, competes
         FROM core.roster_selection
        WHERE roster_version_id = $1
        ORDER BY position`,
      [fromVersionId],
    );
    if (fromRows.rows.some((row) => row.person_id === withPersonId)) {
      refuse('VALIDATION_ERROR', 'roster.member.already_competing');
    }
    for (const row of fromRows.rows) {
      await db.query(
        `INSERT INTO core.roster_selection
           (roster_version_id, person_id, membership_id, display_name, date_of_birth,
            role, position, competes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          versionId,
          row.person_id,
          row.membership_id,
          row.display_name,
          row.date_of_birth,
          row.role,
          row.position,
          row.competes,
        ],
      );
    }
    const maxPos = Math.max(0, ...fromRows.rows.map((row) => row.position));
    // `reserve_does_not_compete` refuses a competing row with role='reserve' — and that is
    // exactly what core.roster_member.role says for a candidate nobody has selected yet. A
    // joining member takes a playing role, never the bench label they wore before they joined,
    // so borrow the role already on the version rather than the one still sitting on the bench.
    const competingRole =
      fromRows.rows.find((row) => row.competes && row.role !== 'coxswain')?.role ?? 'player';
    await db.query(
      `INSERT INTO core.roster_selection
         (roster_version_id, person_id, membership_id, display_name, date_of_birth,
          role, position, competes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
      [
        versionId,
        added.person_id,
        added.id,
        added.display_name,
        added.date_of_birth,
        added.role === 'reserve' ? competingRole : added.role,
        maxPos + 1,
      ],
    );
    return versionId;
  }

  /**
   * An entry copied into an approved or published start list is no longer an editable draft.
   * `saveEntry` uses the same check (via its start-list guard); keeping it here makes the team
   * create path obey the existing competition snapshot boundary rather than inventing a looser
   * participant-only lifecycle.
   */
  private async assertEntryConfigurable(db: Queryable, entryId: string): Promise<void> {
    const listed = await db.query<{ status: string }>(
      `SELECT list.status
         FROM core.start_list_entry line
         JOIN core.start_list list ON list.id = line.start_list_id
        WHERE line.registration_entry_id = $1
          AND list.status <> 'draft'
        LIMIT 1`,
      [entryId],
    );
    if (listed.rows[0]) refuse('START_LIST_NOT_DRAFT', 'competition.start_list.not_draft');
  }

  /** Resolve an invitation role from the entry's policy rather than product-name switches. */
  private async invitationRole(
    db: Queryable,
    teamId: string,
    requestedRole?: string,
  ): Promise<string> {
    const policy = await db.query<{ policy_version_id: string | null }>(
      `SELECT core.policy_version_for_entry(entry.id) AS policy_version_id
         FROM core.registration_entry entry
        WHERE entry.team_roster_id = $1
        ORDER BY entry.created_at
        LIMIT 1`,
      [teamId],
    );
    const policyVersionId = policy.rows[0]?.policy_version_id;
    if (!policyVersionId) return requestedRole ?? 'member';
    const rules = await db.query<{ role: string; min_count: number; have: number }>(
      `SELECT rule.role, rule.min_count,
              count(member.id)::int AS have
         FROM core.registration_policy_roster_rule rule
         LEFT JOIN core.roster_member member
           ON member.roster_id = $1 AND member.role = rule.role
        WHERE rule.policy_version_id = $2 AND rule.role IS NOT NULL
        GROUP BY rule.role, rule.min_count
        ORDER BY (count(member.id) < rule.min_count) DESC, rule.min_count DESC, rule.role`,
      [teamId, policyVersionId],
    );
    if (requestedRole) {
      if (rules.rows.length > 0 && !rules.rows.some((rule) => rule.role === requestedRole)) {
        refuse('VALIDATION_ERROR', 'roster.invite.role_not_configured');
      }
      return requestedRole;
    }
    // No policy role row means there is no configured role requirement. `member` is the
    // neutral data value and the view maps it to the generic player label.
    return rules.rows.find((rule) => rule.have < rule.min_count)?.role ?? 'member';
  }

  /** The initial captain fills a policy role too; captainship lives on `team_roster`. */
  private async initialRosterRole(db: Queryable, entryId: string): Promise<string> {
    const policy = await db.query<{ policy_version_id: string | null }>(
      `SELECT core.policy_version_for_entry($1) AS policy_version_id`,
      [entryId],
    );
    const policyVersionId = policy.rows[0]?.policy_version_id;
    if (!policyVersionId) return 'member';
    const rule = await db.query<{ role: string }>(
      `SELECT role
         FROM core.registration_policy_roster_rule
        WHERE policy_version_id = $1 AND role IS NOT NULL
        ORDER BY min_count DESC NULLS LAST, role
        LIMIT 1`,
      [policyVersionId],
    );
    return rule.rows[0]?.role ?? 'member';
  }

  private async addAcceptedMember(
    db: Queryable,
    args: { teamId: string; eventId: string; personId: string; role: string },
  ): Promise<void> {
    const person = await db.query<{
      given_name: string;
      family_name: string;
      date_of_birth: Date | string;
    }>(
      `SELECT p.given_name, p.family_name, p.date_of_birth
         FROM core.athlete_profile profile
         JOIN core.person p ON p.id = profile.person_id
        WHERE profile.person_id = $1 AND profile.event_id = $2`,
      [args.personId, args.eventId],
    );
    const athlete = person.rows[0];
    if (!athlete) refuse('ATHLETE_NOT_FOUND', 'roster.invite.athlete_not_found');

    let membership = await db.query<{ id: string; position: number }>(
      `SELECT id, position FROM core.roster_member WHERE roster_id = $1 AND person_id = $2`,
      [args.teamId, args.personId],
    );
    if (!membership.rows[0]) {
      membership = await db.query<{ id: string; position: number }>(
        `INSERT INTO core.roster_member
           (roster_id, person_id, display_name, date_of_birth, role, position)
         VALUES (
           $1, $2, $3, $4, $5,
           COALESCE((SELECT max(position) + 1 FROM core.roster_member WHERE roster_id = $1), 1)
         )
         RETURNING id, position`,
        [
          args.teamId,
          args.personId,
          `${athlete.given_name} ${athlete.family_name}`,
          asDate(athlete.date_of_birth),
          args.role,
        ],
      );
    }
    const versionId = await this.draftVersionForTeam(db, args.teamId);
    const selected = await db.query<{ id: string }>(
      `SELECT id FROM core.roster_selection WHERE roster_version_id = $1 AND person_id = $2`,
      [versionId, args.personId],
    );
    if (!selected.rows[0]) {
      await db.query(
        `INSERT INTO core.roster_selection
           (roster_version_id, person_id, membership_id, display_name, date_of_birth,
            role, position, competes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $6 <> 'reserve')`,
        [
          versionId,
          args.personId,
          membership.rows[0]!.id,
          `${athlete.given_name} ${athlete.family_name}`,
          asDate(athlete.date_of_birth),
          args.role,
          membership.rows[0]!.position,
        ],
      );
    }
  }

  /** A published version is frozen, so later accepted invitations fork a new draft. */
  private async draftVersionForTeam(db: Queryable, teamId: string): Promise<string> {
    const existing = await db.query<{ id: string }>(
      `SELECT id FROM core.roster_version
        WHERE team_id = $1 AND status = 'draft'
        ORDER BY version_no DESC LIMIT 1 FOR UPDATE`,
      [teamId],
    );
    if (existing.rows[0]) return existing.rows[0].id;

    const current = await db.query<{ current_roster_version_id: string | null }>(
      `SELECT current_roster_version_id FROM core.registration_entry
        WHERE team_roster_id = $1 ORDER BY created_at LIMIT 1 FOR UPDATE`,
      [teamId],
    );
    const currentVersion = current.rows[0]?.current_roster_version_id;
    const created = await db.query<{ id: string }>(
      `INSERT INTO core.roster_version (team_id, version_no, status, supersedes)
       VALUES (
         $1,
         COALESCE((SELECT max(version_no) + 1 FROM core.roster_version WHERE team_id = $1), 1),
         'draft', $2
       ) RETURNING id`,
      [teamId, currentVersion ?? null],
    );
    const versionId = created.rows[0]!.id;
    if (currentVersion) {
      await db.query(
        `INSERT INTO core.roster_selection
           (roster_version_id, person_id, membership_id, display_name, date_of_birth,
            role, position, competes)
         SELECT $1, person_id, membership_id, display_name, date_of_birth,
                role, position, competes
           FROM core.roster_selection WHERE roster_version_id = $2`,
        [versionId, currentVersion],
      );
    }
    return versionId;
  }

  private async view(
    db: Queryable,
    entry: EntryRow & { team_name: string | null; created_at: Date; updated_at: Date },
  ): Promise<TeamRoster> {
    const members = await db.query<{
      id: string;
      person_id: string;
      display_name: string;
      date_of_birth: Date | string;
      role: string;
    }>(
      `SELECT id, person_id, display_name, date_of_birth, role
         FROM core.roster_member
        WHERE roster_id = $1
        ORDER BY position`,
      [entry.team_roster_id],
    );
    const original = entry.original_roster_version_id
      ? await db.query<{ membership_id: string | null; person_id: string }>(
          `SELECT membership_id, person_id FROM core.roster_selection
            WHERE roster_version_id = $1 AND competes
            ORDER BY position`,
          [entry.original_roster_version_id],
        )
      : { rows: [] };
    const pending = await db.query<{
      id: string;
      invitee_person_id: string;
      role: string | null;
      created_at: Date | string;
      expires_at: Date | string;
    }>(
      `SELECT id, invitee_person_id, role, created_at, expires_at
         FROM core.team_invitation
        WHERE team_id = $1 AND status = 'pending' AND expires_at > now()
        ORDER BY created_at DESC`,
      [entry.team_roster_id],
    );
    const mapped: TeamRosterMember[] = members.rows.map((row) => ({
      id: row.id,
      athleteId: row.person_id,
      name: row.display_name,
      dob: asDate(row.date_of_birth),
      role: mapRosterRole(row.role),
    }));
    const originalIds = original.rows.map((row) => row.membership_id ?? row.person_id);
    const originalSet = new Set(original.rows.map((row) => row.person_id));
    return {
      id: entry.team_roster_id!,
      eventId: entry.event_id,
      registrationEntryId: entry.id,
      sportEntryProductId: entry.sport_entry_product_id,
      name: entry.team_name ?? 'Team',
      members: mapped,
      originalMemberIds: originalIds.filter(Boolean) as string[],
      substituteMemberIds: mapped
        .filter((member) => !originalSet.has(member.athleteId))
        .map((m) => m.id),
      originalCategoryId: entry.original_category_id ?? '',
      originalCategoryName: entry.original_category_name ?? '',
      createdAt: iso(entry.created_at),
      updatedAt: iso(entry.updated_at),
      pendingInvitations: pending.rows.map((invitation) => ({
        id: invitation.id,
        inviteePersonId: invitation.invitee_person_id,
        role: mapRosterRole(invitation.role ?? 'member'),
        createdAt: iso(invitation.created_at),
        expiresAt: iso(invitation.expires_at),
      })),
    };
  }
}
