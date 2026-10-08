import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, LockKeyhole, Tag, UserRound } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { newIdempotencyKey } from "../api/idempotencyKey";
import { AdminPortalShell } from "../components/layout/AdminPortalShell";
import {
  actionLabel,
  actionNeedsReason,
  explainRegistrationError,
  formatMoney,
  REFUND_REASONS,
  registrationName,
  statusLabel,
  type RegistrationDetail,
} from "../domain/adminRegistrations";
import type { AdminRegistrationsRepository } from "../repositories/AdminRegistrationsRepository";
import { adminRegistrationsRepository } from "../repositories/provider";
import { StatusBadge } from "./RegistrationsPage";
import { useToast } from "../components/ui/ToastProvider";

export function RegistrationDetailPage({
  repository = adminRegistrationsRepository,
}: {
  readonly repository?: AdminRegistrationsRepository;
} = {}) {
  const { entryId = "" } = useParams();
  const [entry, setEntry] = useState<RegistrationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const { showToast } = useToast();

  const reload = useCallback(async () => {
    if (!entryId) return;
    setIsLoading(true);
    setError(null);
    try {
      setEntry(await repository.get(entryId));
    } catch (caught) {
      setEntry(null);
      setError(explainRegistrationError(caught));
    } finally {
      setIsLoading(false);
    }
  }, [entryId, repository]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const act = async (action: string, reason: string) => {
    if (!entry) return;
    setIsMutating(true);
    setError(null);
    try {
      // This is intentionally created inside the click handler: one key per click, never a
      // key derived from the entry/action pair. The POST response is discarded; reload owns UI truth.
      await repository.transition({
        entryId: entry.id,
        action,
        idempotencyKey: newIdempotencyKey(),
        reason: reason || undefined,
      });
      setPendingAction(null);
      await reload();
      showToast({
        variant: "success",
        title: `${actionLabel(action)} recorded`,
        description: entry ? registrationName(entry) : undefined,
      });
    } catch (caught) {
      // Reload first: it clears the error banner, and the refusal must stay visible.
      await reload();
      const message = explainRegistrationError(caught);
      setError(message);
      showToast({
        variant: "error",
        title: `${actionLabel(action)} failed`,
        description: message,
      });
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <AdminPortalShell>
      <div className="mx-auto max-w-[1200px]">
        <Link
          to="/registrations"
          className="mb-4 inline-flex min-h-9 items-center gap-1.5 text-sm font-bold text-primary hover:underline"
        >
          <ArrowLeft aria-hidden size={16} />
          Back to registrations
        </Link>
        {error && !pendingAction ? (
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
            className="grid min-h-64 place-items-center rounded-xl border border-border bg-surface text-sm text-text-muted shadow-panel"
          >
            Loading registration…
          </div>
        ) : null}
        {!isLoading && !entry ? (
          <div className="grid min-h-40 place-items-center rounded-xl border border-border bg-surface text-sm text-text-muted shadow-panel">
            Registration not found.
          </div>
        ) : null}
        {entry ? (
          <EntryDetail
            entry={entry}
            isMutating={isMutating}
            onAction={setPendingAction}
            repository={repository}
            onReload={reload}
          />
        ) : null}
        {entry && pendingAction ? (
          <ConfirmActionDialog
            key={pendingAction}
            action={pendingAction}
            athlete={registrationName(entry)}
            isMutating={isMutating}
            error={error}
            onCancel={() => {
              setPendingAction(null);
              setError(null);
            }}
            onConfirm={(reason) => void act(pendingAction, reason)}
          />
        ) : null}
      </div>
    </AdminPortalShell>
  );
}

function EntryDetail({
  entry,
  isMutating,
  onAction,
  repository,
  onReload,
}: {
  readonly entry: RegistrationDetail;
  readonly isMutating: boolean;
  readonly onAction: (action: string) => void;
  readonly repository: AdminRegistrationsRepository;
  readonly onReload: () => Promise<void>;
}) {
  return (
    <>
      <div className="mb-5 flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <UserRound aria-hidden size={22} className="text-primary" />
            <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-text">
              {registrationName(entry)}
            </h1>
          </div>
          <p className="mt-1 font-mono text-xs text-text-muted">{entry.id}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value={entry.status} />
          {entry.allowedActions.map((action) => (
            <button
              key={action.action}
              type="button"
              disabled={isMutating}
              onClick={() => onAction(action.action)}
              className={`min-h-11 rounded-lg px-4 text-[13px] font-bold transition disabled:cursor-wait disabled:opacity-60 ${action.action === "reinstate" ? "border border-border bg-surface text-text hover:bg-surface-muted" : "bg-danger text-white hover:bg-red-700"}`}
            >
              {actionLabel(action.action)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Athlete">
          <Definition label="Name" value={registrationName(entry)} />
          <Definition label="Email" value={entry.athlete.email ?? "—"} />
          <Definition
            label="Nationality"
            value={entry.athlete.nationality ?? "—"}
          />
          <Definition label="Date of birth" value={entry.athlete.dateOfBirth} />
        </Section>
        <Section title="Entry">
          <Definition label="Sport" value={entry.sport.name} />
          <Definition label="Product" value={entry.product.name} />
          <Definition label="Grade" value={entry.grade} />
          <Definition
            label="Rule version"
            value={
              entry.ruleVersion.version == null
                ? entry.ruleVersion.id
                : `v${entry.ruleVersion.version} · ${entry.ruleVersion.status ?? "—"}`
            }
          />
          <Definition
            label="Team"
            value={entry.team?.name ?? "Individual entry"}
          />
        </Section>
        <Section title="Category">
          <Definition label="Original" value={entry.category.original ?? "—"} />
          <Definition label="Current" value={entry.category.current ?? "—"} />
          <Definition label="Reason" value={entry.category.reason ?? "—"} />
          <Definition
            label="Derived category"
            value={entry.category.derived.categoryName || "—"}
          />
          {entry.category.auditTrail.length ? (
            <Timeline
              items={entry.category.auditTrail.map((item) => ({
                title: `${item.fromCategory ?? "—"} → ${item.toCategory}`,
                detail: `${item.trigger}${item.reason ? ` · ${item.reason}` : ""}${item.approvedBy ? ` · ${item.approvedBy}` : ""}`,
                at: item.occurredAt,
              }))}
            />
          ) : (
            <Empty text="No category changes recorded." />
          )}
        </Section>
        <Section title="Status">
          <Definition label="Current" value={statusLabel(entry.status)} />
          {entry.statusHistory.length ? (
            <Timeline
              items={entry.statusHistory.map((item) => ({
                title: `${item.fromStatus ? statusLabel(item.fromStatus) : "Created"} → ${statusLabel(item.toStatus)}`,
                detail: `${item.actorName ?? statusLabel(item.actorKind)}${item.reason ? ` · ${item.reason}` : ""}`,
                at: item.occurredAt,
              }))}
            />
          ) : (
            <Empty text="No status history recorded." />
          )}
        </Section>
        <Section title="Money">
          <Money entry={entry} repository={repository} onChanged={onReload} />
        </Section>
        <Section title="Evidence">
          <Evidence entry={entry} />
        </Section>
        <Section title="Team">
          <Definition label="Team" value={entry.team?.name ?? "No team"} />
          <Definition
            label="Roster members"
            value={entry.team ? String(entry.team.memberCount) : "—"}
          />
          <Definition
            label="Roster lock"
            value={
              entry.team?.lockedAt
                ? new Date(entry.team.lockedAt).toLocaleString()
                : "Not locked"
            }
          />
        </Section>
      </div>
    </>
  );
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="rounded-[14px] border border-border bg-surface p-[18px] shadow-panel">
      <h2 className="text-base font-extrabold text-text">{title}</h2>
      <div className="mt-3 space-y-2.5">{children}</div>
    </section>
  );
}

function Definition({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 text-sm">
      <dt className="font-semibold text-text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-text">{value}</dd>
    </div>
  );
}

function Timeline({
  items,
}: {
  readonly items: Array<{ title: string; detail: string; at: string }>;
}) {
  return (
    <ol className="space-y-3 border-l-2 border-primary/20 pl-3.5">
      {items.map((item, index) => (
        <li key={`${item.at}-${index}`}>
          <p className="text-sm font-bold text-text">{item.title}</p>
          <p className="text-xs text-text-muted">{item.detail}</p>
          <time className="text-[11px] text-text-muted">
            {new Date(item.at).toLocaleString()}
          </time>
        </li>
      ))}
    </ol>
  );
}

function Empty({ text }: { readonly text: string }) {
  return <p className="text-sm text-text-muted">{text}</p>;
}

type MoneyDialog =
  | { kind: "promotion"; orderId: string; currency: string | null }
  | {
      kind: "refund-request";
      orderId: string;
      currency: string | null;
      maxMinor: number;
    }
  | {
      kind: "refund-approve";
      refundId: string;
      currency: string;
      amountMinor: number;
      lines: RegistrationDetail["money"]["orders"][number]["lines"];
    }
  | { kind: "refund-reject"; refundId: string };

function Money({
  entry,
  repository,
  onChanged,
}: {
  readonly entry: RegistrationDetail;
  readonly repository: AdminRegistrationsRepository;
  readonly onChanged: () => Promise<void>;
}) {
  const [dialog, setDialog] = useState<MoneyDialog | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const close = () => {
    setDialog(null);
    setError(null);
  };

  const run = async (label: string, action: () => Promise<unknown>) => {
    setIsBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
      close();
      showToast({ variant: "success", title: label });
    } catch (caught) {
      const message = explainRegistrationError(caught);
      setError(message);
      showToast({
        variant: "error",
        title: `${label} failed`,
        description: message,
      });
    } finally {
      setIsBusy(false);
    }
  };

  if (
    !entry.money.orders.length &&
    !entry.money.payments.length &&
    !entry.money.refunds.length
  )
    return <Empty text="No money records for this entry." />;

  const refundableMinor = (
    order: RegistrationDetail["money"]["orders"][number],
  ) =>
    order.lines.reduce(
      (sum, line) => sum + Math.max(0, line.paidMinor - line.refundedMinor),
      0,
    );

  return (
    <div className="space-y-3 text-sm">
      <Definition
        label="Balance"
        value={`${formatMoney(entry.payment.settledMinor, entry.payment.currency)} settled of ${formatMoney(entry.payment.dueMinor, entry.payment.currency)} due`}
      />
      {entry.money.orders.map((order) => (
        <div key={order.id} className="rounded-lg bg-surface-muted px-3 py-2">
          <p>
            <strong>Order {order.id.slice(0, 8)}</strong> ·{" "}
            {statusLabel(order.status)} ·{" "}
            {formatMoney(order.grossMinor, order.currency)} order total
            {order.grossMinor !== entry.payment.dueMinor ? " (all lines)" : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {order.status !== "paid" ? (
              <button
                type="button"
                onClick={() =>
                  setDialog({
                    kind: "promotion",
                    orderId: order.id,
                    currency: order.currency,
                  })
                }
                className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border bg-surface px-3 text-[12px] font-bold text-text hover:bg-background"
              >
                <Tag aria-hidden size={12} />
                Apply promotion
              </button>
            ) : null}
            {order.status === "paid" ? (
              <button
                type="button"
                onClick={() =>
                  void run("Invoice generated", () =>
                    repository.generateInvoice({
                      orderId: order.id,
                      idempotencyKey: newIdempotencyKey(),
                    }),
                  )
                }
                disabled={isBusy}
                className="inline-flex min-h-8 items-center rounded-full border border-border bg-surface px-3 text-[12px] font-bold text-text hover:bg-background disabled:cursor-wait disabled:opacity-60"
              >
                Generate invoice
              </button>
            ) : null}
            {refundableMinor(order) > 0 ? (
              <button
                type="button"
                onClick={() =>
                  setDialog({
                    kind: "refund-request",
                    orderId: order.id,
                    currency: order.currency,
                    maxMinor: refundableMinor(order),
                  })
                }
                className="inline-flex min-h-8 items-center rounded-full border border-border bg-surface px-3 text-[12px] font-bold text-text hover:bg-background"
              >
                Request a refund
              </button>
            ) : null}
          </div>
        </div>
      ))}
      {entry.money.payments.map((payment) => (
        <p key={payment.id} className="rounded-lg bg-success/[0.06] px-3 py-2">
          <strong>Payment {payment.id.slice(0, 8)}</strong> ·{" "}
          {statusLabel(payment.status)} ·{" "}
          {formatMoney(payment.amountMinor, payment.currency)}
        </p>
      ))}
      {entry.money.refunds.map((refund) => {
        const order = entry.money.orders.find(
          (item) => item.id === refund.orderId,
        );
        return (
          <div
            key={refund.id}
            className="rounded-lg bg-warning/[0.08] px-3 py-2"
          >
            <p>
              <strong>Refund {refund.id.slice(0, 8)}</strong> ·{" "}
              {statusLabel(refund.status)} ·{" "}
              {formatMoney(refund.amountMinor, refund.currency)}
            </p>
            {refund.status === "pending" ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setDialog({
                      kind: "refund-approve",
                      refundId: refund.id,
                      currency: refund.currency,
                      amountMinor: refund.amountMinor,
                      lines: order?.lines ?? [],
                    })
                  }
                  className="inline-flex min-h-8 items-center rounded-full bg-success px-3 text-[12px] font-bold text-white hover:bg-green-700"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDialog({ kind: "refund-reject", refundId: refund.id })
                  }
                  className="inline-flex min-h-8 items-center rounded-full bg-danger px-3 text-[12px] font-bold text-white hover:bg-red-700"
                >
                  Reject
                </button>
              </div>
            ) : null}
          </div>
        );
      })}

      {dialog?.kind === "promotion" ? (
        <PromotionDialog
          currency={dialog.currency}
          isBusy={isBusy}
          error={error}
          onCancel={close}
          onApply={(code) =>
            void run("Promotion applied", () =>
              repository.applyPromotion({
                orderId: dialog.orderId,
                code,
                idempotencyKey: newIdempotencyKey(),
              }),
            )
          }
        />
      ) : null}
      {dialog?.kind === "refund-request" ? (
        <RefundRequestDialog
          currency={dialog.currency}
          maxMinor={dialog.maxMinor}
          isBusy={isBusy}
          error={error}
          onCancel={close}
          onRequest={(amountMinor, reasonKey) =>
            void run("Refund requested", () =>
              repository.requestRefund({
                orderId: dialog.orderId,
                amountMinor,
                reasonKey,
                idempotencyKey: newIdempotencyKey(),
              }),
            )
          }
        />
      ) : null}
      {dialog?.kind === "refund-approve" ? (
        <RefundApproveDialog
          currency={dialog.currency}
          amountMinor={dialog.amountMinor}
          lines={dialog.lines}
          isBusy={isBusy}
          error={error}
          onCancel={close}
          onApprove={(allocations) =>
            void run("Refund approved", () =>
              repository.approveRefund({
                refundId: dialog.refundId,
                allocations,
                idempotencyKey: newIdempotencyKey(),
              }),
            )
          }
        />
      ) : null}
      {dialog?.kind === "refund-reject" ? (
        <RefundRejectDialog
          isBusy={isBusy}
          error={error}
          onCancel={close}
          onReject={(reasonKey) =>
            void run("Refund rejected", () =>
              repository.rejectRefund({
                refundId: dialog.refundId,
                reasonKey,
                idempotencyKey: newIdempotencyKey(),
              }),
            )
          }
        />
      ) : null}
    </div>
  );
}

function DialogShell({
  title,
  children,
  onCancel,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-20 grid place-items-center bg-black/40 p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-panel"
      >
        <h2 className="text-lg font-extrabold text-text">{title}</h2>
        {children}
        <button type="button" onClick={onCancel} className="sr-only">
          Cancel
        </button>
      </div>
    </div>
  );
}

function DialogError({ error }: { readonly error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-3 text-sm text-danger">
      {error}
    </p>
  );
}

function DialogActions({
  isBusy,
  onCancel,
  confirmLabel,
  busyLabel,
  disabled,
}: {
  readonly isBusy: boolean;
  readonly onCancel: () => void;
  readonly confirmLabel: string;
  readonly busyLabel: string;
  readonly disabled: boolean;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={isBusy}
        className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-text hover:bg-surface-muted disabled:opacity-60"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={disabled}
        className="min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-white hover:bg-primary-dark disabled:cursor-wait disabled:opacity-60"
      >
        {isBusy ? busyLabel : confirmLabel}
      </button>
    </div>
  );
}

function PromotionDialog({
  currency,
  isBusy,
  error,
  onCancel,
  onApply,
}: {
  readonly currency: string | null;
  readonly isBusy: boolean;
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onApply: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  return (
    <DialogShell title="Apply a promotion code" onCancel={onCancel}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (code.trim()) onApply(code.trim());
        }}
      >
        <p className="mt-2 text-sm text-text-muted">
          The discount is split across the order's tax rates and shown on the
          order total{currency ? ` in ${currency}` : ""}.
        </p>
        <label className="mt-4 block text-sm font-medium text-text">
          Promotion code
          <input
            className="mt-1 h-11 w-full rounded-lg border border-border px-3 uppercase"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoFocus
            required
          />
        </label>
        <DialogError error={error} />
        <DialogActions
          isBusy={isBusy}
          onCancel={onCancel}
          confirmLabel="Apply"
          busyLabel="Applying…"
          disabled={isBusy || !code.trim()}
        />
      </form>
    </DialogShell>
  );
}

function RefundRequestDialog({
  currency,
  maxMinor,
  isBusy,
  error,
  onCancel,
  onRequest,
}: {
  readonly currency: string | null;
  readonly maxMinor: number;
  readonly isBusy: boolean;
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onRequest: (amountMinor: number, reasonKey: string) => void;
}) {
  const [amount, setAmount] = useState((maxMinor / 100).toFixed(2));
  const [reasonKey, setReasonKey] = useState<string>(REFUND_REASONS[0].key);
  const amountMinor = Math.round(Number(amount) * 100);
  const valid =
    Number.isFinite(amountMinor) && amountMinor > 0 && amountMinor <= maxMinor;
  return (
    <DialogShell title="Request a refund" onCancel={onCancel}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) onRequest(amountMinor, reasonKey);
        }}
      >
        <p className="mt-2 text-sm text-text-muted">
          Up to {formatMoney(maxMinor, currency)} is available to refund on this
          order. A different person has to approve it before anything moves.
        </p>
        <label className="mt-4 block text-sm font-medium text-text">
          Amount ({currency ?? "EUR"})
          <input
            type="number"
            step="0.01"
            min="0.01"
            max={(maxMinor / 100).toFixed(2)}
            className="mt-1 h-11 w-full rounded-lg border border-border px-3"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            autoFocus
            required
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-text">
          Reason
          <select
            className="mt-1 h-11 w-full rounded-lg border border-border bg-surface px-2 text-sm font-semibold text-text"
            value={reasonKey}
            onChange={(event) => setReasonKey(event.target.value)}
          >
            {REFUND_REASONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <DialogError error={error} />
        <DialogActions
          isBusy={isBusy}
          onCancel={onCancel}
          confirmLabel="Request refund"
          busyLabel="Requesting…"
          disabled={isBusy || !valid}
        />
      </form>
    </DialogShell>
  );
}

