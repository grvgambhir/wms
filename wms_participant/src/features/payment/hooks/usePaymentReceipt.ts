// Receipt data comes from the shared registration journey (same order/payment the
// checkout mutation just wrote). A dedicated query would race the in-memory snapshot.
import { useMemo } from 'react';

import { useRegistrationJourney } from '@/features/registration/RegistrationJourneyContext';
import { buildCapturedReceipt } from '@/features/payment/receiptView';

export function usePaymentReceipt() {
  const journey = useRegistrationJourney();
  const receipt = useMemo(
    () => (journey.snapshot ? buildCapturedReceipt(journey.snapshot) : null),
    [journey.snapshot],
  );

  return {
    receipt,
    isLoading: journey.isLoading,
    isError: journey.isError,
    error: journey.error,
    retry: journey.retry,
  };
}
