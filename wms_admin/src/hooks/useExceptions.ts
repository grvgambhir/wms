import { useCallback, useEffect, useState } from "react";

import type {
  ApproveExceptionRequest,
  EligibilityException,
  ExceptionsOverview,
  RejectExceptionRequest,
} from "../domain/exceptions";
import { requiredSignatures } from "../domain/exceptions";
import { exceptionsRepository } from "../repositories/provider";
import { useToast } from "../components/ui/ToastProvider";

export interface UseExceptionsResult {
  readonly overview: ExceptionsOverview | null;
  readonly isLoading: boolean;
  readonly isMutating: boolean;
  readonly error: string | null;
  readonly reload: () => Promise<void>;
  readonly approveException: (input: ApproveExceptionRequest) => Promise<void>;
  readonly rejectException: (input: RejectExceptionRequest) => Promise<void>;
}

export function useExceptions(): UseExceptionsResult {
  const [overview, setOverview] = useState<ExceptionsOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setOverview(await exceptionsRepository.getOverview());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Exceptions could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const updateCase = useCallback(
    async (action: () => Promise<EligibilityException>, label: string) => {
      setIsMutating(true);
      setError(null);
      try {
        const updated = await action();
        setOverview((current) =>
          current
            ? {
                cases: current.cases.map((item) =>
                  item.id === updated.id ? updated : item,
                ),
              }
            : current,
        );
        const required = requiredSignatures(updated.impact);
        showToast({
          variant: "success",
          title: label,
          description:
            updated.decision === "pending"
              ? `${updated.approvers.length}/${required} signatures so far.`
              : undefined,
        });
      } catch (caught) {
        const message =
          caught instanceof Error
            ? caught.message
            : "The decision could not be recorded.";
        setError(message);
        showToast({
          variant: "error",
          title: `${label} failed`,
          description: message,
        });
      } finally {
        setIsMutating(false);
      }
    },
    [showToast],
  );

  return {
    overview,
    isLoading,
    isMutating,
    error,
    reload,
    approveException: (input) =>
      updateCase(
        () => exceptionsRepository.approveException(input),
        "Exception approved",
      ),
    rejectException: (input) =>
      updateCase(
        () => exceptionsRepository.rejectException(input),
        "Exception rejected",
      ),
  };
}
