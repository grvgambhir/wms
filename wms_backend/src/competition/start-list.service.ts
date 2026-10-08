/**
 * CMP-01 (authoritative competition-entry dataset) and CMP-06 (publication and embargo).
 *
 * A START LIST IS A SNAPSHOT, NOT A QUERY
 * ---------------------------------------
 * Generating it live from `registration_entry` on every read is the tempting design and the
 * wrong one. Officials print it and athletes turn up against it; a late withdrawal must not
 * silently rewrite a document people are already holding. What changes after publication is a
 * NEW version that records what it corrects — which is why CMP-05 asks for
 * "approval/correction/version history".
 *
 * So names, categories and classes are COPIED into `start_list_entry` at build time, and the
 * list is frozen the moment it leaves draft.
 *
 * WHAT MUST NOT CROSS — AND THE GAP THIS LEAVES
 * ---------------------------------------------
 * The para CLASS belongs on a start list; an official cannot run a para event without it. The
 * medical evidence behind it never does (PRV-04, EVD-03).
 *
 * `core.para_class_projection` exists for exactly this: a redacted view exposing `class_code`,
 * `verification_status` and a boolean `evidence_exists` — never the documents. But it is
 * granted to **`classification_ro`**, a separate read-only role, and `app_rw` is deliberately
 * not a member. `restricted-governance.spec.ts` asserts that refusal.
 *
 * Granting the view to `app_rw` would make this query work and would quietly widen a boundary
 * that was drawn on purpose — the same mistake as the `GRANT restricted_rw TO app_rw` that was
 * refused earlier. So `class_code` is left NULL here, and populating it needs a third
 * connection authenticating as `classification_ro`, the same pattern the restricted evidence
 * module uses for `restricted_rw`. That role is currently `NOLOGIN`, so it needs a login and a
 * credential first. **That is a follow-on task, not something to work around.**
 */

import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { Queryable } from '../common/idempotency/idempotency.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { refuse } from '../people/refuse';

export type StartListStatus = 'draft' | 'approved' | 'published' | 'superseded';

export interface StartListEntryView {
  registrationEntryId: string;
  displayName: string;
  /** The field this entrant competes in — the combined key when the list is combined. */
  categoryName: string | null;
  /** CMP-03: the category the entrant is AWARDED in. Never the combined field. */
  awardCategoryName: string | null;
  classCode: string | null;
  teamName: string | null;
  clubOrNation: string | null;
  positionLabel: string | null;
  ordinal: number;
}

export interface CombinationSummary {
  id: string;
  combinedKey: string;
  sourceKeys: string[];
  /** The published explanation CMP-03 asks for — an i18n key, rendered in the reader's language. */
  reasonKey: string;
}

export interface StartListView {
  id: string;
  eventId: string;
  sportEntryProductId: string;
  categoryName: string | null;
  /** Set when this list is a combined field. Null for an ordinary single-category list. */
  combination: CombinationSummary | null;
  versionNo: number;
  supersedes: string | null;
  status: StartListStatus;
  embargoUntil: string | null;
  correctionReasonKey: string | null;
  contentHash: string | null;
  publishedAt: string | null;
  entries: StartListEntryView[];
}

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

function headerKey(headers: { [key: string]: string | string[] | undefined }): string {
  const raw = headers['idempotency-key'];
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0].trim();
  return '';
}

