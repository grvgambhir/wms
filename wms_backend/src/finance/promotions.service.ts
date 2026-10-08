/**
 * Applying a promotion code to an order.
 *
 * A DISCOUNT IS A LINE, NOT A FIELD
 * ---------------------------------
 * `order_line.kind` includes `discount`, and the comment on the table says discount lines may
 * be negative-gross. That is the whole design: a discount enters the order the same way a fee
 * does, `core.roll_up_order_totals` maintains the order from its lines, and the invoice copies
 * lines rather than recomputing. A `discount_minor` column on the order would have to be
 * remembered by every reader — the totals, the invoice, the refund split, the settlement
 * report — and one of them would forget.
 *
 * ONE DISCOUNT LINE PER TAX RATE
 * ------------------------------
 * This is the part that looks like over-engineering and is not. An order can carry 22% entry
 * fees and a 0%-exempt add-on. A single discount line has ONE `tax_rate_bp`, so collapsing the
 * discount into one line either invents VAT on the exempt part or forgives VAT that was
 * charged. Both are wrong on an Italian invoice, and `invoice_tax_summary` states tax per
 * rate — it would show the error plainly to anyone reading the document.
 *
 * So the discount is split across the rates present on the order, in proportion to each
 * rate's share, and each slice becomes its own line at that rate. `exempt_lines_need_a_nature
 * _code` then forces the 0% slice to carry the nature code it inherits from what it discounts.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { refuse } from '../people/refuse';

const minor = (value: string | number | null): number => Number(value ?? 0);

export interface AppliedPromotionView {
  orderId: string;
  promotionId: string;
  code: string;
  kind: 'percentage' | 'fixed' | 'waiver';
  /** Positive: the amount taken off. The lines that carry it are negative. */
  appliedMinor: number;
  orderTotalMinor: number;
  lines: Array<{ taxRateBp: number; taxCode: string | null; grossMinor: number }>;
}

interface RateSlice {
  tax_rate_bp: number;
  tax_code: string | null;
  net_minor: string;
  tax_minor: string;
  gross_minor: string;
}

function headerKey(headers: { [key: string]: string | string[] | undefined }): string {
  const raw = headers['idempotency-key'];
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0].trim();
  return '';
}

/**
 * Distributes a whole amount across weights without losing or inventing a cent.
 *
 * Rounding each slice independently is the classic off-by-a-cent: three equal shares of 100
 * become 33+33+33 and one cent vanishes from an invoice that must balance. Largest-remainder
 * gives the leftover cents to the slices that lost the most to rounding, so the parts always
 * sum to the whole.
 */
export function distributeMinor(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const floored = exact.map(Math.floor);
  let remainder = total - floored.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { index } of order) {
    if (remainder <= 0) break;
    floored[index] = (floored[index] ?? 0) + 1;
    remainder -= 1;
  }
  return floored;
}

