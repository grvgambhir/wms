// Captured-only receipt projection. A half-paid order is not a receipt — callers
// get `null` and the screen shows the empty state. Reads the journey snapshot
// (repository-backed); never invents VAT, invoice numbers, or sequential IDs.
import type {
  JourneyPayment,
  RegistrationJourneySnapshot,
  RegistrationOrder,
} from '@/domain/models/registrationJourney';

/** Fields the participant receipt is allowed to show — all from existing domain types. */
export type CapturedPaymentReceipt = {
  participantName: string;
  orderId: string;
  providerReference: string | null;
  eventName: string;
  eventStartDate: string;
  eventEndDate: string;
  sportProductName: string;
  categoryName: string;
  currency: RegistrationOrder['currency'];
  subtotalAmountMinor: number;
  serviceAmountMinor: number;
  totalAmountMinor: number;
  method: JourneyPayment['method'];
  /** Capture time when present (`updatedAt`); otherwise the payment record's `createdAt`. */
  paidAt: string;
};

function fullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

/** Build a receipt only when the order is paid and the payment is captured. */
export function buildCapturedReceipt(
  snapshot: RegistrationJourneySnapshot,
): CapturedPaymentReceipt | null {
  const { order, payment, entry, event, athlete } = snapshot;
  if (!order || !payment) return null;
  if (order.status !== 'paid' || payment.status !== 'captured') return null;

  const product = snapshot.sportEntryProducts.items.find((item) => item.id === entry.sportEntryProductId);
  const sport = snapshot.sports.items.find((item) => item.id === entry.sportId);
  const sportProductName = [sport?.name, product?.name].filter(Boolean).join(' · ') || '—';

  return {
    participantName: fullName(athlete.firstName, athlete.lastName),
    orderId: order.id,
    providerReference: payment.providerReference ?? null,
    eventName: event.name,
    eventStartDate: event.startDate,
    eventEndDate: event.endDate,
    sportProductName,
    categoryName: entry.currentCategoryName ?? '—',
    currency: order.currency,
    subtotalAmountMinor: order.subtotalAmountMinor,
    serviceAmountMinor: order.serviceAmountMinor,
    totalAmountMinor: order.totalAmountMinor,
    method: payment.method,
    paidAt: payment.updatedAt || payment.createdAt,
  };
}
