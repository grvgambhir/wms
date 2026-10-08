import {
  AlertTriangle,
  CheckCircle2,
  RefreshCcw,
  Wallet,
  Zap,
} from 'lucide-react';

import { AdminPortalShell } from '../components/layout/AdminPortalShell';
import { KpiCard } from '../components/operations/KpiCard';
import { Panel } from '../components/operations/Panel';
import type { Settlement, SettlementPaymentStatus } from '../domain/finance';
import { newIdempotencyKey } from '../api/idempotencyKey';
import { useFinance } from '../hooks/useFinance';

const euroFormat = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });

const statusMeta: Record<SettlementPaymentStatus, { readonly label: string; readonly className: string }> = {
  captured: { label: 'Captured', className: 'bg-success/10 text-success' },
  pending: { label: 'Pending', className: 'bg-warning/10 text-amber-700' },
  refunded: { label: 'Refunded', className: 'bg-surface-muted text-text-muted' },
  failed: { label: 'Failed', className: 'bg-danger/10 text-danger' },
};

function money(amountMinor: number): string {
  return euroFormat.format(amountMinor / 100);
}

export function FinancePage() {
  const finance = useFinance();

  return (
    <AdminPortalShell>
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-2">
          <div className="flex items-center gap-2.5">
            <Wallet aria-hidden size={22} className="text-primary" />
            <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-text">
              Finance Settlement &amp; Reconciliation
            </h1>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            Gateway callbacks reconciled against the registration ledger.
          </p>
        </div>

        <div className="mb-[18px] flex items-center gap-2 rounded-[10px] border border-primary/35 bg-primary/[0.06] px-3 py-2.5 text-[13px] text-primary-dark">
          <Zap aria-hidden size={16} className="shrink-0 text-primary" />
          <p>Live participant payments appear here against the same governed order — one ledger, both portals.</p>
        </div>

        {finance.isLoading ? (
          <LoadingState />
        ) : !finance.overview ? (
          <ErrorState message={finance.error} onRetry={() => void finance.reload()} />
        ) : (
          <FinanceContent
            overview={finance.overview}
            error={finance.error}
            refundingSettlementId={finance.refundingSettlementId}
            onRefund={(settlement) =>
              void finance.refundSettlement({
                settlementId: settlement.id,
                idempotencyKey: newIdempotencyKey(),
              })
            }
          />
        )}
      </div>
    </AdminPortalShell>
  );
}

interface FinanceContentProps {
  readonly overview: NonNullable<ReturnType<typeof useFinance>['overview']>;
  readonly error: string | null;
  readonly refundingSettlementId: string | null;
  readonly onRefund: (settlement: Settlement) => void;
}

