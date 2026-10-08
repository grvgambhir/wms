import { DEMO_IDS } from '@/constants/demo';
import type { Payment, PaymentInput, PaymentResult } from '@/domain/models/payment';
import type { PaymentRepository } from '@/domain/repositories/payment.repository';
import { fixtures } from '@/data/mock/fixtures';
import { getJson, setJson } from '@/data/storage/asyncStorage';
import { storageKeys } from '@/data/storage/keys';

const PAYMENT_DELAY_MS = 1200;

export class MockPaymentRepository implements PaymentRepository {
  async processMockPayment(input: PaymentInput): Promise<PaymentResult> {
    await new Promise((resolve) => setTimeout(resolve, PAYMENT_DELAY_MS));

    const feeConfig = fixtures.registrationFees.find((fee) => fee.eventId === input.eventId);
    const promo = feeConfig?.promoCodes?.find(
      (item) => item.code.toUpperCase() === input.promoCode?.trim().toUpperCase(),
    );
    const discountAmount = promo?.discountAmount ?? 0;

    const payment: Payment = {
      id: DEMO_IDS.paymentDemo,
      registrationId: input.registrationId,
      amount: input.amount,
      currency: input.currency,
      promoCode: promo?.code ?? input.promoCode,
      discountAmount: discountAmount || undefined,
      status: 'paid',
      method: input.method,
      createdAt: new Date().toISOString(),
    };

    const existing = (await getJson<Payment[]>(storageKeys.payments)) ?? [];
    existing.push(payment);
    await setJson(storageKeys.payments, existing);

    return { payment, success: true };
  }
}
