// Mock finance repository (A05 — WS-D). Serves the OC "Finance & Reconcile" screen.
// Data = a seeded settlement history (settlements.json) MERGED with the live
// participant orders/payments read from the registration-journey repository, so a
// payment made in the participant portal reconciles here in the admin portal against
// one governed record (cross-portal, RFP §7 finance / REG-15). Refunds are held in a
// local override so they persist across refetches without mutating the journey store.
import type { PaginatedResponse } from '@/domain/models/api';
import type { AthleteProfile } from '@/domain/models/athlete';
import type {
  FinanceOverview,
  ReconciliationSummary,
  RefundSettlementRequest,
  RefundSettlementResponse,
  Settlement,
  SettlementPaymentStatus,
} from '@/domain/models/finance';
import type {
  JourneyPayment,
  RegistrationEntry,
  RegistrationOrder,
  SportEntryProduct,
} from '@/domain/models/registrationJourney';
import type { Sport } from '@/domain/models/sport';
import type { FinanceRepository } from '@/domain/repositories/finance.repository';
import { RepositoryError } from '@/data/errors/repositoryError';

import athletesJson from '@/data/mock/fixtures/data-hub/athletes.json';
import settlementsJson from '@/data/mock/fixtures/data-hub/settlements.json';
import sportEntriesJson from '@/data/mock/fixtures/data-hub/sport-entries.json';
import sportsJson from '@/data/mock/fixtures/data-hub/sports.json';

const QUERY_DELAY_MS = 240;
const MUTATION_DELAY_MS = 420;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** The slice of the registration-journey repository the finance view depends on. */
export type FinanceJourneySource = {
  /** Rehydrate persisted journey state so finance reconciles resumed orders after a reload. */
  ensureHydrated(): Promise<void>;
  listLiveOrders(): RegistrationOrder[];
  listLivePayments(): JourneyPayment[];
  listLiveEntries(): RegistrationEntry[];
};

const seed = {
  settlements: settlementsJson as unknown as PaginatedResponse<Settlement>,
  athletes: athletesJson as unknown as PaginatedResponse<AthleteProfile>,
  sports: sportsJson as unknown as PaginatedResponse<Sport>,
  products: sportEntriesJson as unknown as PaginatedResponse<SportEntryProduct>,
};

function summarize(settlements: Settlement[]): ReconciliationSummary {
  const summary: ReconciliationSummary = {
    currency: 'EUR',
    settledCount: 0,
    settledAmountMinor: 0,
    pendingCount: 0,
    pendingAmountMinor: 0,
    refundedCount: 0,
    refundedAmountMinor: 0,
    gatewayCapturedMinor: 0,
    ledgerExpectedMinor: 0,
    varianceMinor: 0,
  };
  for (const s of settlements) {
    if (s.paymentStatus === 'captured') {
      summary.settledCount += 1;
      summary.settledAmountMinor += s.amountMinor;
      if (s.reconciled) {
        // Gateway callback and our order ledger agree on this captured amount.
        summary.gatewayCapturedMinor += s.amountMinor;
        summary.ledgerExpectedMinor += s.amountMinor;
      }
    } else if (s.paymentStatus === 'pending') {
      summary.pendingCount += 1;
      summary.pendingAmountMinor += s.amountMinor;
    } else if (s.paymentStatus === 'refunded') {
      summary.refundedCount += 1;
      summary.refundedAmountMinor += s.amountMinor;
    }
  }
  summary.varianceMinor = summary.gatewayCapturedMinor - summary.ledgerExpectedMinor;
  return summary;
}

export class MockFinanceRepository implements FinanceRepository {
  private refundedOrderIds = new Set<string>();

  constructor(private readonly journey: FinanceJourneySource) {}

  async getOverview(): Promise<FinanceOverview> {
    await delay(QUERY_DELAY_MS);
    await this.journey.ensureHydrated();
    const settlements = this.buildSettlements();
    return {
      summary: summarize(settlements),
      settlements: { items: settlements, total: settlements.length },
    };
  }

