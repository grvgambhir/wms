import { Inject, Injectable } from '@nestjs/common';
import type {
  AthleteSummary,
  PartnerFilters,
  PartnerRequest,
  PartnerRequestStatus,
} from '@wms/domain';
import { z } from 'zod';
import type { Queryable } from '../common/idempotency/idempotency.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { pool } from '../db/pool';
import { refuse } from '../people/refuse';
import { deriveEntryCategory } from '../rules/entry-category';
import { headerKey, iso, requireUuid } from './helpers';

const sendBody = z.object({
  eventId: z.string().uuid(),
  categoryId: z.string().trim().min(1).max(80),
  toAthleteId: z.string().uuid(),
  entryId: z.string().uuid().optional(),
});

const respondBody = z.object({
  status: z.enum(['accepted', 'declined', 'cancelled']),
});

@Injectable()
export class PartnerService {
  constructor(@Inject(IdempotencyService) private readonly idempotency: IdempotencyService) {}

  async search(filters: PartnerFilters): Promise<AthleteSummary[]> {
    requireUuid(filters.eventId, 'partner.event.invalid');
    const query = filters.query?.trim() ?? '';
    const { rows } = await pool.query<{
      id: string;
      given_name: string;
      family_name: string;
      nationality: string | null;
      date_of_birth: Date | string;
      age: number;
    }>(
      `SELECT p.id,
              p.given_name,
              p.family_name,
              p.nationality,
              p.date_of_birth,
              EXTRACT(YEAR FROM age(ev.age_reference_date, p.date_of_birth))::int AS age
         FROM core.athlete_profile ap
         JOIN core.person p ON p.id = ap.person_id
         JOIN core.event ev ON ev.id = ap.event_id
        WHERE ap.event_id = $1
          AND ($2 = '' OR p.given_name ILIKE $3 OR p.family_name ILIKE $3)
        ORDER BY p.family_name, p.given_name
        LIMIT 50`,
      [filters.eventId, query, `%${query}%`],
    );
    return rows.map((row) => ({
      id: row.id,
      firstName: row.given_name,
      lastName: row.family_name,
      nationalityCountryCode: row.nationality ?? '',
      dateOfBirth:
        row.date_of_birth instanceof Date
          ? row.date_of_birth.toISOString().slice(0, 10)
          : String(row.date_of_birth).slice(0, 10),
      age: Number(row.age),
    }));
  }

