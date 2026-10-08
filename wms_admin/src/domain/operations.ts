export type IncidentStatus = "open" | "workaround" | "resolved";
export type IntegrationStatus = "healthy" | "stale";

/**
 * Counted by the backend (`GET /v1/admin/operations/snapshot`), never invented here.
 * `quotaCapacity` is null when the event has no quota pool configured, and `activeSessions` is
 * always null: we do not measure live sessions, and the screen says so rather than showing a number.
 */
export interface CapacityMetric {
  readonly paidEntries: number;
  readonly liveEntries: number;
  readonly quotaCapacity: number | null;
  readonly quotaConfirmed: number;
  readonly quotaReserved: number;
  readonly registeredPeople: number;
  readonly reconciliationVarianceMinor: number;
  readonly chargedMinor: number;
  readonly settledMinor: number;
  readonly unpaidMinor: number;
  readonly currency: "EUR";
  readonly activeSessions: null;
}

export interface FunnelStage {
  readonly id: "started" | "submitted" | "paid";
  readonly label: string;
  readonly value: number;
}

/** Work-queue figures the database can answer, plus the incident count from the local demo state. */
export interface ServiceLevelMetric {
  readonly id: "evidence-backlog" | "waitlist" | "unpaid" | "incidents";
  readonly label: string;
  readonly value: string;
  readonly healthy: boolean;
}

export interface OperationsIncident {
  readonly id: string;
  readonly severity: "S1";
  readonly status: IncidentStatus;
  readonly acknowledgementMinutes: number;
  readonly workaroundMinutes?: number;
}

export interface IntegrationHealth {
  readonly name: string;
  readonly status: IntegrationStatus;
  readonly detail: string;
  readonly incident?: OperationsIncident;
}

export interface OperationsLogEntry {
  readonly id: string;
  readonly at: string;
  readonly message: string;
}

export interface OperationsSnapshot {
  readonly generatedAt: string;
  /** False when the backend could not be reached and the demo fallback is being shown. */
  readonly live: boolean;
  readonly capacity: CapacityMetric;
  readonly funnelWindow: string;
  readonly funnel: readonly FunnelStage[];
  readonly serviceLevels: readonly ServiceLevelMetric[];
  readonly integration: IntegrationHealth;
  readonly changeFreezeActive: boolean;
  readonly activityLog: readonly OperationsLogEntry[];
}
