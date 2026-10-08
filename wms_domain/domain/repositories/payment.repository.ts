import type { PaymentInput, PaymentResult } from '../models/payment';

export interface PaymentRepository {
  processMockPayment(input: PaymentInput): Promise<PaymentResult>;
}
