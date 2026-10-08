/**
 * Payment-service boundary. D4 has not selected a PSP, so registration code depends on
 * this interface and the development/test build uses the deterministic stub below.
 *
 * `idempotencyKey` is forwarded to the provider. A real adapter must use the PSP's native
 * idempotency facility with this exact value; it must never generate a fresh key on retry.
 */

export const PAYMENT_PROVIDER = Symbol('PaymentProvider');

export type PaymentChargeRequest = {
  orderId: string;
  amountMinor: bigint;
  currency: string;
  method: 'card';
  idempotencyKey: string;
  /** Demo-only behaviour retained from the existing registration contract. */
  simulateFirstAttemptTimeout: boolean;
};

export type PaymentCharge = {
  providerReference: string;
  chargeCount: number;
  duplicateChargePrevented: boolean;
};

export type PaymentRefundRequest = {
  /** The capture being reversed. A refund is always against a specific charge. */
  providerReference: string;
  amountMinor: bigint;
  currency: string;
  idempotencyKey: string;
};

export type PaymentRefund = {
  providerRefundReference: string;
  duplicateRefundPrevented: boolean;
};

export interface PaymentProvider {
  charge(input: PaymentChargeRequest): Promise<PaymentCharge>;
  /**
   * Reverses a capture. A refund sent twice is worse than a charge sent twice — the money is
   * gone and there is nothing to reconcile it against — so the same native-idempotency rule
   * applies with more force: forward this key, never mint a new one on retry.
   */
  refund(input: PaymentRefundRequest): Promise<PaymentRefund>;
}

/**
 * Deterministic non-networking adapter used until D4 is decided. The idempotency map lives
 * here, at the provider seam, rather than as fake payment logic in the repository.
 */
export class StubPaymentProvider implements PaymentProvider {
  private readonly captures = new Map<string, PaymentCharge>();
  private calls = 0;

  get callCount(): number {
    return this.calls;
  }

  private readonly refunds = new Map<string, PaymentRefund>();
  private refundCalls = 0;

  get refundCallCount(): number {
    return this.refundCalls;
  }

  async refund(input: PaymentRefundRequest): Promise<PaymentRefund> {
    this.refundCalls += 1;
    const previous = this.refunds.get(input.idempotencyKey);
    if (previous) return { ...previous, duplicateRefundPrevented: true };
    const issued: PaymentRefund = {
      providerRefundReference: `stub_re_${input.idempotencyKey}`,
      duplicateRefundPrevented: false,
    };
    this.refunds.set(input.idempotencyKey, issued);
    return issued;
  }

  async charge(input: PaymentChargeRequest): Promise<PaymentCharge> {
    this.calls += 1;
    const previous = this.captures.get(input.idempotencyKey);
    if (previous) {
      return { ...previous, duplicateChargePrevented: true };
    }

    const capture: PaymentCharge = {
      providerReference: `stub_psp_${input.orderId}_${input.idempotencyKey}`,
      chargeCount: 1,
      // The demo timeout represents a response lost after capture. The provider's native
      // idempotency key is what makes its reconciliation/retry a lookup, not a second charge.
      duplicateChargePrevented: input.simulateFirstAttemptTimeout,
    };
    this.captures.set(input.idempotencyKey, capture);
    return capture;
  }
}
