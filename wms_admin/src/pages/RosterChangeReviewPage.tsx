import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, Users } from "lucide-react";

import { AdminPortalShell } from "../components/layout/AdminPortalShell";
import {
  entryLabel,
  explainRosterChangeError,
  type RosterChangeReviewItem,
} from "../domain/rosterChangeReview";
import type { RosterChangeRepository } from "../repositories/RosterChangeRepository";
import { rosterChangeRepository } from "../repositories/provider";
import { useToast } from "../components/ui/ToastProvider";

/**
 * EVD-adjacent work queue for team-roster changes proposed against a confirmed entry.
 *
 * Before this screen existed there was no way to approve one — the backend has carried
 * propose/approve endpoints for a while, but nothing in either portal called them, so a
 * captain's "Save roster & revalidate" on a confirmed team failed with
 * ILLEGAL_STATUS_TRANSITION. This is the missing half: a proposal sits here until an OC
 * approves it, and only approval moves the live roster.
 */
export function RosterChangeReviewPage({
  repository = rosterChangeRepository,
}: {
  readonly repository?: RosterChangeRepository;
} = {}) {
  const [items, setItems] = useState<RosterChangeReviewItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      setItems(await repository.queue());
      setError(null);
    } catch (caught) {
      setError(explainRosterChangeError(caught));
    } finally {
      setIsLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const approve = async (item: RosterChangeReviewItem) => {
    setBusyId(item.id);
    setError(null);
    try {
      await repository.approve(item.id);
      await reload();
      showToast({
        variant: "success",
        title: "Roster change approved",
        description: `${item.teamName} · ${entryLabel(item)}`,
      });
    } catch (caught) {
      await reload();
      const message = explainRosterChangeError(caught);
      setError(message);
      showToast({
        variant: "error",
        title: "Approval failed",
        description: message,
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminPortalShell>
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-5 flex items-center gap-2.5">
          <Users aria-hidden size={22} className="text-primary" />
          <div>
            <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-text">
              Team roster changes
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Proposals against confirmed teams — additions and substitutions
              alike. Nothing moves on the live roster until it is approved here.
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] font-semibold text-text">
            Awaiting approval · {items.length}
          </span>
        </div>

        {error ? (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-danger/30 bg-danger/[0.06] px-4 py-3 text-sm text-red-900"
          >
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div
            role="status"
            className="grid min-h-40 place-items-center rounded-xl border border-border bg-surface text-sm text-text-muted shadow-panel"
          >
            Loading the queue…
          </div>
        ) : items.length === 0 ? (
          <div className="grid min-h-40 place-items-center rounded-xl border border-border bg-surface text-sm text-text-muted shadow-panel">
            Nothing is waiting for approval.
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-[14px] border border-border bg-surface p-4 shadow-panel"
              >
                <div className="flex flex-wrap items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Users aria-hidden size={15} className="text-primary" />
                      <span className="font-bold text-text">
                        {item.teamName}
                      </span>
                      <span className="text-sm text-text-muted">
                        {entryLabel(item)}
                      </span>
                      {item.captainName ? (
                        <span className="text-xs text-text-muted">
                          captain {item.captainName}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-text">
                      {item.fromCategoryName} → {item.toCategoryName}
                    </p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      Proposed {new Date(item.proposedAt).toLocaleString()}
                    </p>
                    {item.accreditationUnmet.length > 0 ? (
                      <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-amber-800">
                        <ShieldAlert aria-hidden size={12} />
                        Accreditation not yet clean for the incoming athlete
                      </p>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void approve(item)}
                    className="min-h-11 rounded-lg bg-success px-4 text-[13px] font-bold text-white hover:bg-green-700 disabled:cursor-wait disabled:opacity-60"
                  >
                    Approve
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminPortalShell>
  );
}
