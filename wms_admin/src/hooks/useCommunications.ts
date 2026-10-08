import { useCallback, useEffect, useState } from "react";

import type {
  CommunicationsOverview,
  SendBroadcastInput,
  SendBroadcastResponse,
} from "../domain/communications";
import { communicationsRepository } from "../repositories/provider";
import { useToast } from "../components/ui/ToastProvider";

export interface UseCommunicationsResult {
  readonly overview: CommunicationsOverview | null;
  readonly isLoading: boolean;
  readonly isSending: boolean;
  readonly error: string | null;
  readonly reload: () => Promise<void>;
  readonly sendBroadcast: (
    input: SendBroadcastInput,
  ) => Promise<SendBroadcastResponse | null>;
}

export function useCommunications(): UseCommunicationsResult {
  const [overview, setOverview] = useState<CommunicationsOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setOverview(await communicationsRepository.getOverview());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Communications could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const sendBroadcast = useCallback(
    async (input: SendBroadcastInput) => {
      setIsSending(true);
      setError(null);
      try {
        const response = await communicationsRepository.sendBroadcast(input);
        setOverview((current) =>
          current
            ? {
                ...current,
                summary: response.summary,
                history: {
                  items: [
                    response.record,
                    ...current.history.items.filter(
                      (item) => item.id !== response.record.id,
                    ),
                  ],
                  total: response.summary.sentCount,
                },
              }
            : current,
        );
        showToast({ variant: "success", title: "Broadcast sent" });
        return response;
      } catch (caught) {
        const message =
          caught instanceof Error
            ? caught.message
            : "The broadcast could not be sent.";
        setError(message);
        showToast({
          variant: "error",
          title: "Broadcast failed",
          description: message,
        });
        return null;
      } finally {
        setIsSending(false);
      }
    },
    [showToast],
  );

  return { overview, isLoading, isSending, error, reload, sendBroadcast };
}
