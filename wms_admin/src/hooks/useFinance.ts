import { useCallback, useEffect, useState } from "react";

import type {
  FinanceOverview,
  RefundSettlementRequest,
  RefundSettlementResponse,
} from "../domain/finance";
import { financeRepository } from "../repositories/provider";
import { useToast } from "../components/ui/ToastProvider";

export interface UseFinanceResult {
  readonly overview: FinanceOverview | null;
  readonly isLoading: boolean;
  readonly isMutating: boolean;
  readonly refundingSettlementId: string | null;
  readonly error: string | null;
  readonly reload: () => Promise<void>;
  readonly refundSettlement: (
    input: RefundSettlementRequest,
  ) => Promise<RefundSettlementResponse | null>;
}

export function useFinance(): UseFinanceResult {
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refundingSettlementId, setRefundingSettlementId] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setOverview(await financeRepository.getOverview());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Finance data could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const refundSettlement = useCallback(
    async (input: RefundSettlementRequest) => {
      setRefundingSettlementId(input.settlementId);
      setError(null);
      try {
        const response = await financeRepository.refundSettlement(input);
        setOverview((current) => {
          if (!current) return current;
          return {
            summary: response.summary,
            settlements: {
              ...current.settlements,
              items: current.settlements.items.map((item) =>
                item.id === response.settlement.id ? response.settlement : item,
              ),
            },
          };
        });
        showToast({ variant: "success", title: "Refund recorded" });
        return response;
      } catch (caught) {
        const message =
          caught instanceof Error
            ? caught.message
            : "The refund could not be completed.";
        setError(message);
        showToast({
          variant: "error",
          title: "Refund failed",
          description: message,
        });
        return null;
      } finally {
        setRefundingSettlementId(null);
      }
    },
    [showToast],
  );

  return {
    overview,
    isLoading,
    isMutating: refundingSettlementId != null,
    refundingSettlementId,
    error,
    reload,
    refundSettlement,
  };
}