@Injectable()
export class PromotionsService {
  constructor(
    private readonly pool: Pool,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  async apply(args: {
    orderId: string;
    code: string;
    actorId: string;
    scope: string;
    headers: { [key: string]: string | string[] | undefined };
  }): Promise<AppliedPromotionView> {
    const code = args.code.trim();
    if (!code) refuse('VALIDATION_ERROR', 'finance.promotion.code_required');

    const result = await this.idempotency.execute(
      {
        scope: args.scope,
        key: headerKey(args.headers),
        endpoint: `POST /v1/orders/${args.orderId}/promotions`,
        body: { code },
        mode: 'local',
      },
      async (tx) => {
        const orderResult = await tx.query<{
          id: string;
          event_id: string;
          status: string;
          gross_minor: string;
        }>(
          `SELECT id, event_id, status, gross_minor::text
             FROM core.registration_order WHERE id = $1 FOR UPDATE`,
          [args.orderId],
        );
        const order = orderResult.rows[0];
        if (!order) refuse('ORDER_NOT_FOUND', 'finance.order.not_found');

        // Discounting an order that has already been paid would mean the buyer is owed money,
        // and that is a refund — a two-person decision — not a price change.
        if (order.status === 'paid') {
          refuse('ORDER_ALREADY_PAID', 'finance.promotion.order_already_paid');
        }

        // FOR UPDATE on the promotion, not just the order: `max_uses` is a race between
        // different orders, so the lock has to be on the thing being counted.
        const promoResult = await tx.query<{
          id: string;
          code: string;
          kind: string;
          value_bp: number | null;
          value_minor: string | null;
          max_uses: number | null;
          used_count: number;
          within: boolean;
        }>(
          `SELECT id, code, kind, value_bp, value_minor::text, max_uses, used_count,
                  (effective @> now()) AS within
             FROM core.promotion
            WHERE event_id = $1 AND code = $2
            FOR UPDATE`,
          [order.event_id, code],
        );
        const promo = promoResult.rows[0];
        if (!promo) refuse('PROMOTION_NOT_FOUND', 'finance.promotion.not_found');
        if (!promo.within) refuse('PROMOTION_NOT_EFFECTIVE', 'finance.promotion.not_effective');
        if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
          refuse('PROMOTION_EXHAUSTED', 'finance.promotion.exhausted');
        }

        const duplicate = await tx.query<{ order_id: string }>(
          `SELECT order_id FROM core.order_promotion WHERE order_id = $1 AND promotion_id = $2`,
          [args.orderId, promo.id],
        );
        if (duplicate.rows[0]) {
          refuse('PROMOTION_ALREADY_APPLIED', 'finance.promotion.already_applied');
        }

        // What can be discounted: the charge lines, grouped by their tax rate. Existing
        // discount lines are excluded so a second promotion cannot discount the first one.
        const slices = await tx.query<RateSlice>(
          `SELECT tax_rate_bp, tax_code,
                  sum(net_minor)::text AS net_minor,
                  sum(tax_minor)::text AS tax_minor,
                  sum(gross_minor)::text AS gross_minor
             FROM core.order_line
            WHERE order_id = $1 AND kind <> 'discount' AND gross_minor > 0
            GROUP BY tax_rate_bp, tax_code
            ORDER BY tax_rate_bp DESC`,
          [args.orderId],
        );
        const discountable = slices.rows.reduce((sum, row) => sum + minor(row.gross_minor), 0);
        if (discountable <= 0)
          refuse('NOTHING_TO_DISCOUNT', 'finance.promotion.nothing_to_discount');

        const requested = this.amountFor(promo, discountable);
        // A promotion may never take an order below zero. The OC does not owe money because
        // someone stacked codes; it caps at the order, and the cap is stated in the response
        // rather than silently applied.
        const applied = Math.min(requested, discountable);
        if (applied <= 0) refuse('PROMOTION_NO_EFFECT', 'finance.promotion.no_effect');

        const perSlice = distributeMinor(
          applied,
          slices.rows.map((row) => minor(row.gross_minor)),
        );

        const lines: AppliedPromotionView['lines'] = [];
        for (const [index, slice] of slices.rows.entries()) {
          const sliceGross = perSlice[index] ?? 0;
          if (sliceGross <= 0) continue;
          // The net/tax split of the discount must match the split of what it discounts,
          // computed in SQL so it uses the same rounding as every other money path.
          const split = await tx.query<{ net_minor: string; tax_minor: string }>(
            `SELECT net_minor::text, tax_minor::text
               FROM core.proportional_tax_split($1::bigint, $2::bigint, $3::bigint, $4::bigint)`,
            [sliceGross, minor(slice.net_minor), minor(slice.tax_minor), minor(slice.gross_minor)],
          );
          const net = minor(split.rows[0]?.net_minor ?? '0');
          const tax = minor(split.rows[0]?.tax_minor ?? '0');
          await tx.query(
            `INSERT INTO core.order_line
               (order_id, kind, description, quantity, unit_net_minor,
                net_minor, tax_rate_bp, tax_code, tax_minor, gross_minor)
             VALUES ($1, 'discount', $2, 1, $3, $3, $4, $5, $6, $7)`,
            [
              args.orderId,
              `Promotion ${promo.code}`,
              -net,
              slice.tax_rate_bp,
              slice.tax_code,
              -tax,
              -sliceGross,
            ],
          );
          lines.push({
            taxRateBp: slice.tax_rate_bp,
            taxCode: slice.tax_code,
            grossMinor: -sliceGross,
          });
        }

        await tx.query(
          `INSERT INTO core.order_promotion (order_id, promotion_id, applied_minor)
           VALUES ($1, $2, $3)`,
          [args.orderId, promo.id, applied],
        );
        // `promo_not_overused` is the guarantee; this UPDATE is what it checks.
        await tx.query(`UPDATE core.promotion SET used_count = used_count + 1 WHERE id = $1`, [
          promo.id,
        ]);

        const after = await tx.query<{ gross_minor: string }>(
          `SELECT gross_minor::text FROM core.registration_order WHERE id = $1`,
          [args.orderId],
        );

        await tx.query(
          `INSERT INTO audit.activity_log
             (event_id, actor_id, actor_role, action, subject_type, subject_id, after)
           VALUES ($1, $2, 'finance', 'promotion.apply', 'registration_order', $3, $4::jsonb)`,
          [
            order.event_id,
            args.actorId,
            args.orderId,
            JSON.stringify({ code: promo.code, appliedMinor: applied, cappedFrom: requested }),
          ],
        );

        return {
          status: 201,
          body: {
            orderId: args.orderId,
            promotionId: promo.id,
            code: promo.code,
            kind: promo.kind as AppliedPromotionView['kind'],
            appliedMinor: applied,
            orderTotalMinor: minor(after.rows[0]?.gross_minor ?? '0'),
            lines,
          } satisfies AppliedPromotionView,
        };
      },
    );
    return result.body as AppliedPromotionView;
  }

  /** `promo_has_exactly_one_value` guarantees the field this reads is the populated one. */
  private amountFor(
    promo: { kind: string; value_bp: number | null; value_minor: string | null },
    discountable: number,
  ): number {
    if (promo.kind === 'waiver') return discountable;
    if (promo.kind === 'percentage') {
      // Basis points: 2250 is 22.5%. Integer arithmetic throughout — a float here is how a
      // cent appears from nowhere and a reconciliation stops closing.
      return Math.round((discountable * (promo.value_bp ?? 0)) / 10000);
    }
    return minor(promo.value_minor);
  }
}
