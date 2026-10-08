/// <reference types="jest" />
import type { RegistrationJourneySnapshot } from '@/domain/models/registrationJourney';
import { buildCapturedReceipt } from './receiptView';

function snapshot(
  overrides: Partial<RegistrationJourneySnapshot> & {
    order?: RegistrationJourneySnapshot['order'];
    payment?: RegistrationJourneySnapshot['payment'];
  } = {},
): RegistrationJourneySnapshot {
  return {
    event: {
      id: 'event-1',
      name: 'Open Masters Games Como Lake 2027',
      city: 'Como',
      country: 'Italy',
      countryCode: 'IT',
      startDate: '2027-09-17T00:00:00.000Z',
      endDate: '2027-09-26T21:59:59.000Z',
      status: 'registration_open',
      sportIds: [],
    },
    athlete: {
      id: 'ath-1',
      firstName: 'Daniel',
      lastName: 'Harper',
      dateOfBirth: '1985-03-15',
      nationalityCountryCode: 'GB',
      email: 'daniel@example.com',
    },
    sports: {
      items: [{ id: 'sport-tennis', name: 'Tennis', eventId: 'event-1', disciplineIds: [], availability: 'available' }],
      total: 1,
    },
    sportEntryProducts: {
      items: [
        {
          id: 'prod-doubles',
          eventId: 'event-1',
          sportId: 'sport-tennis',
          name: "Men's Doubles",
          participantType: 'doubles',
          ruleId: 'rule-1',
          allowedGrades: ['competitive'],
          partnerRequired: true,
          requiresEvidence: false,
        },
      ],
      total: 1,
    },
    partners: { items: [], total: 0 },
    rules: { items: [], total: 0 },
    documents: { items: [], total: 0 },
    entry: {
      id: 'entry-1',
      athleteId: 'ath-1',
      eventId: 'event-1',
      sportId: 'sport-tennis',
      sportEntryProductId: 'prod-doubles',
      grade: 'competitive',
      ruleId: 'rule-1',
      ruleVersion: '2.1',
      currentCategoryName: "Men's Doubles 35–39",
      evidenceStatus: 'not_required',
      status: 'confirmed',
      createdAt: '2026-09-03T07:30:00.000Z',
      updatedAt: '2026-09-05T10:00:00.000Z',
    },
    fees: { items: [], total: 0 },
    quotas: { items: [], total: 0 },
    waitlist: null,
    order: {
      id: 'order-1',
      registrationEntryId: 'entry-1',
      currency: 'EUR',
      subtotalAmountMinor: 9000,
      serviceAmountMinor: 0,
      totalAmountMinor: 9000,
      status: 'paid',
      paymentId: 'pay-1',
      createdAt: '2026-09-03T07:30:00.000Z',
      updatedAt: '2026-09-05T10:00:00.000Z',
    },
    payment: {
      id: 'pay-1',
      orderId: 'order-1',
      registrationEntryId: 'entry-1',
      amountMinor: 9000,
      currency: 'EUR',
      method: 'card',
      status: 'captured',
      providerReference: 'mock_psp_2027_0004417',
      idempotencyKey: 'key-1',
      attemptCount: 2,
      chargeCount: 1,
      createdAt: '2026-09-03T07:30:00.000Z',
      updatedAt: '2026-09-05T10:00:00.000Z',
    },
    ...overrides,
  };
}

describe('buildCapturedReceipt', () => {
  it('projects a captured payment with the order fee breakdown', () => {
    const receipt = buildCapturedReceipt(snapshot());
    expect(receipt).toEqual(
      expect.objectContaining({
        participantName: 'Daniel Harper',
        orderId: 'order-1',
        providerReference: 'mock_psp_2027_0004417',
        eventName: 'Open Masters Games Como Lake 2027',
        sportProductName: "Tennis · Men's Doubles",
        categoryName: "Men's Doubles 35–39",
        subtotalAmountMinor: 9000,
        serviceAmountMinor: 0,
        totalAmountMinor: 9000,
        method: 'card',
        paidAt: '2026-09-05T10:00:00.000Z',
      }),
    );
    expect(receipt!.subtotalAmountMinor + receipt!.serviceAmountMinor).toBe(receipt!.totalAmountMinor);
  });

  it('returns null when the order is not paid', () => {
    const unpaid = snapshot({
      order: {
        id: 'order-1',
        registrationEntryId: 'entry-1',
        currency: 'EUR',
        subtotalAmountMinor: 9000,
        serviceAmountMinor: 0,
        totalAmountMinor: 9000,
        status: 'pending_payment',
        createdAt: '2026-09-03T07:30:00.000Z',
        updatedAt: '2026-09-03T07:30:00.000Z',
      },
      payment: {
        id: 'pay-1',
        orderId: 'order-1',
        registrationEntryId: 'entry-1',
        amountMinor: 9000,
        currency: 'EUR',
        method: 'card',
        status: 'pending',
        idempotencyKey: 'key-1',
        attemptCount: 0,
        chargeCount: 0,
        createdAt: '2026-09-03T07:30:00.000Z',
        updatedAt: '2026-09-03T07:30:00.000Z',
      },
    });
    expect(buildCapturedReceipt(unpaid)).toBeNull();
  });

  it('returns null when there is no order yet', () => {
    expect(buildCapturedReceipt(snapshot({ order: null, payment: null }))).toBeNull();
  });
});
