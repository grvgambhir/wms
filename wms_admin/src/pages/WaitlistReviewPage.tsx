import { useCallback, useEffect, useState } from "react";
import { Clock, Users } from "lucide-react";

import { AdminPortalShell } from "../components/layout/AdminPortalShell";
import {
  entryLabel,
  explainWaitlistError,
  type WaitlistReviewItem,
} from "../domain/waitlistReview";
import type { WaitlistRepository } from "../repositories/WaitlistRepository";
import { waitlistRepository } from "../repositories/provider";
import { useToast } from "../components/ui/ToastProvider";

function countdown(offerExpiresAt: string | null): string {
  if (!offerExpiresAt) return "";
  const seconds = Math.max(
    0,
    Math.round((Date.parse(offerExpiresAt) - Date.now()) / 1000),
  );
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * REG-09's waitlist queue. `release-offer` and `expire-offer` are correctly staff-only
 * mutations — a participant's browser calling either refuses on purpose — but nothing read
 * `core.waitlist_entry` from the admin side, so there was no screen to call them from. This is
 * that screen: waiting entries first (release moves the front of the line to "offered" and
 * starts its timer), offered entries after (expire returns an unclaimed reservation to the pool).
 */
export function WaitlistReviewPage({
  repository = waitlistRepository,
}: {
  readonly repository?: WaitlistRepository;
} = {}) {
  const [items, setItems] = useState<WaitlistReviewItem[]>([]);
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
      setError(explainWaitlistError(caught));
    } finally {
      setIsLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const act = async (
    item: WaitlistReviewItem,
    run: () => Promise<void>,
    label: string,
  ) => {
    setBusyId(item.id);
    setError(null);
    try {
      await run();
      await reload();
      showToast({
        variant: "success",
        title: label,
        description: `${item.athleteName} · ${entryLabel(item)}`,
      });
    } catch (caught) {
      await reload();
      const message = explainWaitlistError(caught);
      setError(message);
      showToast({
        variant: "error",
        title: `${label} failed`,
        description: message,
      });
    } finally {
      setBusyId(null);
    }
  };

  const waiting = items.filter((item) => item.status === "waiting");
  const offered = items.filter((item) => item.status === "offered");

  return (
    <AdminPortalShell>
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-5 flex items-center gap-2.5">
          <Clock aria-hidden size={22} className="text-primary" />
          <div>
            <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-text">
              Waitlist
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Places freed up go to the front of the line. Releasing reserves
              the place and starts the offer timer; an unclaimed offer must be
              expired to return it to the pool.
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] font-semibold text-text">
            Waiting · {waiting.length}
          </span>
          <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] font-semibold text-text">
            Offer outstanding · {offered.length}
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
            Nobody is waiting.
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
                        {item.athleteName}
                      </span>
                      <span className="text-sm text-text-muted">
                        {entryLabel(item)}
                      </span>
                      {item.position != null ? (
                        <span className="rounded-full bg-primary/[0.12] px-2.5 py-1 text-[11px] font-extrabold text-primary">
                          #{item.position}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-text-muted">
                      {item.status === "waiting"
                        ? `Joined ${item.joinedAt ? new Date(item.joinedAt).toLocaleString() : "—"}`
                        : `Offer expires ${countdown(item.offerExpiresAt)}`}
                    </p>
                  </div>

                  {item.status === "waiting" ? (
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() =>
                        void act(
                          item,
                          () => repository.release(item.id),
                          "Place released",
                        )
                      }
                      className="min-h-11 rounded-lg bg-primary px-4 text-[13px] font-bold text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
                    >
                      Release a place
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() =>
                        void act(
                          item,
                          () => repository.expire(item.id),
                          "Offer expired",
                        )
                      }
                      className="min-h-11 rounded-lg border border-border bg-surface px-4 text-[13px] font-bold text-text hover:bg-surface-muted disabled:cursor-wait disabled:opacity-60"
                    >
                      Expire unclaimed offer
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminPortalShell>
  );
}
