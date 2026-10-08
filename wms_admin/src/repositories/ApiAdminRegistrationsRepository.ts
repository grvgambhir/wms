import { backendRequest, backendRequestText } from "../auth/backendRequest";
import type {
  AppliedPromotion,
  IssuedInvoice,
  RefundRecord,
  RegistrationDetail,
  RegistrationFilterOptions,
  RegistrationFilters,
  RegistrationPage,
} from "../domain/adminRegistrations";
import type { AdminRegistrationsRepository } from "./AdminRegistrationsRepository";

function queryFor(input: RegistrationFilters, includeCursor = true): string {
  const params = new URLSearchParams();
  if (input.eventId) params.set("eventId", input.eventId);
  if (input.sportId) params.set("sportId", input.sportId);
  if (input.productId) params.set("productId", input.productId);
  if (input.category) params.set("category", input.category);
  for (const status of input.status ?? []) params.append("status", status);
  if (input.grade) params.set("grade", input.grade);
  if (input.paymentState) params.set("paymentState", input.paymentState);
  if (input.evidenceState) params.set("evidenceState", input.evidenceState);
  if (input.teamId) params.set("teamId", input.teamId);
  if (input.search) params.set("search", input.search);
  if (includeCursor && input.cursor) params.set("cursor", input.cursor);
  if (includeCursor && input.limit) params.set("limit", String(input.limit));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export class ApiAdminRegistrationsRepository implements AdminRegistrationsRepository {
  list(input: RegistrationFilters): Promise<RegistrationPage> {
    return backendRequest<RegistrationPage>(
      `/v1/admin/registrations${queryFor(input)}`,
    );
  }

  counts(input: RegistrationFilters): Promise<Record<string, number>> {
    const {
      status: _status,
      cursor: _cursor,
      limit: _limit,
      ...sameFiltersExceptStatus
    } = input;
    return backendRequest<Record<string, number>>(
      `/v1/admin/registrations/counts${queryFor(sameFiltersExceptStatus, false)}`,
    );
  }

  filterOptions(eventId?: string): Promise<RegistrationFilterOptions> {
    const query = eventId ? `?eventId=${encodeURIComponent(eventId)}` : "";
    return backendRequest<RegistrationFilterOptions>(
      `/v1/admin/registrations/filter-options${query}`,
    );
  }

  get(entryId: string): Promise<RegistrationDetail> {
    return backendRequest<RegistrationDetail>(
      `/v1/admin/registrations/${encodeURIComponent(entryId)}`,
    );
  }

  async transition(input: {
    entryId: string;
    action: string;
    idempotencyKey: string;
    reason?: string;
  }): Promise<void> {
    await backendRequest<unknown>(
      `/v1/registration-entries/${encodeURIComponent(input.entryId)}/status/${encodeURIComponent(input.action)}`,
      {
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: JSON.stringify(input.reason ? { reason: input.reason } : {}),
      },
    );
  }

  exportCsv(input: RegistrationFilters): Promise<string> {
    return backendRequestText(
      `/v1/admin/registrations/export.csv${queryFor(input, false)}`,
    );
  }

  applyPromotion(input: {
    orderId: string;
    code: string;
    idempotencyKey: string;
  }): Promise<AppliedPromotion> {
    return backendRequest<AppliedPromotion>(
      `/v1/orders/${encodeURIComponent(input.orderId)}/promotions`,
      {
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: JSON.stringify({ code: input.code }),
      },
    );
  }

  requestRefund(input: {
    orderId: string;
    amountMinor: number;
    reasonKey: string;
    idempotencyKey: string;
  }): Promise<RefundRecord> {
    return backendRequest<RefundRecord>(
      `/v1/orders/${encodeURIComponent(input.orderId)}/refunds`,
      {
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: JSON.stringify({
          amountMinor: input.amountMinor,
          reasonKey: input.reasonKey,
        }),
      },
    );
  }

  approveRefund(input: {
    refundId: string;
    allocations: Array<{ orderLineId: string; amountMinor: number }>;
    idempotencyKey: string;
  }): Promise<RefundRecord> {
    return backendRequest<RefundRecord>(
      `/v1/refunds/${encodeURIComponent(input.refundId)}/approve`,
      {
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: JSON.stringify({ allocations: input.allocations }),
      },
    );
  }

  rejectRefund(input: {
    refundId: string;
    reasonKey: string;
    idempotencyKey: string;
  }): Promise<RefundRecord> {
    return backendRequest<RefundRecord>(
      `/v1/refunds/${encodeURIComponent(input.refundId)}/reject`,
      {
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: JSON.stringify({ reasonKey: input.reasonKey }),
      },
    );
  }

  generateInvoice(input: {
    orderId: string;
    idempotencyKey: string;
  }): Promise<IssuedInvoice> {
    return backendRequest<IssuedInvoice>(
      `/v1/orders/${encodeURIComponent(input.orderId)}/invoice`,
      {
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: JSON.stringify({}),
      },
    );
  }
}
