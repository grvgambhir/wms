import { useCallback, useEffect, useMemo, useState } from "react";
import { FileCheck2, LockKeyhole, ShieldAlert } from "lucide-react";

import { newIdempotencyKey } from "../api/idempotencyKey";
import { AdminPortalShell } from "../components/layout/AdminPortalShell";
import {
  REJECTION_REASONS,
  athleteLabel,
  entryLabel,
  evidenceStatusLabel,
  explainEvidenceError,
  type EvidenceReviewItem,
} from "../domain/evidenceReview";
import type { EvidenceReviewRepository } from "../repositories/EvidenceReviewRepository";
import { evidenceReviewRepository } from "../repositories/provider";
import { useToast } from "../components/ui/ToastProvider";

/**
 * EVD-02 / REG-10: the OC's evidence work queue.
 *
 * Before this screen existed, an uploaded medical certificate could only be approved by calling the
 * API by hand — and the reviewer buttons were rendered on the athlete's own screen, where the
 * backend correctly refuses them. Reviewing is OC work, so it lives here.
 *
 * Restricted items (medical, para classification) are marked, and every read of them is
 * access-logged by the backend; the screen says so rather than letting a reviewer assume otherwise.
 */
export function EvidenceReviewPage({
  repository = evidenceReviewRepository,
}: {
  readonly repository?: EvidenceReviewRepository;
} = {}) {
  const [items, setItems] = useState<EvidenceReviewItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<EvidenceReviewItem | null>(null);
  const { showToast } = useToast();

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      setItems(await repository.queue());
      setError(null);
    } catch (caught) {
      setError(explainEvidenceError(caught));
    } finally {
      setIsLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // One key per click, never derived from the document id: a second click must be a second action,
  // not a replay of the first response.
  const act = async (
    item: EvidenceReviewItem,
    run: (key: string) => Promise<void>,
    label: string,
  ) => {
    setBusyId(item.id);
    setError(null);
    try {
      await run(newIdempotencyKey());
      setRejecting(null);
      await reload();
      showToast({
        variant: "success",
        title: label,
        description: `${athleteLabel(item)} · ${item.label}`,
      });
    } catch (caught) {
      await reload();
      const message = explainEvidenceError(caught);
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

  const counts = useMemo(
    () => ({
      waiting: items.filter((item) => item.status === "uploaded").length,
      inReview: items.filter((item) => item.status === "under_review").length,
      restricted: items.filter((item) => item.classification === "restricted")
        .length,
    }),
    [items],
  );

  return (
    <AdminPortalShell>
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-5 flex items-center gap-2.5">
          <FileCheck2 aria-hidden size={22} className="text-primary" />
          <div>
            <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-text">
              Evidence review
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Documents waiting for a decision. Approving the last required item
              unlocks that athlete's checkout.
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <Chip label="Awaiting review" value={counts.waiting} />
          <Chip label="In review" value={counts.inReview} />
          <Chip label="Restricted" value={counts.restricted} />
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
            Nothing is waiting for review.
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
                      <span className="font-bold text-text">
                        {athleteLabel(item)}
                      </span>
                      <span className="text-sm text-text-muted">
                        {entryLabel(item)}
                      </span>
                      {item.classification === "restricted" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning/[0.14] px-2.5 py-1 text-[11px] font-extrabold text-amber-800">
                          <LockKeyhole aria-hidden size={12} />
                          RESTRICTED
                        </span>
                      ) : null}
                      <span className="rounded-full bg-primary/[0.12] px-2.5 py-1 text-[11px] font-extrabold text-primary">
                        {evidenceStatusLabel(item.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-text">
                      {item.label}
                      {item.fileName ? ` · ${item.fileName}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {item.uploadedAt
                        ? `Uploaded ${new Date(item.uploadedAt).toLocaleString()}`
                        : "Not uploaded yet"}
                      {item.reviewerDisplayName
                        ? ` · with ${item.reviewerDisplayName}`
                        : ""}
                      {item.classification === "restricted"
                        ? " · opening this record is access-logged"
                        : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {item.status === "uploaded" ? (
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() =>
                          void act(
                            item,
                            (key) =>
                              repository.startReview({
                                item,
                                idempotencyKey: key,
                              }),
                            "Review started",
                          )
                        }
                        className="min-h-11 rounded-lg border border-border bg-surface px-4 text-[13px] font-bold text-text hover:bg-surface-muted disabled:cursor-wait disabled:opacity-60"
                      >
                        Start review
                      </button>
                    ) : null}
                    {item.status === "under_review" ? (
                      <>
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() =>
                            void act(
                              item,
                              (key) =>
                                repository.approve({
                                  item,
                                  idempotencyKey: key,
                                }),
                              "Evidence approved",
                            )
                          }
                          className="min-h-11 rounded-lg bg-success px-4 text-[13px] font-bold text-white hover:bg-green-700 disabled:cursor-wait disabled:opacity-60"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => setRejecting(item)}
                          className="min-h-11 rounded-lg bg-danger px-4 text-[13px] font-bold text-white hover:bg-red-700 disabled:cursor-wait disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {rejecting ? (
          <RejectDialog
            item={rejecting}
            busy={busyId === rejecting.id}
            onCancel={() => setRejecting(null)}
            onConfirm={(reason) =>
              void act(
                rejecting,
                (key) =>
                  repository.reject({
                    item: rejecting,
                    idempotencyKey: key,
                    reason,
                  }),
                "Evidence rejected",
              )
            }
          />
        ) : null}
      </div>
    </AdminPortalShell>
  );
}

function Chip({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}) {
  return (
    <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] font-semibold text-text">
      {label} · {value}
    </span>
  );
}

/**
 * A refusal the athlete has to act on needs a reason they can be shown in their own language, so
 * the reason is a coded key, not free text — the backend refuses a rejection without one.
 */
function RejectDialog({
  item,
  busy,
  onCancel,
  onConfirm,
}: {
  readonly item: EvidenceReviewItem;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState<string>(REJECTION_REASONS[0].key);
  return (
    <div
      className="fixed inset-0 z-20 grid place-items-center bg-black/40 p-4"
      role="presentation"
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="evidence-reject-title"
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-panel"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) onConfirm(reason);
        }}
      >
        <div className="flex items-center gap-2">
          <ShieldAlert aria-hidden size={18} className="text-danger" />
          <h2
            id="evidence-reject-title"
            className="text-lg font-extrabold text-text"
          >
            Reject {item.label}
          </h2>
        </div>
        <p className="mt-2 text-sm text-text-muted">
          {athleteLabel(item)} will be asked to upload it again, and their
          checkout stays locked until a required document is approved.
        </p>
        <label className="mt-4 block text-sm font-medium text-text">
          Reason
          <select
            className="mt-1 h-11 w-full rounded-lg border border-border px-3"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          >
            {REJECTION_REASONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-text hover:bg-surface-muted disabled:opacity-60"
          >
            Keep it pending
          </button>
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 rounded-lg bg-danger px-4 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Confirm rejection"}
          </button>
        </div>
      </form>
    </div>
  );
}