  async send(args: {
    personId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    body: unknown;
  }): Promise<PartnerRequest> {
    const parsed = sendBody.safeParse(args.body ?? {});
    if (!parsed.success) refuse('VALIDATION_ERROR', 'partner.request.invalid');

    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: 'POST /v1/partner-requests',
        body: parsed.data,
        mode: 'local',
      },
      async (tx) => {
        const from = await this.profileId(tx, args.personId, parsed.data.eventId);
        const to = await this.profileId(tx, parsed.data.toAthleteId, parsed.data.eventId);
        if (from === to) refuse('VALIDATION_ERROR', 'partner.request.self');
        const entryId = await this.invitingDoublesEntry(
          tx,
          from,
          args.personId,
          parsed.data.eventId,
          parsed.data.entryId,
        );
        const existing = await tx.query<{
          id: string;
          event_id: string;
          category_id: string;
          from_id: string;
          to_id: string;
          status: PartnerRequestStatus;
          created_at: Date;
        }>(
          `SELECT id, event_id, category_id, from_id, to_id, entry_id, status, created_at
             FROM core.partner_request
            WHERE event_id = $1 AND category_id = $2 AND from_id = $3 AND to_id = $4
              AND status IN ('pending', 'accepted')`,
          [parsed.data.eventId, parsed.data.categoryId, from, to],
        );
        if (existing.rows[0]) {
          return {
            status: 200,
            body: this.view(existing.rows[0], args.personId, parsed.data.toAthleteId),
          };
        }
        const inserted = await tx.query<{
          id: string;
          event_id: string;
          category_id: string;
          from_id: string;
          to_id: string;
          status: PartnerRequestStatus;
          created_at: Date;
        }>(
          `INSERT INTO core.partner_request (event_id, category_id, from_id, to_id, entry_id, status)
           VALUES ($1, $2, $3, $4, $5, 'pending')
           RETURNING id, event_id, category_id, from_id, to_id, entry_id, status, created_at`,
          [parsed.data.eventId, parsed.data.categoryId, from, to, entryId],
        );
        return {
          status: 200,
          body: this.view(inserted.rows[0]!, args.personId, parsed.data.toAthleteId),
        };
      },
    );
    return result.body as PartnerRequest;
  }

  async respond(args: {
    requestId: string;
    personId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
    body: unknown;
  }): Promise<PartnerRequest> {
    const requestId = requireUuid(args.requestId, 'partner.request.invalid');
    const parsed = respondBody.safeParse(args.body ?? {});
    if (!parsed.success) refuse('VALIDATION_ERROR', 'partner.request.invalid');

    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/partner-requests/${requestId}`,
        body: parsed.data,
        mode: 'local',
      },
      async (tx) => {
        const current = await tx.query<{
          id: string;
          event_id: string;
          category_id: string;
          from_id: string;
          to_id: string;
          status: PartnerRequestStatus;
          created_at: Date;
          from_person: string;
          to_person: string;
          entry_id: string | null;
        }>(
          `SELECT r.id, r.event_id, r.category_id, r.from_id, r.to_id, r.entry_id, r.status, r.created_at,
                  fp.person_id AS from_person, tp.person_id AS to_person
             FROM core.partner_request r
             JOIN core.athlete_profile fp ON fp.id = r.from_id
             JOIN core.athlete_profile tp ON tp.id = r.to_id
            WHERE r.id = $1
              AND tp.person_id = $2`,
          [requestId, args.personId],
        );
        const row = current.rows[0];
        if (!row || row.status !== 'pending')
          refuse('PARTNER_REQUEST_NOT_FOUND', 'partner.request.not_found');

        if (parsed.data.status === 'accepted') {
          const entry = await this.loadInvitingEntry(
            tx,
            row.entry_id,
            row.from_id,
            row.to_id,
            row.event_id,
          );
          await this.assertEntryCanChangePartner(tx, entry.id);
          if (entry.locked_at && entry.locked_at.getTime() <= Date.now()) {
            refuse('ROSTER_LOCKED', 'roster.locked');
          }
          const category = await deriveEntryCategory(tx, {
            ruleVersionId: entry.rule_version_id,
            eventId: row.event_id,
            members: [
              {
                id: row.from_person,
                personId: row.from_person,
                name: `${entry.owner_given} ${entry.owner_family}`,
                dob: this.date(entry.owner_dob),
                role: 'entrant',
              },
              {
                id: row.to_person,
                personId: row.to_person,
                name: `${entry.partner_given} ${entry.partner_family}`,
                dob: this.date(entry.partner_dob),
                role: 'partner',
              },
            ],
          });
          if (!category.id || !category.name || category.derivation.blockedBy.length > 0) {
            refuse('CATEGORY_NOT_ELIGIBLE', 'partner.request.category_not_eligible');
          }
          await tx.query(
            `UPDATE core.registration_entry
                SET partner_profile_id = $2,
                    original_category_id = COALESCE(original_category_id, $3),
                    original_category_name = COALESCE(original_category_name, $4),
                    current_category_id = $3,
                    current_category_name = $4,
                    category_change_reason = CASE WHEN current_category_id IS DISTINCT FROM $3
                                                  THEN 'partner.accepted' ELSE NULL END,
                    updated_at = now()
              WHERE id = $1`,
            [entry.id, row.to_id, category.id, category.name],
          );
          if (entry.current_category_id !== category.id) {
            await tx.query(
              `INSERT INTO core.category_audit
                 (entry_id, from_category, to_category, trigger, member_ages, reason)
               VALUES ($1, $2, $3, 'partner_accepted', $4::jsonb, 'partner.accepted')`,
              [
                entry.id,
                entry.current_category_id,
                category.id,
                JSON.stringify(category.memberAges),
              ],
            );
          }
          await tx.query(
            `UPDATE core.partner_request
                SET status = 'cancelled', responded_at = now()
              WHERE event_id = $1
                AND from_id = $2
                AND status = 'pending'
                AND id <> $3`,
            [row.event_id, row.from_id, requestId],
          );
        }

        const updated = await tx.query<{
          id: string;
          event_id: string;
          category_id: string;
          from_id: string;
          to_id: string;
          status: PartnerRequestStatus;
          created_at: Date;
        }>(
          `UPDATE core.partner_request
              SET status = $2, responded_at = now()
            WHERE id = $1
          RETURNING id, event_id, category_id, from_id, to_id, status, created_at`,
          [requestId, parsed.data.status],
        );
        return {
          status: 200,
          body: this.view(updated.rows[0]!, row.from_person, row.to_person),
        };
      },
    );
    return result.body as PartnerRequest;
  }

  async list(eventId: string, personId: string): Promise<PartnerRequest[]> {
    requireUuid(eventId, 'partner.event.invalid');
    const { rows } = await pool.query<{
      id: string;
      event_id: string;
      category_id: string;
      from_id: string;
      to_id: string;
      status: PartnerRequestStatus;
      created_at: Date;
      from_person: string;
      to_person: string;
    }>(
      `SELECT r.id, r.event_id, r.category_id, r.from_id, r.to_id, r.status, r.created_at,
              fp.person_id AS from_person, tp.person_id AS to_person
         FROM core.partner_request r
         JOIN core.athlete_profile fp ON fp.id = r.from_id
         JOIN core.athlete_profile tp ON tp.id = r.to_id
        WHERE r.event_id = $1
          AND (fp.person_id = $2 OR tp.person_id = $2)
        ORDER BY r.created_at DESC`,
      [eventId, personId],
    );
    return rows.map((row) => this.view(row, row.from_person, row.to_person));
  }

  async listIncomingInvitations(personId: string): Promise<
    Array<{
      kind: 'partner';
      id: string;
      eventId: string;
      categoryId: string;
      fromName: string;
      createdAt: string;
    }>
  > {
    const { rows } = await pool.query<{
      id: string;
      event_id: string;
      category_id: string;
      created_at: Date | string;
      given_name: string;
      family_name: string;
    }>(
      `SELECT r.id, r.event_id, r.category_id, r.created_at, sender.given_name, sender.family_name
         FROM core.partner_request r
         JOIN core.athlete_profile recipient ON recipient.id = r.to_id
         JOIN core.athlete_profile sender_profile ON sender_profile.id = r.from_id
         JOIN core.person sender ON sender.id = sender_profile.person_id
        WHERE recipient.person_id = $1 AND r.status = 'pending'
        ORDER BY r.created_at DESC`,
      [personId],
    );
    return rows.map((row) => ({
      kind: 'partner' as const,
      id: row.id,
      eventId: row.event_id,
      categoryId: row.category_id,
      fromName: `${row.given_name} ${row.family_name}`,
      createdAt: iso(row.created_at),
    }));
  }

  async cancelPendingOutgoing(args: {
    eventId: string;
    personId: string;
    exceptToAthleteId?: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
  }): Promise<void> {
    requireUuid(args.eventId, 'partner.event.invalid');
    await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: 'POST /v1/partner-requests/cancel-outgoing',
        body: { eventId: args.eventId, exceptToAthleteId: args.exceptToAthleteId ?? null },
        mode: 'local',
      },
      async (tx) => {
        const from = await this.profileId(tx, args.personId, args.eventId);
        await tx.query(
          `UPDATE core.partner_request r
              SET status = 'cancelled', responded_at = now()
            WHERE r.event_id = $1
              AND r.from_id = $2
              AND r.status = 'pending'
              AND ($3::uuid IS NULL OR r.to_id <> (
                    SELECT ap.id FROM core.athlete_profile ap
                     WHERE ap.person_id = $3 AND ap.event_id = $1
                  ))`,
          [args.eventId, from, args.exceptToAthleteId ?? null],
        );
        return { status: 200, body: { ok: true } };
      },
    );
  }

  private async profileId(tx: Queryable, personId: string, eventId: string): Promise<string> {
    const { rows } = await tx.query<{ id: string }>(
      `SELECT id FROM core.athlete_profile WHERE person_id = $1 AND event_id = $2`,
      [personId, eventId],
    );
    const id = rows[0]?.id;
    if (!id) refuse('ATHLETE_NOT_FOUND', 'partner.athlete.not_found');
    return id;
  }

  private async invitingDoublesEntry(
    tx: Queryable,
    profileId: string,
    personId: string,
    eventId: string,
    requestedEntryId?: string,
  ): Promise<string> {
    const { rows } = await tx.query<{ id: string }>(
      `SELECT entry.id
         FROM core.registration_entry entry
         JOIN core.sport_entry_product product ON product.id = entry.sport_entry_product_id
         JOIN core.athlete_profile profile ON profile.id = entry.athlete_profile_id
        WHERE entry.athlete_profile_id = $1
          AND entry.event_id = $2
          AND profile.person_id = $3
          AND product.participant_type = 'doubles'
          AND ($4::uuid IS NULL OR entry.id = $4)
        ORDER BY entry.created_at DESC
        LIMIT 1`,
      [profileId, eventId, personId, requestedEntryId ?? null],
    );
    const entry = rows[0]?.id;
    if (!entry) refuse('REGISTRATION_ENTRY_NOT_FOUND', 'partner.request.entry_not_found');
    return entry;
  }

  private async loadInvitingEntry(
    tx: Queryable,
    requestEntryId: string | null,
    fromProfileId: string,
    toProfileId: string,
    eventId: string,
  ): Promise<{
    id: string;
    rule_version_id: string;
    current_category_id: string | null;
    locked_at: Date | null;
    owner_given: string;
    owner_family: string;
    owner_dob: Date | string;
    partner_given: string;
    partner_family: string;
    partner_dob: Date | string;
  }> {
    const { rows } = await tx.query<{
      id: string;
      rule_version_id: string;
      current_category_id: string | null;
      locked_at: Date | null;
      owner_given: string;
      owner_family: string;
      owner_dob: Date | string;
      partner_given: string;
      partner_family: string;
      partner_dob: Date | string;
    }>(
      `SELECT entry.id, entry.rule_version_id, entry.current_category_id, team.locked_at,
              owner.given_name AS owner_given, owner.family_name AS owner_family,
              owner.date_of_birth AS owner_dob,
              partner.given_name AS partner_given, partner.family_name AS partner_family,
              partner.date_of_birth AS partner_dob
         FROM core.registration_entry entry
         JOIN core.sport_entry_product product ON product.id = entry.sport_entry_product_id
         JOIN core.athlete_profile owner_profile ON owner_profile.id = entry.athlete_profile_id
         JOIN core.person owner ON owner.id = owner_profile.person_id
         JOIN core.athlete_profile partner_profile ON partner_profile.id = $3
         JOIN core.person partner ON partner.id = partner_profile.person_id
         LEFT JOIN core.team_roster team ON team.id = entry.team_roster_id
        WHERE ($1::uuid IS NULL OR entry.id = $1)
          AND entry.athlete_profile_id = $2
          AND entry.event_id = $4
          AND product.participant_type = 'doubles'
        ORDER BY entry.created_at DESC
        LIMIT 1 FOR UPDATE OF entry`,
      [requestEntryId ?? null, fromProfileId, toProfileId, eventId],
    );
    const entry = rows[0];
    if (!entry) refuse('REGISTRATION_ENTRY_NOT_FOUND', 'partner.request.entry_not_found');
    return entry;
  }

  private async assertEntryCanChangePartner(db: Queryable, entryId: string): Promise<void> {
    const listed = await db.query<{ id: string }>(
      `SELECT line.id
         FROM core.start_list_entry line
         JOIN core.start_list list ON list.id = line.start_list_id
        WHERE line.registration_entry_id = $1 AND list.status <> 'draft'
        LIMIT 1`,
      [entryId],
    );
    if (listed.rows[0]) refuse('START_LIST_NOT_DRAFT', 'competition.start_list.not_draft');
  }

  private date(value: Date | string): string {
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  }

  private view(
    row: {
      id: string;
      event_id: string;
      category_id: string;
      status: PartnerRequestStatus;
      created_at: Date;
    },
    fromPersonId: string,
    toPersonId: string,
  ): PartnerRequest {
    return {
      id: row.id,
      eventId: row.event_id,
      categoryId: row.category_id,
      fromAthleteId: fromPersonId,
      toAthleteId: toPersonId,
      status: row.status,
      createdAt: iso(row.created_at),
    };
  }
}