function RefundApproveDialog({
  currency,
  amountMinor,
  lines,
  isBusy,
  error,
  onCancel,
  onApprove,
}: {
  readonly currency: string;
  readonly amountMinor: number;
  readonly lines: RegistrationDetail["money"]["orders"][number]["lines"];
  readonly isBusy: boolean;
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onApprove: (
    allocations: Array<{ orderLineId: string; amountMinor: number }>,
  ) => void;
}) {
  const refundable = lines.map((line) =>
    Math.max(0, line.paidMinor - line.refundedMinor),
  );
  const totalRefundable = refundable.reduce((sum, value) => sum + value, 0);
  const defaults = lines.map((_, index) =>
    totalRefundable > 0
      ? Math.round((amountMinor * (refundable[index] ?? 0)) / totalRefundable)
      : 0,
  );
  // Largest-remainder makes the defaults sum exactly to amountMinor rather than drifting a cent short.
  const drift = amountMinor - defaults.reduce((sum, value) => sum + value, 0);
  if (defaults.length > 0) defaults[0] = (defaults[0] ?? 0) + drift;

  const [amounts, setAmounts] = useState<string[]>(
    defaults.map((value) => (value / 100).toFixed(2)),
  );
  const allocatedMinor = amounts.reduce(
    (sum, value) => sum + Math.round(Number(value || "0") * 100),
    0,
  );
  const balanced = allocatedMinor === amountMinor;

  return (
    <DialogShell title="Approve refund" onCancel={onCancel}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!balanced) return;
          onApprove(
            lines.map((line, index) => ({
              orderLineId: line.id,
              amountMinor: Math.round(Number(amounts[index] || "0") * 100),
            })),
          );
        }}
      >
        <p className="mt-2 text-sm text-text-muted">
          Split {formatMoney(amountMinor, currency)} across the order's lines.
          The total must match exactly.
        </p>
        <div className="mt-3 space-y-2">
          {lines.map((line, index) => (
            <label
              key={line.id}
              className="block text-sm font-medium text-text"
            >
              {line.description}{" "}
              <span className="font-normal text-text-muted">
                (paid {formatMoney(line.paidMinor, currency)})
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                className="mt-1 h-11 w-full rounded-lg border border-border px-3"
                value={amounts[index] ?? "0.00"}
                onChange={(event) =>
                  setAmounts((current) =>
                    current.map((value, i) =>
                      i === index ? event.target.value : value,
                    ),
                  )
                }
              />
            </label>
          ))}
        </div>
        <p
          className={`mt-2 text-sm font-semibold ${balanced ? "text-success" : "text-danger"}`}
        >
          Allocated {formatMoney(allocatedMinor, currency)} of{" "}
          {formatMoney(amountMinor, currency)}
        </p>
        <DialogError error={error} />
        <DialogActions
          isBusy={isBusy}
          onCancel={onCancel}
          confirmLabel="Approve refund"
          busyLabel="Approving…"
          disabled={isBusy || !balanced || lines.length === 0}
        />
      </form>
    </DialogShell>
  );
}

