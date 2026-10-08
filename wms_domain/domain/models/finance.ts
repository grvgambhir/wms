// Finance / settlement domain (A05 — WS-D). Read-model for the OC Command Centre
// "Finance & Reconcile" screen: settled/pending payments joined to their entries,
// a reconciliation summary (gateway captured vs ledger expected → variance), and a
// mock refund. Cross-portal: live participant payments (from the registration
// journey repository) surface here as `source: 'live'` settlements — the same
// governed order/payment record, viewed from the admin side (RFP §7 finance, REG-15).
//
// Backend-adaptable (§6.6): these are plain JSON DTOs. `getOverview` → GET
// /admin/finance/overview; `refundSettlement` → POST /admin/finance/settlements/{id}/refund.
import type { PaginatedResponse } from './api';

export type SettlementPaymentStatus = 'captured' | 'pending' | 'refunded' | 'failed';

/** One denormalized settlement row (an order + its payment + display context). */
export type Settlement = {
  id: string;
  orderId: string;
  registrationEntryId: string;
  participantName: string;
  sportName: string;
  entryName: string;
  categoryName?: string;
  currency: 'EUR';
  amountMinor: number;
  paymentStatus: SettlementPaymentStatus;
  gatewayReference?: string;
  attemptCount: number;
  chargeCount: number;
  /** order total == a single captured charge, no orphan/duplicate → books balance. */
  reconciled: boolean;
  /** 'live' = created by a participant in the journey this session (cross-portal). */
  source: 'seeded' | 'live';
  settledAt: string;
};

export type ReconciliationSummary = {
  currency: 'EUR';
  settledCount: number;
  settledAmountMinor: number;
  pendingCount: number;
  pendingAmountMinor: number;
  refundedCount: number;
  refundedAmountMinor: number;
  /** Sum captured at the gateway across reconciled settlements. */
  gatewayCapturedMinor: number;
  /** Sum expected in our ledger across the same settlements. */
  ledgerExpectedMinor: number;
  /** gatewayCaptured − ledgerExpected. €0.00 when everything reconciles. */
  varianceMinor: number;
};

export type FinanceOverview = {
  summary: ReconciliationSummary;
  settlements: PaginatedResponse<Settlement>;
};

export type RefundSettlementRequest = {
  settlementId: string;
  idempotencyKey: string;
  reason?: string;
};

export type RefundSettlementResponse = {
  settlement: Settlement;
  summary: ReconciliationSummary;
};
