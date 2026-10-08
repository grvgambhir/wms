import type {
  AppliedPromotion,
  IssuedInvoice,
  RefundRecord,
  RegistrationDetail,
  RegistrationFilterOptions,
  RegistrationFilters,
  RegistrationPage,
} from "../domain/adminRegistrations";

export interface AdminRegistrationsRepository {
  list(input: RegistrationFilters): Promise<RegistrationPage>;
  counts(input: RegistrationFilters): Promise<Record<string, number>>;
  filterOptions(eventId?: string): Promise<RegistrationFilterOptions>;
  get(entryId: string): Promise<RegistrationDetail>;
  transition(input: {
    entryId: string;
    action: string;
    idempotencyKey: string;
    reason?: string;
  }): Promise<void>;
  exportCsv(input: RegistrationFilters): Promise<string>;
  applyPromotion(input: {
    orderId: string;
    code: string;
    idempotencyKey: string;
  }): Promise<AppliedPromotion>;
  requestRefund(input: {
    orderId: string;
    amountMinor: number;
    reasonKey: string;
    idempotencyKey: string;
  }): Promise<RefundRecord>;
  approveRefund(input: {
    refundId: string;
    allocations: Array<{ orderLineId: string; amountMinor: number }>;
    idempotencyKey: string;
  }): Promise<RefundRecord>;
  rejectRefund(input: {
    refundId: string;
    reasonKey: string;
    idempotencyKey: string;
  }): Promise<RefundRecord>;
  generateInvoice(input: {
    orderId: string;
    idempotencyKey: string;
  }): Promise<IssuedInvoice>;
}
