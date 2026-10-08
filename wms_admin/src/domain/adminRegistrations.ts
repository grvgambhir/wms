import { ApiError } from "../api/httpClient";

export type PaymentState = "unpaid" | "paid" | "refunded";

export type RegistrationFilters = {
  eventId?: string;
  sportId?: string;
  productId?: string;
  category?: string;
  status?: string[];
  grade?: string;
  paymentState?: PaymentState;
  evidenceState?: string;
  teamId?: string;
  search?: string;
  cursor?: string;
  limit?: number;
};

export type RegistrationListItem = {
  id: string;
  athlete: {
    givenName: string;
    familyName: string;
    email: string | null;
    nationality: string | null;
  };
  sport: { id: string; name: string };
  product: { id: string; name: string };
  grade: string;
  originalCategoryName: string | null;
  currentCategoryName: string | null;
  status: string;
  evidenceStatus: string;
  payment: {
    state: PaymentState;
    dueMinor: number;
    settledMinor: number;
    currency: string | null;
  };
  team: { id: string; name: string | null } | null;
  createdAt: string;
  updatedAt: string;
};

export type RegistrationPage = {
  items: RegistrationListItem[];
  cursor?: string;
};

export type RegistrationFilterOptions = {
  sports: Array<{ id: string; name: string }>;
  products: Array<{ id: string; sportId: string; name: string }>;
  categories: string[];
};

export type RegistrationDetail = RegistrationListItem & {
  athlete: RegistrationListItem["athlete"] & { dateOfBirth: string };
  ruleVersion: { id: string; version: number | null; status: string | null };
  category: {
    original: string | null;
    current: string | null;
    reason: string | null;
    derived: {
      ruleVersionId: string;
      referenceDate: string;
      categoryName: string;
    };
    auditTrail: Array<{
      fromCategory: string | null;
      toCategory: string;
      trigger: string;
      approvedBy: string | null;
      reason: string | null;
      occurredAt: string;
    }>;
  };
  statusHistory: Array<{
    fromStatus: string | null;
    toStatus: string;
    actorKind: string;
    actorName: string | null;
    reason: string | null;
    occurredAt: string;
  }>;
  allowedActions: Array<{ action: string; toStatus: string }>;
  money: {
    orders: Array<{
      id: string;
      status: string;
      currency: string;
      netMinor: number;
      taxMinor: number;
      grossMinor: number;
      createdAt: string;
      lines: Array<{
        id: string;
        kind: string;
        description: string;
        taxRateBp: number;
        grossMinor: number;
        paidMinor: number;
        refundedMinor: number;
      }>;
    }>;
    payments: Array<{
      id: string;
      orderId: string;
      status: string;
      amountMinor: number;
      currency: string;
      createdAt: string;
    }>;
    refunds: Array<{
      id: string;
      orderId: string;
      status: string;
      amountMinor: number;
      currency: string;
      createdAt: string;
    }>;
  };
  evidence: {
    ordinary: Array<{
      id: string;
      kind: string;
      status: string;
      scanStatus: string;
      uploadedAt: string | null;
    }>;
    restrictedCount: number;
    hasRestrictedEvidence: boolean;
    restrictedStatus: "none" | "present";
  };
  team:
    | (NonNullable<RegistrationListItem["team"]> & {
        lockedAt: string | null;
        memberCount: number;
      })
    | null;
};

export type AppliedPromotion = {
  orderId: string;
  code: string;
  kind: "percentage" | "fixed" | "waiver";
  appliedMinor: number;
  orderTotalMinor: number;
};

export type RefundRecord = {
  id: string;
  orderId: string;
  status: string;
  amountMinor: number;
  currency: string;
  requestedBy: string;
  approvedBy: string | null;
};

export type IssuedInvoice = {
  id: string;
  orderId: string;
  number: string;
  netMinor: number;
  taxMinor: number;
  grossMinor: number;
  issuedAt: string;
};