function FinanceContent({
  overview,
  error,
  refundingSettlementId,
  onRefund,
}: FinanceContentProps) {
  const { summary } = overview;
  const reconciled = summary.varianceMinor === 0;

  return (
    <>
      {error ? (
        <div role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger/[0.06] px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-4 gap-3.5">
        <KpiCard
          accent="#16A34A"
          label="SETTLED (CAPTURED)"
          value={money(summary.settledAmountMinor)}
          detail={`${summary.settledCount} payments reconciled`}
        />
        <KpiCard
          accent="#F59E0B"
          label="PENDING CAPTURE"
          value={money(summary.pendingAmountMinor)}
          detail={`${summary.pendingCount} awaiting gateway callback`}
        />
        <KpiCard
          accent="#666666"
          label="REFUNDED"
          value={money(summary.refundedAmountMinor)}
          detail={`${summary.refundedCount} refunds processed`}
        />
        <KpiCard
          accent={reconciled ? '#16A34A' : '#DC2626'}
          label="RECONCILIATION VARIANCE"
          value={money(summary.varianceMinor)}
          detail={
            <span className={`font-semibold ${reconciled ? 'text-success' : 'text-danger'}`}>
              {reconciled ? '✓ Books balance · every callback matched' : 'Variance detected — investigate'}
            </span>
          }
          alert={!reconciled}
        />
      </div>

      <Panel className="mt-[18px]">
        <h2 className="mb-3 text-base font-extrabold text-text">Settlements</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-left">
            <thead>
              <tr className="text-[11px] font-bold uppercase tracking-[0.04em] text-text-muted">
                <th scope="col" className="w-[34%] px-1 pb-2 font-bold">Participant</th>
                <th scope="col" className="w-[22%] px-1 pb-2 font-bold">Gateway</th>
                <th scope="col" className="w-[14%] px-1 pb-2 text-right font-bold">Amount</th>
                <th scope="col" className="w-[30%] px-1 pb-2 font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {overview.settlements.items.map((settlement) => (
                <SettlementRow
                  key={settlement.id}
                  settlement={settlement}
                  refunding={refundingSettlementId === settlement.id}
                  mutationInProgress={refundingSettlementId != null}
                  onRefund={onRefund}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <p className="mt-5 text-[11px] text-text-muted">
        Illustrative settlements. Live participant payments reconcile against the same order record; final figures follow the WMS/OC-approved fee register.
      </p>
    </>
  );
}

interface SettlementRowProps {
  readonly settlement: Settlement;
  readonly refunding: boolean;
  readonly mutationInProgress: boolean;
  readonly onRefund: (settlement: Settlement) => void;
}

function SettlementRow({
  settlement,
  refunding,
  mutationInProgress,
  onRefund,
}: SettlementRowProps) {
  const meta = statusMeta[settlement.paymentStatus];
  const canRefund = settlement.paymentStatus === 'captured';

  return (
    <tr>
      <td className="px-1 py-3">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-text">
          {settlement.participantName}
          {settlement.source === 'live' ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/[0.12] px-1.5 py-px text-[10px] font-extrabold text-primary-dark">
              <Zap aria-hidden size={10} className="text-primary" />
              Live
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-xs text-text-muted">
          {settlement.sportName} · {settlement.entryName}
          {settlement.categoryName ? ` · ${settlement.categoryName}` : ''}
        </p>
      </td>
      <td className="px-1 py-3">
        <p className="max-w-[220px] truncate text-xs text-text">{settlement.gatewayReference ?? '—'}</p>
        <p className="mt-0.5 text-[11px] text-text-muted">
          {settlement.attemptCount} attempt{settlement.attemptCount === 1 ? '' : 's'} · {settlement.chargeCount} charge{settlement.chargeCount === 1 ? '' : 's'}
        </p>
      </td>
      <td className="px-1 py-3 text-right text-sm font-extrabold text-text">
        {money(settlement.amountMinor)}
      </td>
      <td className="px-1 py-3">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${meta.className}`}>
            {meta.label}
          </span>
          {settlement.reconciled ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
              <CheckCircle2 aria-hidden size={13} />
              Reconciled
            </span>
          ) : null}
          <span className="flex-1" />
          {canRefund ? (
            <button
              type="button"
              onClick={() => onRefund(settlement)}
              disabled={mutationInProgress}
              aria-label={`Refund ${settlement.participantName} settlement`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-text shadow-sm transition hover:bg-surface-muted disabled:cursor-wait disabled:opacity-55"
            >
              <RefreshCcw aria-hidden size={13} className={refunding ? 'animate-spin' : ''} />
              {refunding ? 'Refunding…' : 'Refund'}
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function LoadingState() {
  return (
    <div role="status" className="grid min-h-64 place-items-center rounded-xl border border-border bg-surface shadow-panel">
      <div className="text-center">
        <span aria-hidden className="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
        <p className="mt-3 text-sm text-text-muted">Loading settlements…</p>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { readonly message: string | null; readonly onRetry: () => void }) {
  return (
    <div role="alert" className="grid min-h-64 place-items-center rounded-xl border border-danger/30 bg-surface p-8 text-center shadow-panel">
      <div>
        <AlertTriangle aria-hidden size={24} className="mx-auto text-danger" />
        <p className="mt-3 font-bold text-text">Could not load settlements.</p>
        {message ? <p className="mt-1 text-sm text-text-muted">{message}</p> : null}
        <button type="button" onClick={onRetry} className="mt-4 min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-white hover:bg-primary-dark">
          Try again
        </button>
      </div>
    </div>
  );
}
