/**
 * Reads live orders/payments/entries from wms_backend so Finance can tag them Live
 * against the same governed record the participant journey mutates.
 */
import { backendRequest } from '../auth/backendRequest';
import type { JourneyPayment, RegistrationEntry, RegistrationOrder } from '../domain/registrationJourney';
import type { FinanceJourneySource } from './FinanceJourneySource';

type ListEnvelope<T> = { items: T[]; total: number };

export class ApiFinanceJourneySource implements FinanceJourneySource {
  private orders: RegistrationOrder[] = [];
  private payments: JourneyPayment[] = [];
  private entries: RegistrationEntry[] = [];

  async ensureHydrated(): Promise<void> {
    try {
      const [orders, payments, entries] = await Promise.all([
        backendRequest<ListEnvelope<RegistrationOrder>>('/v1/live/orders'),
        backendRequest<ListEnvelope<JourneyPayment>>('/v1/live/payments'),
        backendRequest<ListEnvelope<RegistrationEntry>>('/v1/live/entries'),
      ]);
      this.orders = orders.items;
      this.payments = payments.items;
      this.entries = entries.items;
    } catch {
      // Backend down: keep Finance on seeded settlements rather than blanking the page.
      this.orders = [];
      this.payments = [];
      this.entries = [];
    }
  }

  listLiveOrders(): RegistrationOrder[] {
    return structuredClone(this.orders);
  }

  listLivePayments(): JourneyPayment[] {
    return structuredClone(this.payments);
  }

  listLiveEntries(): RegistrationEntry[] {
    return structuredClone(this.entries);
  }
}
