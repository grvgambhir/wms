/// <reference types="jest" />
// Reconciliation math + refund override for MockFinanceRepository (A05).
// Journey source is stubbed empty so these tests stay off the in-flux save-&-resume repo.
import { RepositoryError } from '@/data/errors/repositoryError';
import {
  MockFinanceRepository,
  type FinanceJourneySource,
} from '@/data/mock/repositories/mockFinanceRepository';

const SOFIA_CAPTURED_ID = '5f2a1b00-0001-4a10-9c01-202700000101';
const SOFIA_AMOUNT_MINOR = 9000;
const ELENA_PENDING_ID = '5f2a1b00-0006-4a10-9c06-202700000106';
const PAOLO_REFUNDED_ID = '5f2a1b00-0007-4a10-9c07-202700000107';

function emptyJourney(): FinanceJourneySource {
  return {
    ensureHydrated: async () => undefined,
    listLiveOrders: () => [],
    listLivePayments: () => [],
    listLiveEntries: () => [],
  };
}

describe('MockFinanceRepository', () => {
  let repo: MockFinanceRepository;

  beforeEach(() => {
    repo = new MockFinanceRepository(emptyJourney());
  });

  it('summarizes settled / pending / refunded totals from the seed', async () => {
    const { summary, settlements } = await repo.getOverview();
    const sofia = settlements.items.find((item) => item.id === SOFIA_CAPTURED_ID);
    const elena = settlements.items.find((item) => item.id === ELENA_PENDING_ID);
    const paolo = settlements.items.find((item) => item.id === PAOLO_REFUNDED_ID);

    expect(sofia?.paymentStatus).toBe('captured');
    expect(sofia?.amountMinor).toBe(SOFIA_AMOUNT_MINOR);
    expect(elena?.paymentStatus).toBe('pending');
    expect(paolo?.paymentStatus).toBe('refunded');

    expect(summary.currency).toBe('EUR');
    expect(summary.settledCount).toBe(settlements.items.filter((item) => item.paymentStatus === 'captured').length);
    expect(summary.settledAmountMinor).toBe(
      settlements.items.filter((item) => item.paymentStatus === 'captured').reduce((sum, item) => sum + item.amountMinor, 0),
    );
    expect(summary.pendingCount).toBe(settlements.items.filter((item) => item.paymentStatus === 'pending').length);
    expect(summary.refundedCount).toBe(settlements.items.filter((item) => item.paymentStatus === 'refunded').length);
  });

  it('keeps variance at 0 when gateway captured equals ledger expected', async () => {
    const { summary } = await repo.getOverview();

    expect(summary.gatewayCapturedMinor).toBe(summary.ledgerExpectedMinor);
    expect(summary.varianceMinor).toBe(0);
    expect(summary.gatewayCapturedMinor - summary.ledgerExpectedMinor).toBe(0);
  });

  it('refund override flips a captured settlement to refunded and recomputes totals', async () => {
    const before = await repo.getOverview();
    const { settlement, summary } = await repo.refundSettlement({
      settlementId: SOFIA_CAPTURED_ID,
      idempotencyKey: 'refund-sofia-1',
    });

    expect(settlement.id).toBe(SOFIA_CAPTURED_ID);
    expect(settlement.paymentStatus).toBe('refunded');

    expect(summary.settledCount).toBe(before.summary.settledCount - 1);
    expect(summary.settledAmountMinor).toBe(before.summary.settledAmountMinor - SOFIA_AMOUNT_MINOR);
    expect(summary.pendingCount).toBe(before.summary.pendingCount);
    expect(summary.pendingAmountMinor).toBe(before.summary.pendingAmountMinor);
    expect(summary.refundedCount).toBe(before.summary.refundedCount + 1);
    expect(summary.refundedAmountMinor).toBe(before.summary.refundedAmountMinor + SOFIA_AMOUNT_MINOR);
    expect(summary.gatewayCapturedMinor).toBe(before.summary.gatewayCapturedMinor - SOFIA_AMOUNT_MINOR);
    expect(summary.ledgerExpectedMinor).toBe(before.summary.ledgerExpectedMinor - SOFIA_AMOUNT_MINOR);
    expect(summary.varianceMinor).toBe(0);

    const overview = await repo.getOverview();
    const row = overview.settlements.items.find((item) => item.id === SOFIA_CAPTURED_ID);
    expect(row?.paymentStatus).toBe('refunded');
    expect(overview.summary).toEqual(summary);
  });

  it('requires an idempotency key on refund', async () => {
    await expect(
      repo.refundSettlement({ settlementId: SOFIA_CAPTURED_ID, idempotencyKey: '' }),
    ).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    });
    await expect(
      repo.refundSettlement({ settlementId: SOFIA_CAPTURED_ID, idempotencyKey: '' }),
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  it('rejects refund of a non-captured settlement', async () => {
    await expect(
      repo.refundSettlement({ settlementId: ELENA_PENDING_ID, idempotencyKey: 'refund-pending' }),
    ).rejects.toMatchObject({ code: 'NOT_REFUNDABLE' });
  });
});
