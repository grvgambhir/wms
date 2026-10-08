import { useCallback, useEffect, useState } from "react";

import type {
  AccreditationOverview,
  CredentialActionResponse,
  IssueCredentialRequest,
  RevokeCredentialRequest,
} from "../domain/accreditationDesk";
import { accreditationDeskRepository } from "../repositories/provider";
import { useToast } from "../components/ui/ToastProvider";

export interface UseAccreditationDeskResult {
  readonly overview: AccreditationOverview | null;
  readonly isLoading: boolean;
  readonly pendingRecordId: string | null;
  readonly error: string | null;
  readonly reload: () => Promise<void>;
  readonly issueCredential: (input: IssueCredentialRequest) => Promise<void>;
  readonly reissueCredential: (input: IssueCredentialRequest) => Promise<void>;
  readonly revokeCredential: (input: RevokeCredentialRequest) => Promise<void>;
}

export function useAccreditationDesk(): UseAccreditationDeskResult {
  const [overview, setOverview] = useState<AccreditationOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingRecordId, setPendingRecordId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setOverview(await accreditationDeskRepository.getOverview());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Accreditations could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const runAction = useCallback(
    async (
      recordId: string,
      action: () => Promise<CredentialActionResponse>,
      label: string,
    ) => {
      setPendingRecordId(recordId);
      setError(null);
      try {
        const response = await action();
        setOverview((current) =>
          current
            ? {
                summary: response.summary,
                records: {
                  ...current.records,
                  items: current.records.items.map((item) =>
                    item.id === response.record.id ? response.record : item,
                  ),
                },
              }
            : current,
        );
        showToast({ variant: "success", title: label });
      } catch (caught) {
        const message =
          caught instanceof Error
            ? caught.message
            : "The credential action could not be completed.";
        setError(message);
        showToast({
          variant: "error",
          title: `${label} failed`,
          description: message,
        });
      } finally {
        setPendingRecordId(null);
      }
    },
    [showToast],
  );

  return {
    overview,
    isLoading,
    pendingRecordId,
    error,
    reload,
    issueCredential: (input) =>
      runAction(
        input.recordId,
        () => accreditationDeskRepository.issueCredential(input),
        "Credential issued",
      ),
    reissueCredential: (input) =>
      runAction(
        input.recordId,
        () => accreditationDeskRepository.reissueCredential(input),
        "Credential reissued",
      ),
    revokeCredential: (input) =>
      runAction(
        input.recordId,
        () => accreditationDeskRepository.revokeCredential(input),
        "Credential revoked",
      ),
  };
}
