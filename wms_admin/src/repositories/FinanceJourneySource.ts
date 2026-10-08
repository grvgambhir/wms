import type { JourneyPayment, RegistrationEntry, RegistrationOrder } from '../domain/registrationJourney';

/** Slice of the registration-journey store that A05 Finance merges into settlements. */
export type FinanceJourneySource = {
  ensureHydrated(): Promise<void>;
  listLiveOrders(): RegistrationOrder[];
  listLivePayments(): JourneyPayment[];
  listLiveEntries(): RegistrationEntry[];
};

export const emptyFinanceJourneySource: FinanceJourneySource = {
  ensureHydrated: async () => undefined,
  listLiveOrders: () => [],
  listLivePayments: () => [],
  listLiveEntries: () => [],
};