export const REFUND_REASONS = [
  {
    key: "finance.refund_reason.participant_request",
    label: "Participant request",
  },
  { key: "finance.refund_reason.event_change", label: "Event/schedule change" },
  { key: "finance.refund_reason.duplicate_charge", label: "Duplicate charge" },
  { key: "finance.refund_reason.oc_decision", label: "OC decision" },
] as const;

export const REGISTRATION_PAGE_SIZE = 50;

export function registrationName(
  item: Pick<RegistrationListItem, "athlete">,
): string {
  return `${item.athlete.givenName} ${item.athlete.familyName}`.trim();
}

export function paymentStateLabel(state: PaymentState): string {
  return state === "paid"
    ? "Paid"
    : state === "refunded"
      ? "Refunded"
      : "Unpaid";
}

export function statusLabel(status: string): string {
  const text = status.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const ACTION_LABELS: Record<string, string> = {
  cancel: "Cancel entry",
  disqualify: "Disqualify",
  substitute: "Mark substituted",
  reinstate: "Reinstate",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? statusLabel(action);
}

/** Reinstate undoes a decision; every other admin action ends or replaces an athlete's entry. */
export function actionNeedsReason(action: string): boolean {
  return action !== "reinstate";
}

/** Amounts arrive in minor units (cents). Never show the raw integer to staff. */
export function formatMoney(minor: number, currency: string | null): string {
  if (!currency) return (minor / 100).toFixed(2);
  try {
    return new Intl.NumberFormat("en-IE", {
      style: "currency",
      currency,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

export function productOptionLabel(
  product: { sportId: string; name: string },
  sports: ReadonlyArray<{ id: string; name: string }>,
): string {
  const sport = sports.find((item) => item.id === product.sportId);
  return sport ? `${sport.name} · ${product.name}` : product.name;
}

export function explainRegistrationError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "REGISTRATION_ENTRY_NOT_FOUND")
      return "This registration no longer exists.";
    if (error.code === "INVALID_CURSOR" || error.code === "VALIDATION_ERROR") {
      return "One of the registration filters is invalid. Clear it and try again.";
    }
    if (error.code === "ILLEGAL_STATUS_TRANSITION") {
      return "That action is no longer available. The entry has been refreshed.";
    }
    if (error.code === "ORDER_ALREADY_PAID")
      return "This order is already paid — a price change now would need a refund, not a discount.";
    if (error.code === "ORDER_NOT_PAID")
      return "This order has not been paid yet, so there is nothing to invoice.";
    if (error.code === "PROMOTION_NOT_FOUND")
      return "No promotion exists with that code for this event.";
    if (error.code === "PROMOTION_NOT_EFFECTIVE")
      return "That promotion is not active right now.";
    if (error.code === "PROMOTION_EXHAUSTED")
      return "That promotion has already reached its usage limit.";
    if (error.code === "PROMOTION_ALREADY_APPLIED")
      return "That promotion is already applied to this order.";
    if (
      error.code === "PROMOTION_NO_EFFECT" ||
      error.code === "NOTHING_TO_DISCOUNT"
    )
      return "That promotion would not change this order's total.";
    if (error.code === "NO_CAPTURED_PAYMENT")
      return "Nothing has been captured on this order yet.";
    if (error.code === "REFUND_EXCEEDS_CAPTURE")
      return "That amount is more than was captured on this order.";
    if (error.code === "REFUND_NOT_FOUND")
      return "This refund request no longer exists.";
    if (error.code === "REFUND_NOT_PENDING")
      return "This refund was already decided. Refresh to see the current status.";
    if (error.code === "ALLOCATION_MISMATCH")
      return "The amounts allocated across order lines must add up to the refund total.";
    if (error.code === "SAME_PERSON" || error.code === "DUAL_CONTROL_REQUIRED")
      return "A refund needs a second, different person to decide it — the requester cannot also approve or reject it.";
    return "The registration request was refused.";
  }
  if (error instanceof TypeError)
    return "The request did not reach the server. Try again.";
  return "The registration request could not be completed.";
}