@Injectable()
export class StartListService {
  constructor(
    private readonly pool: Pool,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  /**
   * Builds a DRAFT list from the entries that are actually competing.
   *
   * Only `confirmed` entries. A draft or unpaid entry on a start list tells an official
   * someone is racing who has not completed registration.
   */
  async build(args: {
    sportEntryProductId: string;
    categoryName: string | null;
    actorId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
  }): Promise<StartListView> {
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/start-lists`,
        body: {
          sportEntryProductId: args.sportEntryProductId,
          categoryName: args.categoryName,
        },
        mode: 'local',
      },
      async (tx) => {
        const product = await tx.query<{ event_id: string }>(
          `SELECT event_id FROM core.sport_entry_product WHERE id = $1`,
          [args.sportEntryProductId],
        );
        if (!product.rows[0]) refuse('PRODUCT_NOT_FOUND', 'competition.product.not_found');

        // CMP-03. If the OC has combined categories into this field, the list covers every
        // source category — and each line still carries the one it is awarded in.
        const combination = await tx.query<{ id: string }>(
          `SELECT id FROM core.category_combination
            WHERE sport_entry_product_id = $1 AND combined_key = $2`,
          [args.sportEntryProductId, args.categoryName],
        );
        const combinationId = combination.rows[0]?.id ?? null;

        const openDraft = await tx.query<{ id: string }>(
          `SELECT id FROM core.start_list
            WHERE sport_entry_product_id = $1
              AND category_name IS NOT DISTINCT FROM $2
              AND status = 'draft'`,
          [args.sportEntryProductId, args.categoryName],
        );
        if (openDraft.rows[0]) {
          // Two drafts for one scope is two people preparing the same document without
          // knowing about each other.
          return { status: 200, body: await this.read(tx, openDraft.rows[0].id) };
        }

        const previous = await tx.query<{ id: string; version_no: number }>(
          `SELECT id, version_no FROM core.start_list
            WHERE sport_entry_product_id = $1
              AND category_name IS NOT DISTINCT FROM $2
            ORDER BY version_no DESC LIMIT 1`,
          [args.sportEntryProductId, args.categoryName],
        );
        const versionNo = (previous.rows[0]?.version_no ?? 0) + 1;

        const created = await tx.query<{ id: string }>(
          `INSERT INTO core.start_list
             (event_id, sport_entry_product_id, category_name, combination_id,
              version_no, supersedes, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'draft')
           RETURNING id`,
          [
            product.rows[0].event_id,
            args.sportEntryProductId,
            args.categoryName,
            combinationId,
            versionNo,
            previous.rows[0]?.id ?? null,
          ],
        );
        const listId = created.rows[0]!.id;

        await tx.query(
          `INSERT INTO core.start_list_entry
             (start_list_id, registration_entry_id, display_name, category_name,
              award_category_name, class_code, team_name, club_or_nation, ordinal)
           SELECT $1,
                  e.id,
                  p.given_name || ' ' || p.family_name,
                  -- The field, which is the list's own scope. For a combined list that is the
                  -- combined key; for an ordinary one it equals the entrant's own category.
                  $3,
                  -- The award category, copied from the entry and never rewritten by it.
                  COALESCE(e.current_category_name, e.original_category_name),
                  NULL,   -- class_code: see the note above on classification_ro
                  tr.name,
                  p.nationality,
                  row_number() OVER (
                    ORDER BY p.family_name, p.given_name, e.id
                  )
             FROM core.registration_entry e
             JOIN core.athlete_profile ap ON ap.id = e.athlete_profile_id
             JOIN core.person p ON p.id = ap.person_id
             LEFT JOIN core.team_roster tr ON tr.id = e.team_roster_id
            WHERE e.sport_entry_product_id = $2
              AND e.status = 'confirmed'
              AND CASE WHEN $4::uuid IS NULL
                    THEN COALESCE(e.current_category_name, e.original_category_name)
                         IS NOT DISTINCT FROM $3
                    ELSE COALESCE(e.current_category_name, e.original_category_name) IN (
                           SELECT s.source_key FROM core.category_combination_source s
                            WHERE s.combination_id = $4)
                  END`,
          [listId, args.sportEntryProductId, args.categoryName, combinationId],
        );

        return { status: 201, body: await this.read(tx, listId) };
      },
    );
    return result.body as StartListView;
  }

  /**
   * Approve, then publish — two acts, and deliberately not one.
   *
   * Approval says the content is right. Publication says it may be seen. Collapsing them
   * removes the state CMP-06 needs: a list that is finished and correct but must not be
   * visible until the embargo lifts.
   */
  async approve(args: { startListId: string; actorId: string }): Promise<StartListView> {
    const { rows } = await this.pool.query<{ status: string }>(
      `UPDATE core.start_list
          SET status = 'approved', approved_by = $2, approved_at = now(),
              content_hash = $3
        WHERE id = $1 AND status = 'draft'
        RETURNING status`,
      [args.startListId, args.actorId, await this.hash(args.startListId)],
    );
    if (!rows[0]) refuse('START_LIST_NOT_DRAFT', 'competition.start_list.not_draft');
    return this.read(this.pool, args.startListId);
  }

  async publish(args: {
    startListId: string;
    actorId: string;
    embargoUntil?: string | null;
    correctionReasonKey?: string | null;
  }): Promise<StartListView> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query<{ status: string; supersedes: string | null }>(
        `SELECT status, supersedes FROM core.start_list WHERE id = $1 FOR UPDATE`,
        [args.startListId],
      );
      const list = current.rows[0];
      if (!list) refuse('START_LIST_NOT_FOUND', 'competition.start_list.not_found');
      if (list.status !== 'approved') {
        // Publishing straight from draft would put an unreviewed document in front of
        // officials. Approval is the review.
        refuse('START_LIST_NOT_APPROVED', 'competition.start_list.not_approved');
      }
      if (list.supersedes && !args.correctionReasonKey) {
        refuse('CORRECTION_NEEDS_REASON', 'competition.start_list.correction_needs_reason');
      }

      // The old version steps down first: `start_list_one_published_per_scope` allows exactly
      // one published list per scope, so two authoritative documents cannot coexist.
      if (list.supersedes) {
        await client.query(
          `UPDATE core.start_list SET status = 'superseded' WHERE id = $1 AND status = 'published'`,
          [list.supersedes],
        );
      }

      await client.query(
        `UPDATE core.start_list
            SET status = 'published', published_by = $2, published_at = now(),
                embargo_until = $3, correction_reason_key = COALESCE($4, correction_reason_key)
          WHERE id = $1`,
        [
          args.startListId,
          args.actorId,
          args.embargoUntil ?? null,
          args.correctionReasonKey ?? null,
        ],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    return this.read(this.pool, args.startListId);
  }

  /**
   * The public read. CMP-06: nothing unpublished, and nothing still under embargo, may leave
   * through this path — for anyone, including the OC. An OC user who wants to see a draft
   * uses the OC read, which says so in its name.
   */
  async published(args: {
    eventId: string;
    sportEntryProductId?: string;
  }): Promise<StartListView[]> {
    const params: unknown[] = [args.eventId];
    let filter = '';
    if (args.sportEntryProductId) {
      filter = ' AND sport_entry_product_id = $2';
      params.push(args.sportEntryProductId);
    }
    const { rows } = await this.pool.query<{ id: string }>(
      `SELECT id FROM core.start_list
        WHERE event_id = $1 ${filter}
          AND status = 'published'
          -- The embargo is a time, so it lifts itself. Nobody has to remember to flip it.
          AND (embargo_until IS NULL OR embargo_until <= now())
        ORDER BY sport_entry_product_id, category_name`,
      params,
    );
    return Promise.all(rows.map((row) => this.read(this.pool, row.id)));
  }

  /** The OC read — any status, including draft and embargoed. Role-gated at the controller. */
  async get(startListId: string): Promise<StartListView> {
    return this.read(this.pool, startListId);
  }

  /** Hash of the content, so a published document can be proved unchanged later. */
  private async hash(startListId: string): Promise<string> {
    const { rows } = await this.pool.query<{ payload: string }>(
      `SELECT COALESCE(string_agg(
                registration_entry_id::text || '|' || display_name || '|' ||
                COALESCE(category_name,'') || '|' || COALESCE(award_category_name,'') || '|' ||
                COALESCE(class_code,'') || '|' || ordinal,
                E'\\n' ORDER BY ordinal), '') AS payload
         FROM core.start_list_entry WHERE start_list_id = $1`,
      [startListId],
    );
    return createHash('sha256')
      .update(rows[0]?.payload ?? '')
      .digest('hex');
  }

  private async read(tx: Queryable, startListId: string): Promise<StartListView> {
    const head = await tx.query<{
      id: string;
      event_id: string;
      sport_entry_product_id: string;
      category_name: string | null;
      version_no: number;
      supersedes: string | null;
      status: string;
      embargo_until: Date | null;
      correction_reason_key: string | null;
      content_hash: string | null;
      published_at: Date | null;
      combination_id: string | null;
      combined_key: string | null;
      source_keys: string[] | null;
      combination_reason_key: string | null;
    }>(
      `SELECT l.id, l.event_id, l.sport_entry_product_id, l.category_name, l.version_no,
              l.supersedes, l.status, l.embargo_until, l.correction_reason_key, l.content_hash,
              l.published_at,
              l.combination_id,
              c.combined_key,
              c.reason_key AS combination_reason_key,
              (SELECT array_agg(s.source_key ORDER BY s.source_key)
                 FROM core.category_combination_source s
                WHERE s.combination_id = c.id) AS source_keys
         FROM core.start_list l
         LEFT JOIN core.category_combination c ON c.id = l.combination_id
        WHERE l.id = $1`,
      [startListId],
    );
    const row = head.rows[0];
    if (!row) refuse('START_LIST_NOT_FOUND', 'competition.start_list.not_found');

    const entries = await tx.query<{
      registration_entry_id: string;
      display_name: string;
      category_name: string | null;
      award_category_name: string | null;
      class_code: string | null;
      team_name: string | null;
      club_or_nation: string | null;
      position_label: string | null;
      ordinal: number;
    }>(
      `SELECT registration_entry_id, display_name, category_name, award_category_name,
              class_code, team_name, club_or_nation, position_label, ordinal
         FROM core.start_list_entry WHERE start_list_id = $1 ORDER BY ordinal`,
      [startListId],
    );

    return {
      id: row.id,
      eventId: row.event_id,
      sportEntryProductId: row.sport_entry_product_id,
      categoryName: row.category_name,
      combination: row.combination_id
        ? {
            id: row.combination_id,
            combinedKey: row.combined_key ?? '',
            sourceKeys: row.source_keys ?? [],
            reasonKey: row.combination_reason_key ?? '',
          }
        : null,
      versionNo: row.version_no,
      supersedes: row.supersedes,
      status: row.status as StartListStatus,
      embargoUntil: iso(row.embargo_until),
      correctionReasonKey: row.correction_reason_key,
      contentHash: row.content_hash,
      publishedAt: iso(row.published_at),
      entries: entries.rows.map((entry) => ({
        registrationEntryId: entry.registration_entry_id,
        displayName: entry.display_name,
        categoryName: entry.category_name,
        awardCategoryName: entry.award_category_name,
        classCode: entry.class_code,
        teamName: entry.team_name,
        clubOrNation: entry.club_or_nation,
        positionLabel: entry.position_label,
        ordinal: entry.ordinal,
      })),
    };
  }
}