  async refundSettlement(input: RefundSettlementRequest): Promise<RefundSettlementResponse> {
    await delay(MUTATION_DELAY_MS);
    await this.journey.ensureHydrated();
    if (!input.idempotencyKey) {
      throw new RepositoryError({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'An idempotency key is required.' });
    }
    const target = this.buildSettlements().find((item) => item.id === input.settlementId);
    if (!target) {
      throw new RepositoryError({ code: 'NOT_FOUND', message: 'Settlement was not found.' });
    }
    if (target.paymentStatus !== 'captured') {
      throw new RepositoryError({ code: 'NOT_REFUNDABLE', message: 'Only a captured settlement can be refunded.' });
    }
    this.refundedOrderIds.add(target.orderId);
    const settlements = this.buildSettlements();
    const settlement = settlements.find((item) => item.id === input.settlementId);
    if (!settlement) {
      throw new RepositoryError({ code: 'NOT_FOUND', message: 'Settlement was not found.' });
    }
    return { settlement, summary: summarize(settlements) };
  }

  /** Seeded history + live journey settlements, refund overrides applied, newest first. */
  private buildSettlements(): Settlement[] {
    const seeded = clone(seed.settlements.items).map((item) => this.applyRefund(item));
    const live = this.buildLiveSettlements().map((item) => this.applyRefund(item));
    const byOrder = new Map<string, Settlement>();
    // Live records win on a shared orderId (they carry the freshest gateway state).
    for (const item of [...live, ...seeded]) {
      if (!byOrder.has(item.orderId)) byOrder.set(item.orderId, item);
    }
    return [...byOrder.values()].sort((a, b) => (a.settledAt < b.settledAt ? 1 : -1));
  }

  private applyRefund(settlement: Settlement): Settlement {
    return this.refundedOrderIds.has(settlement.orderId)
      ? { ...settlement, paymentStatus: 'refunded' }
      : settlement;
  }

  private buildLiveSettlements(): Settlement[] {
    const orders = this.journey.listLiveOrders();
    const payments = this.journey.listLivePayments();
    const entries = this.journey.listLiveEntries();
    const result: Settlement[] = [];
    for (const order of orders) {
      const entry = entries.find((item) => item.id === order.registrationEntryId);
      if (!entry) continue;
      const payment = payments.find((item) => item.orderId === order.id);
      const athlete = seed.athletes.items.find((item) => item.id === entry.athleteId);
      const product = seed.products.items.find((item) => item.id === entry.sportEntryProductId);
      const sport = seed.sports.items.find((item) => item.id === entry.sportId);
      const paymentStatus: SettlementPaymentStatus =
        payment?.status === 'captured'
          ? 'captured'
          : payment?.status === 'refunded'
            ? 'refunded'
            : payment?.status === 'failed'
              ? 'failed'
              : 'pending';
      const reconciled =
        paymentStatus === 'captured' &&
        (payment?.chargeCount ?? 0) === 1 &&
        (payment?.amountMinor ?? -1) === order.totalAmountMinor;
      result.push({
        id: `live-${order.id}`,
        orderId: order.id,
        registrationEntryId: entry.id,
        participantName: athlete ? `${athlete.firstName} ${athlete.lastName}` : 'Participant',
        sportName: sport?.name ?? '—',
        entryName: product?.name ?? '—',
        categoryName: entry.currentCategoryName,
        currency: 'EUR',
        amountMinor: order.totalAmountMinor,
        paymentStatus,
        gatewayReference: payment?.providerReference,
        attemptCount: payment?.attemptCount ?? 0,
        chargeCount: payment?.chargeCount ?? 0,
        reconciled,
        source: 'live',
        settledAt: payment?.updatedAt ?? order.updatedAt,
      });
    }
    return result;
  }
}
