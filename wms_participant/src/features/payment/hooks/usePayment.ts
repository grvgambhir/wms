import { useMutation } from '@tanstack/react-query';

import { repositories } from '@/data/providers/repositories';
import type { PaymentInput } from '@/domain/models/payment';

export function useProcessPayment() {
  return useMutation({
    mutationFn: (input: PaymentInput) => repositories.payment.processMockPayment(input),
  });
}
