import { ApiError } from "../api/httpClient";
import type {
  AppliedPromotion,
  IssuedInvoice,
  RefundRecord,
  RegistrationDetail,
  RegistrationFilterOptions,
  RegistrationFilters,
  RegistrationListItem,
  RegistrationPage,
} from "../domain/adminRegistrations";
import type { AdminRegistrationsRepository } from "./AdminRegistrationsRepository";

const MOCK_ORDER_ID = "60000000-0000-4000-8000-000000000001";
const MOCK_ORDER_LINE_ID = "60000000-0000-4000-8000-000000000099";

const ROWING = "10000000-0000-4000-8000-000000000001";
const SWIMMING = "10000000-0000-4000-8000-000000000002";
const ROWING_SINGLE = "20000000-0000-4000-8000-000000000001";
const SWIMMING_OPEN = "20000000-0000-4000-8000-000000000002";

function seedRows(): RegistrationListItem[] {
  return [
    {
      id: "30000000-0000-4000-8000-000000000001",
      athlete: {
        givenName: "Daniel",
        familyName: "Harper",
        email: "daniel@example.com",
        nationality: "GB",
      },
      sport: { id: ROWING, name: "Rowing" },
      product: { id: ROWING_SINGLE, name: "Single scull" },
      grade: "competitive",
      originalCategoryName: "Senior",
      currentCategoryName: "Senior",
      status: "pending_payment",
      evidenceStatus: "approved",
      payment: {
        state: "unpaid",
        dueMinor: 12000,
        settledMinor: 0,
        currency: "EUR",
      },
      team: null,
      createdAt: "2027-05-14T10:00:00.000Z",
      updatedAt: "2027-05-14T10:00:00.000Z",
    },
    {
      id: "30000000-0000-4000-8000-000000000002",
      athlete: {
        givenName: "Asha",
        familyName: "Khan",
        email: "asha@example.com",
        nationality: "IN",
      },
      sport: { id: SWIMMING, name: "Swimming" },
      product: { id: SWIMMING_OPEN, name: "Open water 5 km" },
      grade: "competitive",
      originalCategoryName: "Open",
      currentCategoryName: "Open",
      status: "confirmed",
      evidenceStatus: "not_required",
      payment: {
        state: "paid",
        dueMinor: 9000,
        settledMinor: 9000,
        currency: "EUR",
      },
      team: null,
      createdAt: "2027-05-12T10:00:00.000Z",
      updatedAt: "2027-05-13T12:00:00.000Z",
    },
    {
      id: "30000000-0000-4000-8000-000000000003",
      athlete: {
        givenName: "Marta",
        familyName: "Rossi",
        email: "marta@example.com",
        nationality: "IT",
      },
      sport: { id: ROWING, name: "Rowing" },
      product: { id: ROWING_SINGLE, name: "Single scull" },
      grade: "recreational",
      originalCategoryName: "Masters",
      currentCategoryName: "Masters",
      status: "draft",
      evidenceStatus: "pending",
      payment: {
        state: "unpaid",
        dueMinor: 0,
        settledMinor: 0,
        currency: null,
      },
      team: { id: "40000000-0000-4000-8000-000000000001", name: "Como Crew" },
      createdAt: "2027-05-10T10:00:00.000Z",
      updatedAt: "2027-05-10T10:00:00.000Z",
    },
  ];
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function actionFor(
  status: string,
): Array<{ action: string; toStatus: string }> {
  if (status === "confirmed")
    return [
      { action: "cancel", toStatus: "cancelled" },
      { action: "disqualify", toStatus: "disqualified" },
    ];
  if (status === "cancelled" || status === "disqualified")
    return [
      {
        action: "reinstate",
        toStatus: status === "disqualified" ? "confirmed" : "draft",
      },
    ];
  return [{ action: "cancel", toStatus: "cancelled" }];
}

function matches(
  row: RegistrationListItem,
  input: RegistrationFilters,
): boolean {
  const search = input.search?.toLowerCase().trim();
  return (
    (!input.sportId || row.sport.id === input.sportId) &&
    (!input.productId || row.product.id === input.productId) &&
    (!input.category ||
      (row.currentCategoryName ?? row.originalCategoryName) ===
        input.category) &&
    (!input.status?.length || input.status.includes(row.status)) &&
    (!input.grade || row.grade === input.grade) &&
    (!input.paymentState || row.payment.state === input.paymentState) &&
    (!input.evidenceState || row.evidenceStatus === input.evidenceState) &&
    (!input.teamId || row.team?.id === input.teamId) &&
    (!search ||
      `${row.id} ${row.athlete.givenName} ${row.athlete.familyName} ${row.athlete.email}`
        .toLowerCase()
        .includes(search))
  );
}

export class MockAdminRegistrationsRepository implements AdminRegistrationsRepository {
  private rows = seedRows();
  private refunds: RefundRecord[] = [];
  private refundSeq = 0;
  private appliedPromotions = new Set<string>();

  async list(input: RegistrationFilters): Promise<RegistrationPage> {
    const limit = input.limit ?? 50;
    const filtered = this.rows.filter((row) => matches(row, input));
    const start = input.cursor
      ? Math.max(0, filtered.findIndex((row) => row.id === input.cursor) + 1)
      : 0;
    const items = filtered.slice(start, start + limit);
    const last = items.at(-1);
    return clone({
      items,
      ...(start + items.length < filtered.length && last
        ? { cursor: last.id }
        : {}),
    });
  }

  async counts(input: RegistrationFilters): Promise<Record<string, number>> {
    const { status: _status, ...withoutStatus } = input;
    return this.rows
      .filter((row) => matches(row, withoutStatus))
      .reduce<Record<string, number>>((all, row) => {
        all[row.status] = (all[row.status] ?? 0) + 1;
        return all;
      }, {});
  }

  async filterOptions(): Promise<RegistrationFilterOptions> {
    return {
      sports: [
        { id: ROWING, name: "Rowing" },
        { id: SWIMMING, name: "Swimming" },
      ],
      products: [
        { id: ROWING_SINGLE, sportId: ROWING, name: "Single scull" },
        { id: SWIMMING_OPEN, sportId: SWIMMING, name: "Open water 5 km" },
      ],
      categories: ["Masters", "Open", "Senior"],
    };
  }

  async get(entryId: string): Promise<RegistrationDetail> {
    const row = this.rows.find((item) => item.id === entryId);
    if (!row)
      throw new ApiError(
        "REGISTRATION_ENTRY_NOT_FOUND",
        "registrations.entry.not_found",
        404,
      );
    return clone({
      ...row,
      athlete: { ...row.athlete, dateOfBirth: "1988-07-18" },
      ruleVersion: {
        id: "50000000-0000-4000-8000-000000000001",
        version: 1,
        status: "published",
      },
      category: {
        original: row.originalCategoryName,
        current: row.currentCategoryName,
        reason: null,
        derived: {
          ruleVersionId: "50000000-0000-4000-8000-000000000001",
          referenceDate: "2027-12-31",
          categoryName: row.currentCategoryName ?? "",
        },
        auditTrail: [],
      },
      statusHistory: [
        {
          fromStatus: null,
          toStatus: row.status,
          actorKind: "participant",
          actorName: null,
          reason: null,
          occurredAt: row.createdAt,
        },
      ],
      allowedActions: actionFor(row.status),
      money: {
        orders: row.payment.dueMinor
          ? [
              {
                id: MOCK_ORDER_ID,
                status:
                  row.payment.state === "paid" ? "paid" : "awaiting_payment",
                currency: row.payment.currency ?? "EUR",
                netMinor: row.payment.dueMinor,
                taxMinor: 0,
                grossMinor: row.payment.dueMinor,
                createdAt: row.createdAt,
                lines: [
                  {
                    id: MOCK_ORDER_LINE_ID,
                    kind: "fee",
                    description: "Entry fee",
                    taxRateBp: 0,
                    grossMinor: row.payment.dueMinor,
                    paidMinor: row.payment.settledMinor,
                    refundedMinor: this.refunds
                      .filter(
                        (r) =>
                          r.orderId === MOCK_ORDER_ID &&
                          r.status === "completed",
                      )
                      .reduce((sum, r) => sum + r.amountMinor, 0),
                  },
                ],
              },
            ]
          : [],
        payments: row.payment.settledMinor
          ? [
              {
                id: "70000000-0000-4000-8000-000000000001",
                orderId: MOCK_ORDER_ID,
                status: "settled",
                amountMinor: row.payment.settledMinor,
                currency: row.payment.currency ?? "EUR",
                createdAt: row.updatedAt,
              },
            ]
          : [],
        refunds: clone(this.refunds.filter((r) => r.orderId === MOCK_ORDER_ID)),
      },
      evidence: {
        ordinary: [],
        restrictedCount: 0,
        hasRestrictedEvidence: false,
        restrictedStatus: "none",
      },
      team: row.team ? { ...row.team, lockedAt: null, memberCount: 4 } : null,
    });
  }

  async transition(input: {
    entryId: string;
    action: string;
    idempotencyKey: string;
    reason?: string;
  }): Promise<void> {
    if (!input.idempotencyKey)
      throw new ApiError(
        "IDEMPOTENCY_KEY_REQUIRED",
        "idempotency.key.required",
        400,
      );
    const row = this.rows.find((item) => item.id === input.entryId);
    if (!row)
      throw new ApiError(
        "REGISTRATION_ENTRY_NOT_FOUND",
        "registrations.entry.not_found",
        404,
      );
    const next = actionFor(row.status).find(
      (item) => item.action === input.action,
    );
    if (!next)
      throw new ApiError(
        "ILLEGAL_STATUS_TRANSITION",
        "registration.transition.not_permitted",
        422,
      );
    row.status = next.toStatus;
    row.updatedAt = new Date().toISOString();
  }

  async exportCsv(input: RegistrationFilters): Promise<string> {
    const rows = this.rows.filter((row) => matches(row, input));
    const header = "entry_id,athlete,status,payment_state";
    const body = rows.map(
      (row) =>
        `${row.id},${row.athlete.givenName} ${row.athlete.familyName},${row.status},${row.payment.state}`,
    );
    return [header, ...body].join("\r\n");
  }

  async applyPromotion(input: {
    orderId: string;
    code: string;
    idempotencyKey: string;
  }): Promise<AppliedPromotion> {
    const row = this.rows.find((item) => item.payment.state !== "paid");
    if (!row)
      throw new ApiError("ORDER_NOT_FOUND", "finance.order.not_found", 404);
    if (row.payment.state === "paid") {
      throw new ApiError(
        "ORDER_ALREADY_PAID",
        "finance.promotion.order_already_paid",
        422,
      );
    }
    if (this.appliedPromotions.has(input.orderId)) {
      throw new ApiError(
        "PROMOTION_ALREADY_APPLIED",
        "finance.promotion.already_applied",
        409,
      );
    }
    if (input.code.trim().toUpperCase() !== "COMO10") {
      throw new ApiError(
        "PROMOTION_NOT_FOUND",
        "finance.promotion.not_found",
        404,
      );
    }
    this.appliedPromotions.add(input.orderId);
    const appliedMinor = Math.round(row.payment.dueMinor * 0.1);
    row.payment.dueMinor -= appliedMinor;
    return clone({
      orderId: input.orderId,
      code: input.code,
      kind: "percentage" as const,
      appliedMinor,
      orderTotalMinor: row.payment.dueMinor,
    });
  }

  async requestRefund(input: {
    orderId: string;
    amountMinor: number;
    reasonKey: string;
    idempotencyKey: string;
  }): Promise<RefundRecord> {
    this.refundSeq += 1;
    const record: RefundRecord = {
      id: `80000000-0000-4000-8000-${String(this.refundSeq).padStart(12, "0")}`,
      orderId: input.orderId,
      status: "pending",
      amountMinor: input.amountMinor,
      currency: "EUR",
      requestedBy: "mock-oc-admin",
      approvedBy: null,
    };
    this.refunds.push(record);
    return clone(record);
  }

  async approveRefund(input: {
    refundId: string;
    allocations: Array<{ orderLineId: string; amountMinor: number }>;
    idempotencyKey: string;
  }): Promise<RefundRecord> {
    const record = this.refunds.find((item) => item.id === input.refundId);
    if (!record)
      throw new ApiError("REFUND_NOT_FOUND", "finance.refund.not_found", 404);
    if (record.status !== "pending") {
      throw new ApiError(
        "REFUND_NOT_PENDING",
        "finance.refund.not_pending",
        409,
      );
    }
    const allocated = input.allocations.reduce(
      (sum, a) => sum + a.amountMinor,
      0,
    );
    if (allocated !== record.amountMinor) {
      throw new ApiError(
        "ALLOCATION_MISMATCH",
        "finance.refund.allocation_mismatch",
        422,
      );
    }
    record.status = "completed";
    record.approvedBy = "mock-oc-admin-2";
    return clone(record);
  }

  async rejectRefund(input: {
    refundId: string;
    reasonKey: string;
    idempotencyKey: string;
  }): Promise<RefundRecord> {
    const record = this.refunds.find((item) => item.id === input.refundId);
    if (!record)
      throw new ApiError("REFUND_NOT_FOUND", "finance.refund.not_found", 404);
    if (record.status !== "pending") {
      throw new ApiError(
        "REFUND_NOT_PENDING",
        "finance.refund.not_pending",
        409,
      );
    }
    record.status = "rejected";
    return clone(record);
  }

  async generateInvoice(input: {
    orderId: string;
    idempotencyKey: string;
  }): Promise<IssuedInvoice> {
    const row = this.rows.find(
      (item) => item.payment.dueMinor > 0 && item.payment.state === "paid",
    );
    if (!row)
      throw new ApiError(
        "ORDER_NOT_PAID",
        "finance.invoice.order_not_paid",
        422,
      );
    return clone({
      id: "90000000-0000-4000-8000-000000000001",
      orderId: input.orderId,
      number: "COMO27-INV-0001",
      netMinor: row.payment.dueMinor,
      taxMinor: 0,
      grossMinor: row.payment.dueMinor,
      issuedAt: new Date().toISOString(),
    });
  }
}
