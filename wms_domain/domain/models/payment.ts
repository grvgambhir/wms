export type PaymentStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'refunded';

export interface Payment {
  id: string;
  registrationId?: string;
  amount: number;
  currency: string;
  promoCode?: string;
  discountAmount?: number;
  status: PaymentStatus;
  method: string;
  createdAt: string;
}

export interface PaymentInput {
  registrationId: string;
  eventId: string;
  amount: number;
  currency: string;
  method: string;
  promoCode?: string;
}

export interface PaymentResult {
  payment: Payment;
  success: boolean;
}
