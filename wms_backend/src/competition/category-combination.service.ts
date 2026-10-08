/**
 * CMP-03 — category combination, preserving the original award category.
 *
 * WHAT THIS REQUIREMENT IS ACTUALLY PROTECTING
 * --------------------------------------------
 * A Masters category with four entrants does not make a field, so the OC merges 40–44 and
 * 45–49 into one 40–49 race. The athletes race together. They are **not** awarded together:
 * the 40–44 entrant still wins a 40–44 medal.
 *
 * The shortcut is to write the combined key onto `registration_entry.current_category_name`.
 * One column, already there, and every start list comes out right. It also destroys the only
 * record of what the athlete entered — and medal tables, refunds and eligibility appeals are
 * all downstream of that. `core.award_category_is_not_a_combined_field` refuses it in the
 * database, so this service is not the last line of defence and neither is the next one.
 *
 * A combination is therefore a MAPPING that sits beside the entry, never a mutation of it.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Queryable } from '../common/idempotency/idempotency.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { refuse } from '../people/refuse';

export interface CategoryCombinationView {
  id: string;
  eventId: string;
  sportEntryProductId: string;
  /** The field they compete in. */
  combinedKey: string;
  /** The categories merged into it — and the categories they are still awarded in. */
  sourceKeys: string[];
  minEntries: number | null;
  reason: string;
  /** The published explanation, as an i18n key. CMP-03 asks for explanations, in four languages. */
  reasonKey: string;
  decidedBy: string;
  decidedAt: string;
}

/** Postgres refusals raised by `core.combine_categories`, mapped to API codes. */
const COMBINATION_REFUSALS: Record<string, string> = {
  'competition.combination.needs_two_sources': 'VALIDATION_ERROR',
  'competition.combination.combined_key_is_a_source': 'VALIDATION_ERROR',
  'competition.combination.source_is_a_combined_field': 'COMBINATION_CONFLICT',
  'competition.combination.combined_key_already_merged': 'COMBINATION_CONFLICT',
  'competition.product.not_found': 'PRODUCT_NOT_FOUND',
};

function headerKey(headers: { [key: string]: string | string[] | undefined }): string {
  const raw = headers['idempotency-key'];
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0].trim();
  return '';
}

@Injectable()
export class CategoryCombinationService {
  constructor(
    private readonly pool: Pool,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  async combine(args: {
    sportEntryProductId: string;
    combinedKey: string;
    sourceKeys: string[];
    minEntries: number | null;
    reason: string;
    reasonKey: string;
    actorId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
  }): Promise<CategoryCombinationView> {
    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: 'POST /v1/admin/category-combinations',
        body: {
          sportEntryProductId: args.sportEntryProductId,
          combinedKey: args.combinedKey,
          sourceKeys: args.sourceKeys,
        },
        mode: 'local',
      },
      async (tx) => {
        // Every rule about the SET of source categories lives in the function, because none of
        // them is a statement about a single row. Re-checking them here would be a second
        // implementation that drifts.
        let id: string;
        try {
          const created = await tx.query<{ id: string }>(
            `SELECT core.combine_categories($1, $2, $3::text[], $4, $5, $6, $7) AS id`,
            [
              args.sportEntryProductId,
              args.combinedKey,
              args.sourceKeys,
              args.minEntries,
              args.reason,
              args.reasonKey,
              args.actorId,
            ],
          );
          id = created.rows[0]!.id;
        } catch (err) {
          const message = err instanceof Error ? err.message : '';
          const code = COMBINATION_REFUSALS[message];
          if (code) refuse(code, message);
          // A source category already merged into another field trips the UNIQUE, not the
          // function — the function only sees the rows it is inserting.
          if ((err as { constraint?: string }).constraint === 'source_category_combined_once') {
            refuse('COMBINATION_CONFLICT', 'competition.combination.source_already_combined');
          }
          throw err;
        }
        // Read inside the same transaction — the row is not committed yet.
        return { status: 201, body: await this.read(id, tx) };
      },
    );
    return result.body as CategoryCombinationView;
  }

  async list(sportEntryProductId: string): Promise<CategoryCombinationView[]> {
    const { rows } = await this.pool.query<{ id: string }>(
      `SELECT id FROM core.category_combination
        WHERE sport_entry_product_id = $1
        ORDER BY combined_key`,
      [sportEntryProductId],
    );
    return Promise.all(rows.map((row) => this.read(row.id)));
  }

  async read(id: string, db: Queryable = this.pool): Promise<CategoryCombinationView> {
    const { rows } = await db.query<{
      id: string;
      event_id: string;
      sport_entry_product_id: string;
      combined_key: string;
      source_keys: string[];
      min_entries: number | null;
      reason: string;
      reason_key: string;
      decided_by: string;
      decided_at: Date;
    }>(
      `SELECT c.id, c.event_id, c.sport_entry_product_id, c.combined_key,
              COALESCE(
                (SELECT array_agg(s.source_key ORDER BY s.source_key)
                   FROM core.category_combination_source s
                  WHERE s.combination_id = c.id),
                '{}'::text[]
              ) AS source_keys,
              c.min_entries, c.reason, c.reason_key, c.decided_by, c.decided_at
         FROM core.category_combination c
        WHERE c.id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) refuse('COMBINATION_NOT_FOUND', 'competition.combination.not_found');
    return {
      id: row.id,
      eventId: row.event_id,
      sportEntryProductId: row.sport_entry_product_id,
      combinedKey: row.combined_key,
      sourceKeys: row.source_keys,
      minEntries: row.min_entries,
      reason: row.reason,
      reasonKey: row.reason_key,
      decidedBy: row.decided_by,
      decidedAt: row.decided_at.toISOString(),
    };
  }
}
