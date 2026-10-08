// Finance repository contract (A05 — WS-D). The admin "Finance & Reconcile" screen
// reads settlements + reconciliation through this seam only (never fixtures). The
// mock reads live participant orders/payments from the registration-journey store so
// the two portals share one governed record; the API implementation swaps in later
// with no UI change (§6.6).
import type {
  FinanceOverview,
  RefundSettlementRequest,
  RefundSettlementResponse,
} from '../models/finance';

export interface FinanceRepository {
  /** GET — settlement list + reconciliation summary (seeded history + live journey payments). */
  getOverview(): Promise<FinanceOverview>;
  /** POST /…/{id}/refund — mock refund; recomputes the reconciliation summary. */
  refundSettlement(input: RefundSettlementRequest): Promise<RefundSettlementResponse>;
}
