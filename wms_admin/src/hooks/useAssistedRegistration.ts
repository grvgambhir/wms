import { useCallback, useEffect, useState } from "react";

import type {
  AssistedMutationResponse,
  AssistedRegistrationOverview,
  PerformProxyActionInput,
  RecordProxyConsentInput,
} from "../domain/assistedRegistration";
import { assistedRegistrationRepository } from "../repositories/provider";
import { useToast } from "../components/ui/ToastProvider";

export function useAssistedRegistration() {
  const [overview, setOverview] = useState<AssistedRegistrationOverview | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setOverview(await assistedRegistrationRepository.getOverview());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Assisted sessions could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const runAction = useCallback(
    async (action: () => Promise<AssistedMutationResponse>, label: string) => {
      setIsMutating(true);
      setError(null);
      try {
        const response = await action();
        setOverview((current) =>
          current
            ? {
                ...current,
                sessions: {
                  ...current.sessions,
                  items: current.sessions.items.map((item) =>
                    item.id === response.session.id ? response.session : item,
                  ),
                },
                auditTrail: {
                  items: [response.auditEntry, ...current.auditTrail.items],
                  total: current.auditTrail.total + 1,
                },
              }
            : current,
        );
        showToast({ variant: "success", title: label });
      } catch (caught) {
        const message =
          caught instanceof Error
            ? caught.message
            : "The proxy action could not be completed.";
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
    recordConsent: (input: RecordProxyConsentInput) =>
      runAction(
        () => assistedRegistrationRepository.recordConsent(input),
        "Consent recorded",
      ),
    performProxyAction: (input: PerformProxyActionInput) =>
      runAction(
        () => assistedRegistrationRepository.performProxyAction(input),
        "Proxy action recorded",
      ),
  };
}
