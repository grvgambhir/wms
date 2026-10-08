import { describe, expect, it } from 'vitest';

import { MockFinanceRepository } from './MockFinanceRepository';
import type { FinanceJourneySource } from './FinanceJourneySource';

const SOFIA_SETTLEMENT_ID = '5f2a1b00-0001-4a10-9c01-202700000101';
const MATTEO_SETTLEMENT_ID = '5f2a1b00-0002-4a10-9c02-202700000102';
const SOFIA_AMOUNT_MINOR = 9000;
const LIVE_AMOUNT_MINOR = 9000;

describe('MockFinanceRepository', () => {
  it('summarizes the canonical seed and processes a refund idempotently', async () => {
    const repository = new MockFinanceRepository();
    const initial = await repository.getOverview();
    const sofia = initial.settlements.items.find((item) => item.id === SOFIA_SETTLEMENT_ID);
    expect(sofia?.participantName).toBe('Sofia Greco');
    expect(sofia?.paymentStatus).toBe('captured');
    expect(sofia?.amountMinor).toBe(SOFIA_AMOUNT_MINOR);
    expect(initial.summary.varianceMinor).toBe(0);
    expect(initial.summary.gatewayCapturedMinor).toBe(initial.summary.ledgerExpectedMinor);

    const request = {
      settlementId: SOFIA_SETTLEMENT_ID,
      idempotencyKey: 'refund-sofia',
    } as const;
    const first = await repository.refundSettlement(request);
    const replay = await repository.refundSettlement(request);

    expect(replay).toEqual(first);
    expect(first.settlement.paymentStatus).toBe('refunded');
    expect(first.summary.settledCount).toBe(initial.summary.settledCount - 1);
    expect(first.summary.settledAmountMinor).toBe(initial.summary.settledAmountMinor - SOFIA_AMOUNT_MINOR);
    expect(first.summary.refundedCount).toBe(initial.summary.refundedCount + 1);
    expect(first.summary.refundedAmountMinor).toBe(initial.summary.refundedAmountMinor + SOFIA_AMOUNT_MINOR);
    expect(first.summary.varianceMinor).toBe(0);
  });

  it('requires a key and rejects reuse for another settlement', async () => {
    const repository = new MockFinanceRepository();

    await expect(repository.refundSettlement({
      settlementId: SOFIA_SETTLEMENT_ID,
      idempotencyKey: '',
    })).rejects.toThrow('An idempotency key is required.');

    await repository.refundSettlement({
      settlementId: SOFIA_SETTLEMENT_ID,
      idempotencyKey: 'one-refund-operation',
    });
    await expect(repository.refundSettlement({
      settlementId: MATTEO_SETTLEMENT_ID,
      idempotencyKey: 'one-refund-operation',
    })).rejects.toThrow('The idempotency key has already been used for another settlement.');
  });

  it('merges a live journey order as a Live-tagged settlement without rewriting seed math', async () => {
    const now = '2026-09-04T11:31:30.287Z';
    const live: FinanceJourneySource = {
      ensureHydrated: async () => undefined,
      listLiveOrders: () => [
        {
          id: '846c3118-8c44-4bb4-a861-202700000001',
          registrationEntryId: '74bd5dc5-37cb-49be-8ef6-202700000001',
          currency: 'EUR',
          subtotalAmountMinor: 9000,
          serviceAmountMinor: 0,
          totalAmountMinor: 9000,
          status: 'paid',
          paymentId: '957ab267-b7f4-4207-94a2-202700000001',
          createdAt: now,
          updatedAt: now,
        },
      ],
      listLivePayments: () => [
        {
          id: '957ab267-b7f4-4207-94a2-202700000001',
          orderId: '846c3118-8c44-4bb4-a861-202700000001',
          registrationEntryId: '74bd5dc5-37cb-49be-8ef6-202700000001',
          amountMinor: 9000,
          currency: 'EUR',
          method: 'card',
          status: 'captured',
          providerReference: 'mock_psp_2027_0004417',
          idempotencyKey: 'demo-pay-1',
          attemptCount: 1,
          chargeCount: 1,
          createdAt: now,
          updatedAt: now,
        },
      ],
      listLiveEntries: () => [
        {
          id: '74bd5dc5-37cb-49be-8ef6-202700000001',
          athleteId: '693edf31-739e-4f28-96c4-202700000001',
          eventId: '3d6f0f8a-64c7-4a40-9d31-202709170001',
          sportId: '9db23735-a6df-4d62-8f0c-202700000001',
          sportEntryProductId: '6cf1db22-2605-4d83-bfa4-202700000001',
          grade: 'competitive',
          ruleId: 'eb754330-18ac-4a72-83f1-202700000001',
          ruleVersion: 'v2.1',
          currentCategoryName: "Men's Doubles 35–39",
          evidenceStatus: 'not_required',
          status: 'confirmed',
          createdAt: now,
          updatedAt: now,
        },
      ],
    };

    const baseline = await new MockFinanceRepository().getOverview();
    const overview = await new MockFinanceRepository(live).getOverview();
    const liveRow = overview.settlements.items.find((item) => item.source === 'live');

    expect(liveRow?.participantName).toBe('Daniel Harper');
    expect(liveRow?.sportName).toBe('Tennis');
    expect(liveRow?.entryName).toBe("Men's Doubles");
    expect(liveRow?.paymentStatus).toBe('captured');
    expect(liveRow?.reconciled).toBe(true);
    expect(overview.summary.settledCount).toBe(baseline.summary.settledCount + 1);
    expect(overview.summary.settledAmountMinor).toBe(baseline.summary.settledAmountMinor + LIVE_AMOUNT_MINOR);
    expect(overview.summary.varianceMinor).toBe(0);
  });
});