function RefundRejectDialog({
  isBusy,
  error,
  onCancel,
  onReject,
}: {
  readonly isBusy: boolean;
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onReject: (reasonKey: string) => void;
}) {
  const [reasonKey, setReasonKey] = useState<string>(REFUND_REASONS[0].key);
  return (
    <DialogShell title="Reject refund" onCancel={onCancel}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onReject(reasonKey);
        }}
      >
        <p className="mt-2 text-sm text-text-muted">
          Needs a different person from whoever requested it — the same rule as
          approval.
        </p>
        <label className="mt-4 block text-sm font-medium text-text">
          Reason
          <select
            className="mt-1 h-11 w-full rounded-lg border border-border bg-surface px-2 text-sm font-semibold text-text"
            value={reasonKey}
            onChange={(event) => setReasonKey(event.target.value)}
          >
            {REFUND_REASONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <DialogError error={error} />
        <DialogActions
          isBusy={isBusy}
          onCancel={onCancel}
          confirmLabel="Reject refund"
          busyLabel="Rejecting…"
          disabled={isBusy}
        />
      </form>
    </DialogShell>
  );
}

function Evidence({ entry }: { readonly entry: RegistrationDetail }) {
  return (
    <>
      <div className="flex items-start gap-2 rounded-lg bg-surface-muted p-3 text-xs text-text-muted">
        <LockKeyhole aria-hidden size={15} className="mt-0.5 shrink-0" />
        Restricted evidence held for this athlete at this event:{" "}
        {entry.evidence.restrictedCount} item
        {entry.evidence.restrictedCount === 1 ? "" : "s"} ·{" "}
        {entry.evidence.restrictedStatus}. The count is per athlete, not per
        entry. No restricted document, classification, or reviewer metadata is
        available here.
      </div>
      {entry.evidence.ordinary.length ? (
        <ul className="space-y-2">
          {entry.evidence.ordinary.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-border px-3 py-2 text-sm"
            >
              <strong>{item.kind}</strong> · {item.status} · scan{" "}
              {item.scanStatus}
            </li>
          ))}
        </ul>
      ) : (
        <Empty text="No ordinary evidence items." />
      )}
    </>
  );
}

