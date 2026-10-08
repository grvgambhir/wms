import { useCallback, useEffect, useState } from "react";

import type {
  AdminPublishRuleChangeInput,
  RulesOverview,
} from "../domain/rule";
import { rulesRepository } from "../repositories/provider";
import { useToast } from "../components/ui/ToastProvider";

export function useRules() {
  const [overview, setOverview] = useState<RulesOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setOverview(await rulesRepository.getOverview());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Rule register could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const publishRuleChange = useCallback(
    async (input: AdminPublishRuleChangeInput) => {
      setIsPublishing(true);
      setError(null);
      try {
        const response = await rulesRepository.publishRuleChange(input);
        setOverview((current) =>
          current
            ? {
                ...current,
                rule: response.rule,
                versionId: response.rule.id,
                latestNotice: response.notice,
              }
            : current,
        );
        showToast({ variant: "success", title: "Rule published" });
        return response;
      } catch (caught) {
        const message =
          caught instanceof Error
            ? caught.message
            : "The rule could not be published.";
        setError(message);
        showToast({
          variant: "error",
          title: "Publish failed",
          description: message,
        });
        return null;
      } finally {
        setIsPublishing(false);
      }
    },
    [showToast],
  );
  return {
    overview,
    isLoading,
    isPublishing,
    error,
    reload,
    publishRuleChange,
  };
}
