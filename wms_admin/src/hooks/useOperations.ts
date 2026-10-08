import { useCallback, useEffect, useState } from "react";

import type { OperationsSnapshot } from "../domain/operations";
import { operationsRepository } from "../repositories/provider";
import { useToast } from "../components/ui/ToastProvider";

type RepositoryAction = () => Promise<OperationsSnapshot>;

export interface UseOperationsResult {
  readonly snapshot: OperationsSnapshot | null;
  readonly isLoading: boolean;
  readonly isMutating: boolean;
  readonly error: string | null;
  readonly reload: () => Promise<void>;
  readonly simulateFailure: () => Promise<void>;
  readonly openIncident: () => Promise<void>;
  readonly applyWorkaround: () => Promise<void>;
  readonly resolveIncident: () => Promise<void>;
  readonly setChangeFreeze: (active: boolean) => Promise<void>;
  readonly resetDemo: () => Promise<void>;
}

export function useOperations(): UseOperationsResult {
  const [snapshot, setSnapshot] = useState<OperationsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const runAction = useCallback(
    async (action: RepositoryAction, label: string) => {
      setIsMutating(true);
      setError(null);
      try {
        setSnapshot(await action());
        showToast({ variant: "success", title: label });
      } catch (caught) {
        const message =
          caught instanceof Error
            ? caught.message
            : "The operation could not be completed.";
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

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setSnapshot(await operationsRepository.getSnapshot());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Operations data could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    snapshot,
    isLoading,
    isMutating,
    error,
    reload,
    simulateFailure: () =>
      runAction(
        () => operationsRepository.simulateResultsFeedFailure(),
        "Results feed failure simulated",
      ),
    openIncident: () =>
      runAction(() => operationsRepository.openS1Incident(), "Incident opened"),
    applyWorkaround: () =>
      runAction(
        () => operationsRepository.applyDocumentedWorkaround(),
        "Workaround applied",
      ),
    resolveIncident: () =>
      runAction(
        () => operationsRepository.resolveIncident(),
        "Incident resolved",
      ),
    setChangeFreeze: (active) =>
      runAction(
        () => operationsRepository.setChangeFreeze(active),
        active ? "Change freeze enabled" : "Change freeze lifted",
      ),
    resetDemo: () =>
      runAction(() => operationsRepository.resetDemo(), "Demo data reset"),
  };
}
