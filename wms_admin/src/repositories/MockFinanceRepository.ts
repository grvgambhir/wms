import athletesJson from '../data/athletes.json';
import settlementsJson from '../data/settlements.json';
import sportEntriesJson from '../data/sport-entries.json';
import sportsJson from '../data/sports.json';
import type {
  FinanceOverview,
  ReconciliationSummary,
  RefundSettlementRequest,
  RefundSettlementResponse,
  Settlement,
  SettlementPaymentStatus,
} from '../domain/finance';
import type { FinanceRepository } from './FinanceRepository';
import {
  emptyFinanceJourneySource,
  type FinanceJourneySource,
} from './FinanceJourneySource';

const REQUEST_DELAY_MS = 120;

type NamedRecord = { id: string; firstName?: string; lastName?: string; name?: string };

const seed = {
  settlements: settlementsJson as unknown as FinanceOverview['settlements'],
  athletes: athletesJson as unknown as { items: Array<NamedRecord & { firstName: string; lastName: string }> },
  sports: sportsJson as unknown as { items: Array<{ id: string; name: string }> },
  products: sportEntriesJson as unknown as { items: Array<{ id: string; name: string }> },
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function summarize(settlements: readonly Settlement[]): ReconciliationSummary {
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

  for (const settlement of settlements) {
    if (settlement.paymentStatus === 'captured') {
      summary.settledCount += 1;
      summary.settledAmountMinor += settlement.amountMinor;
      if (settlement.reconciled) {
        summary.gatewayCapturedMinor += settlement.amountMinor;
        summary.ledgerExpectedMinor += settlement.amountMinor;
      }
    } else if (settlement.paymentStatus === 'pending') {
      summary.pendingCount += 1;
      summary.pendingAmountMinor += settlement.amountMinor;
    } else if (settlement.paymentStatus === 'refunded') {
      summary.refundedCount += 1;
      summary.refundedAmountMinor += settlement.amountMinor;
    }
  }

  summary.varianceMinor = summary.gatewayCapturedMinor - summary.ledgerExpectedMinor;
  return summary;
}

interface ProcessedRefund {
  readonly settlementId: string;
  readonly response: RefundSettlementResponse;
}

export class MockFinanceRepository implements FinanceRepository {
  private readonly refundedOrderIds = new Set<string>();
  private readonly processedRefunds = new Map<string, ProcessedRefund>();

  constructor(private readonly journey: FinanceJourneySource = emptyFinanceJourneySource) {}

  async getOverview(): Promise<FinanceOverview> {
    await this.delay();
    await this.journey.ensureHydrated();
    return this.overview();
  }

  async refundSettlement(input: RefundSettlementRequest): Promise<RefundSettlementResponse> {
    await this.delay();
    await this.journey.ensureHydrated();

    if (!input.idempotencyKey.trim()) {
      throw new Error('An idempotency key is required.');
    }

    const processed = this.processedRefunds.get(input.idempotencyKey);
    if (processed) {
      if (processed.settlementId !== input.settlementId) {
        throw new Error('The idempotency key has already been used for another settlement.');
      }
      return clone(processed.response);
    }

    const target = this.buildSettlements().find((item) => item.id === input.settlementId);
    if (!target) {
      throw new Error('Settlement was not found.');
    }
    if (target.paymentStatus !== 'captured') {
      throw new Error('Only a captured settlement can be refunded.');
    }

    this.refundedOrderIds.add(target.orderId);
    const settlements = this.buildSettlements();
    const settlement = settlements.find((item) => item.id === input.settlementId);
    if (!settlement) {
      throw new Error('Settlement was not found.');
    }

    const response: RefundSettlementResponse = {
      settlement,
      summary: summarize(settlements),
    };
    this.processedRefunds.set(input.idempotencyKey, {
      settlementId: input.settlementId,
      response: clone(response),
    });
    return clone(response);
  }

  private overview(): FinanceOverview {
    const settlements = this.buildSettlements();
    return clone({
      summary: summarize(settlements),
      settlements: {
        items: settlements,
        total: settlements.length,
      },
    });
  }

  private buildSettlements(): Settlement[] {
    const seeded = clone(seed.settlements.items).map((item) => this.applyRefund(item));
    const live = this.buildLiveSettlements().map((item) => this.applyRefund(item));
    const byOrder = new Map<string, Settlement>();
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

  private delay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
  }
}
