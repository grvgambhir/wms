import { useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Power,
  ShieldCheck,
  TrendingUp,
  WifiOff,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { AdminPortalShell } from "../components/layout/AdminPortalShell";
import { KpiCard } from "../components/operations/KpiCard";
import { Panel } from "../components/operations/Panel";
import type {
  FunnelStage,
  OperationsSnapshot,
  ServiceLevelMetric,
} from "../domain/operations";
import { useOperations } from "../hooks/useOperations";

const numberFormat = new Intl.NumberFormat("en-GB");
const euroFormat = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

const funnelColors: Record<FunnelStage["id"], string> = {
  started: "#C7D5E3",
  submitted: "#8FBBE6",
  paid: "#4887CA",
};

const slaIcons: Record<ServiceLevelMetric["id"], LucideIcon> = {
  "evidence-backlog": Clock,
  waitlist: Activity,
  unpaid: ShieldCheck,
  incidents: AlertTriangle,
};

export function OperationsPage() {
  const operations = useOperations();
  const { snapshot } = operations;

  const exportedLog = useMemo(() => {
    if (!snapshot) return "";
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        generatedAt: snapshot.generatedAt,
        incident: snapshot.integration.incident ?? null,
        activityLog: snapshot.activityLog,
      },
      null,
      2,
    );
  }, [snapshot]);

  const downloadLog = () => {
    if (!snapshot) return;
    const url = URL.createObjectURL(
      new Blob([exportedLog], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "como-2027-operations-log.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminPortalShell
      onResetDemo={() => void operations.resetDemo()}
      resetDisabled={operations.isLoading || operations.isMutating}
    >
      {operations.isLoading ? (
        <LoadingState />
      ) : !snapshot ? (
        <ErrorState
          message={operations.error}
          onRetry={() => void operations.reload()}
        />
      ) : (
        <OperationsContent
          snapshot={snapshot}
          isMutating={operations.isMutating}
          error={operations.error}
          onDownloadLog={downloadLog}
          onToggleFreeze={() =>
            void operations.setChangeFreeze(!snapshot.changeFreezeActive)
          }
          onSimulateFailure={() => void operations.simulateFailure()}
          onOpenIncident={() => void operations.openIncident()}
          onApplyWorkaround={() => void operations.applyWorkaround()}
          onResolveIncident={() => void operations.resolveIncident()}
          onReset={() => void operations.resetDemo()}
        />
      )}
    </AdminPortalShell>
  );
}

interface OperationsContentProps {
  readonly snapshot: OperationsSnapshot;
  readonly isMutating: boolean;
  readonly error: string | null;
  readonly onDownloadLog: () => void;
  readonly onToggleFreeze: () => void;
  readonly onSimulateFailure: () => void;
  readonly onOpenIncident: () => void;
  readonly onApplyWorkaround: () => void;
  readonly onResolveIncident: () => void;
  readonly onReset: () => void;
}

function OperationsContent({
  snapshot,
  isMutating,
  error,
  onDownloadLog,
  onToggleFreeze,
  onSimulateFailure,
  onOpenIncident,
  onApplyWorkaround,
  onResolveIncident,
  onReset,
}: OperationsContentProps) {
  const { capacity, integration } = snapshot;
  const incident = integration.incident;

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-[18px] flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <Activity aria-hidden size={22} className="text-primary" />
            <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-text">
              Operations &amp; Load Control
            </h1>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            {snapshot.live
              ? "Counts read from the registration database. Live sessions and uptime are not measured yet; the incident rehearsal below is a demo."
              : "Counts unavailable — the backend could not be reached. The figures below are placeholders, not measurements."}
          </p>
        </div>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onDownloadLog}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-[13px] font-semibold text-text shadow-sm transition hover:bg-surface-muted"
          >
            <Download aria-hidden size={16} className="text-text-muted" />
            Export Log
          </button>
          <button
            type="button"
            onClick={onToggleFreeze}
            disabled={isMutating}
            className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3.5 text-[13px] font-bold text-white shadow-sm transition disabled:cursor-wait disabled:opacity-60 ${snapshot.changeFreezeActive ? "bg-warning hover:bg-amber-600" : "bg-danger hover:bg-red-700"}`}
          >
            <Power aria-hidden size={16} />
            {snapshot.changeFreezeActive
              ? "Change Freeze Active"
              : "Trigger Change Freeze"}
          </button>
        </div>
      </div>

      {snapshot.changeFreezeActive ? (
        <div
          role="status"
          className="mb-4 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/[0.08] px-4 py-3 text-sm font-semibold text-amber-900"
        >
          <ShieldCheck aria-hidden size={17} className="text-warning" />
          Protected change freeze is active. Click the control again to lift it.
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-danger/30 bg-danger/[0.06] px-4 py-3 text-sm text-red-900"
        >
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-4 gap-3.5">
        <KpiCard
          accent="#4887CA"
          label="PAID ENTRIES"
          value={
            capacity.quotaCapacity == null
              ? numberFormat.format(capacity.paidEntries)
              : `${numberFormat.format(capacity.paidEntries)} / ${numberFormat.format(capacity.quotaCapacity)}`
          }
          progress={
            capacity.quotaCapacity
              ? capacity.paidEntries / capacity.quotaCapacity
              : undefined
          }
          detail={
            capacity.quotaCapacity == null
              ? "No quota pool configured for this event"
              : `${numberFormat.format(capacity.quotaConfirmed)} places confirmed · ${numberFormat.format(capacity.quotaReserved)} held`
          }
        />
        <KpiCard
          accent="#16A34A"
          label="LIVE ENTRIES"
          value={numberFormat.format(capacity.liveEntries)}
          detail={
            <span className="inline-flex items-center gap-1 font-semibold text-text-muted">
              <TrendingUp aria-hidden size={13} />
              {numberFormat.format(capacity.registeredPeople)} athletes
              registered
            </span>
          }
        />
        <KpiCard
          accent="#8B5CF6"
          label="OUTSTANDING BALANCE"
          value={euroFormat.format(capacity.unpaidMinor / 100)}
          detail={`${euroFormat.format(capacity.settledMinor / 100)} settled of ${euroFormat.format(capacity.chargedMinor / 100)} charged`}
        />
        <KpiCard
          accent={
            capacity.reconciliationVarianceMinor === 0 ? "#16A34A" : "#F59E0B"
          }
          label="PAYMENT RECONCILIATION"
          value={euroFormat.format(capacity.reconciliationVarianceMinor / 100)}
          detail={
            capacity.reconciliationVarianceMinor === 0 ? (
              <span className="font-semibold text-success">
                ✓ Payments and order lines agree
              </span>
            ) : (
              <span className="font-semibold text-danger">
                Settled payments and order lines disagree — investigate
              </span>
            )
          }
        />
      </div>

      <div className="mt-4 grid grid-cols-[minmax(420px,1.25fr)_minmax(320px,0.75fr)] gap-4">
        <Panel>
          <div className="mb-3.5 flex items-center">
            <h2 className="flex-1 text-base font-extrabold text-text">
              Live Registration Funnel
            </h2>
            <span className="text-xs text-text-muted">
              {snapshot.funnelWindow}
            </span>
          </div>
          <div className="space-y-3.5">
            {snapshot.funnel.map((stage) => (
              <FunnelRow
                key={stage.id}
                stage={stage}
                max={snapshot.funnel[0]?.value ?? 1}
              />
            ))}
          </div>
        </Panel>

        <Panel>
          <h2 className="mb-2 text-base font-extrabold text-text">
            Work queues
          </h2>
          <div className="divide-y divide-border">
            {snapshot.serviceLevels.map((metric) => (
              <SlaRow key={metric.id} metric={metric} />
            ))}
          </div>
        </Panel>
      </div>

      <Panel className="mt-4">
        <div className="mb-3 flex items-center gap-2.5">
          <h2 className="flex-1 text-base font-extrabold text-text">
            Integration Health
          </h2>
          {incident?.status === "resolved" ||
          (integration.status === "healthy" && !incident) ? (
            <button
              type="button"
              onClick={onReset}
              disabled={isMutating}
              className="min-h-11 px-2.5 text-xs text-text-muted hover:text-text disabled:cursor-wait disabled:opacity-60"
            >
              Reset demo
            </button>
          ) : null}
        </div>

        <div
          role={integration.status === "stale" ? "alert" : undefined}
          className={`flex items-center gap-3 rounded-[10px] border p-3.5 ${integration.status === "healthy" ? "border-border bg-surface" : "border-danger/35 bg-danger/[0.06]"}`}
        >
          {integration.status === "healthy" ? (
            <CheckCircle2
              aria-hidden
              size={20}
              className="shrink-0 text-success"
            />
          ) : (
            <WifiOff aria-hidden size={20} className="shrink-0 text-danger" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-bold text-text">{integration.name}</p>
            <p className="mt-0.5 text-xs text-text-muted">
              {integration.detail}
            </p>
          </div>
          {integration.status === "healthy" && !incident ? (
            <button
              type="button"
              onClick={onSimulateFailure}
              disabled={isMutating}
              className="min-h-11 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-text transition hover:bg-surface-muted disabled:cursor-wait disabled:opacity-60"
            >
              Simulate feed failure
            </button>
          ) : null}
        </div>

        {integration.status === "stale" && !incident ? (
          <div
            role="alert"
            className="mt-3 flex items-center gap-3 rounded-[10px] border border-danger/35 bg-danger/[0.06] p-3.5"
          >
            <AlertTriangle
              aria-hidden
              size={18}
              className="shrink-0 text-danger"
            />
            <p className="flex-1 text-[13px] text-red-900">
              Monitoring detected a failed results interface. Open an incident
              to start the SLA clock.
            </p>
            <button
              type="button"
              onClick={onOpenIncident}
              disabled={isMutating}
              className="min-h-11 rounded-lg bg-danger px-3.5 text-[13px] font-bold text-white transition hover:bg-red-700 disabled:cursor-wait disabled:opacity-60"
            >
              Open S1 Incident
            </button>
          </div>
        ) : null}

        {incident?.status === "open" ? (
          <div
            role="alert"
            className="mt-3 rounded-[10px] border border-warning/40 bg-warning/[0.07] p-3.5"
          >
            <p className="font-extrabold text-text">
              {incident.id} · {incident.severity} · Open
            </p>
            <p className="mt-0.5 text-[13px] text-text-muted">
              Acknowledged in {incident.acknowledgementMinutes} min (target ≤ 5
              min ✓). Switch to the documented workaround to restore the
              business outcome.
            </p>
            <button
              type="button"
              onClick={onApplyWorkaround}
              disabled={isMutating}
              className="mt-2.5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-3.5 text-[13px] font-bold text-white transition hover:bg-primary-dark disabled:cursor-wait disabled:opacity-60"
            >
              <Wrench aria-hidden size={15} />
              Apply documented workaround
            </button>
          </div>
        ) : null}

        {incident?.status === "workaround" ? (
          <div
            role="alert"
            className="mt-3 rounded-[10px] border border-success/40 bg-success/[0.06] p-3.5"
          >
            <p className="flex items-center gap-2 font-extrabold text-text">
              <CheckCircle2 aria-hidden size={18} className="text-success" />
              Safe workaround active — manual results entry
            </p>
            <p className="mt-1.5 text-[13px] text-text-muted">
              SLA evidence: S1 acknowledged in {incident.acknowledgementMinutes}{" "}
              min (target ≤ 5 ✓) · workaround applied in{" "}
              {incident.workaroundMinutes} min (restore target ≤ 30 ✓).
              Participants informed via status page.
            </p>
            <button
              type="button"
              onClick={onResolveIncident}
              disabled={isMutating}
              className="mt-2.5 min-h-11 rounded-lg border border-border bg-surface px-3.5 text-[13px] font-semibold text-text transition hover:bg-surface-muted disabled:cursor-wait disabled:opacity-60"
            >
              Feed restored — resolve incident
            </button>
          </div>
        ) : null}

        {incident?.status === "resolved" ? (
          <div
            role="status"
            className="mt-3 rounded-[10px] border border-border bg-surface p-3.5"
          >
            <p className="font-bold text-success">
              {incident.id} resolved · service nominal
            </p>
            <p className="mt-0.5 text-xs text-text-muted">
              RCA due within 5 business days. SLA clocks stopped; no data loss
              (RPO ≤ 5 min).
            </p>
          </div>
        ) : null}
      </Panel>

      <div className="mt-5 flex items-center gap-2 text-xs text-text-muted">
        <span aria-hidden className="h-2 w-2 rounded-full bg-success" />
        Live Production Env · demo data illustrative
      </div>
    </div>
  );
}

function FunnelRow({
  stage,
  max,
}: {
  readonly stage: FunnelStage;
  readonly max: number;
}) {
  const ratio = stage.value / max;
  return (
    <div>
      <div className="mb-1.5 flex justify-between gap-4 text-[13px] text-text">
        <span className="font-semibold">{stage.label}</span>
        <span className="font-extrabold">
          {numberFormat.format(stage.value)}
        </span>
      </div>
      <div
        className="h-[26px] overflow-hidden rounded-md bg-surface-muted"
        aria-hidden
      >
        <div
          className="h-full rounded-md"
          style={{
            width: `${Math.round(ratio * 100)}%`,
            backgroundColor: funnelColors[stage.id],
          }}
        />
      </div>
    </div>
  );
}

function SlaRow({ metric }: { readonly metric: ServiceLevelMetric }) {
  const Icon = slaIcons[metric.id];
  const color = metric.healthy ? "text-success" : "text-warning";
  return (
    <div
      className="flex items-center gap-2.5 py-2.5"
      aria-label={`${metric.label}, ${metric.value}`}
    >
      <Icon aria-hidden size={18} className={color} />
      <span className="flex-1 text-sm text-text">{metric.label}</span>
      <span className={`text-sm font-extrabold ${color}`}>{metric.value}</span>
    </div>
  );
}

function LoadingState() {
  return (
    <div
      className="mx-auto max-w-[1500px] animate-pulse"
      aria-label="Loading operations data"
    >
      <div className="h-8 w-80 rounded bg-surface-muted" />
      <div className="mt-2 h-4 w-96 rounded bg-surface-muted" />
      <div className="mt-6 grid grid-cols-4 gap-3.5">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-32 rounded-xl border border-border bg-surface"
          />
        ))}
      </div>
      <div className="mt-4 h-72 rounded-xl border border-border bg-surface" />
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  readonly message: string | null;
  readonly onRetry: () => void;
}) {
  return (
    <div
      className="mx-auto mt-16 max-w-lg rounded-xl border border-danger/30 bg-surface p-6 text-center shadow-panel"
      role="alert"
    >
      <AlertTriangle aria-hidden className="mx-auto text-danger" />
      <h1 className="mt-3 text-lg font-extrabold text-text">
        Operations data unavailable
      </h1>
      <p className="mt-1 text-sm text-text-muted">
        {message ?? "The operations snapshot could not be loaded."}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-white hover:bg-primary-dark"
      >
        Retry
      </button>
    </div>
  );
}