const ACTION_CONSEQUENCE: Record<string, string> = {
  cancel:
    "The entry is cancelled and its place is released. Refunds are handled in Finance.",
  disqualify:
    "The athlete is disqualified from this entry. Only an OC administrator can reinstate it.",
  substitute: "The entry is marked as replaced by a substitute.",
  reinstate:
    "The entry is restored. A cancelled entry returns to draft and must be completed again.",
};

function ConfirmActionDialog({
  action,
  athlete,
  isMutating,
  error,
  onCancel,
  onConfirm,
}: {
  readonly action: string;
  readonly athlete: string;
  readonly isMutating: boolean;
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const needsReason = actionNeedsReason(action);
  const trimmed = reason.trim();
  const blocked = isMutating || (needsReason && trimmed.length < 3);
  return (
    <div
      className="fixed inset-0 z-20 grid place-items-center bg-black/40 p-4"
      role="presentation"
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="registration-action-title"
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-panel"
        onSubmit={(event) => {
          event.preventDefault();
          if (!blocked) onConfirm(trimmed);
        }}
      >
        <h2
          id="registration-action-title"
          className="text-lg font-extrabold text-text"
        >
          {actionLabel(action)} · {athlete}
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          {ACTION_CONSEQUENCE[action] ?? "This changes the entry status."}
        </p>
        <label className="mt-4 block text-sm font-medium text-text">
          Reason{needsReason ? "" : " (optional)"}
          <textarea
            className="mt-1 min-h-20 w-full rounded-lg border border-border px-3 py-2"
            value={reason}
            maxLength={500}
            required={needsReason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <p className="mt-1 text-xs text-text-muted">
          Recorded in the status history with your name.
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isMutating}
            className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-text hover:bg-surface-muted disabled:opacity-60"
          >
            Keep entry as is
          </button>
          <button
            type="submit"
            disabled={blocked}
            className="min-h-11 rounded-lg bg-danger px-4 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {isMutating
              ? "Saving…"
              : `Confirm ${actionLabel(action).toLowerCase()}`}
          </button>
        </div>
      </form>
    </div>
  );
}
