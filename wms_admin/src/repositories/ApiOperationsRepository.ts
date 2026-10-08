import { backendRequest } from "../auth/backendRequest";
import type {
  OperationsSnapshot,
  ServiceLevelMetric,
} from "../domain/operations";
import type { OperationsRepository } from "./OperationsRepository";

/**
 * The dashboard's capacity, funnel and work-queue figures come from the backend
 * (`GET /v1/admin/operations/snapshot`); they used to be hard-coded in the mock.
 *
 * The incident rehearsal (simulate feed failure → open S1 → workaround → resolve), the change
 * freeze and the activity log stay in the local demo repository: there is no monitoring system
 * behind them yet, and pretending otherwise is what this change is fixing. Every snapshot says
 * which half it is showing through `live`.
 */
type BackendSnapshot = {
  generatedAt: string;
  eventId: string;
  capacity: {
    paidEntries: number;
    liveEntries: number;
    quotaCapacity: number | null;
    quotaConfirmed: number;
    quotaReserved: number;
    registeredPeople: number;
    reconciliationVarianceMinor: number;
    chargedMinor: number;
    settledMinor: number;
    unpaidMinor: number;
    currency: "EUR";
    activeSessions: null;
  };
  funnel: Array<{ id: "started" | "submitted" | "paid"; value: number }>;
  statusCounts: Record<string, number>;
  evidenceBacklog: number;
  waitlisted: number;
};

const FUNNEL_LABELS: Record<BackendSnapshot["funnel"][number]["id"], string> = {
  started: "1. Entries started",
  submitted: "2. Submitted (awaiting evidence or payment)",
  paid: "3. Paid in full",
};

const euro = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

export class ApiOperationsRepository implements OperationsRepository {
  constructor(private readonly local: OperationsRepository) {}

  async getSnapshot(): Promise<OperationsSnapshot> {
    const demo = await this.local.getSnapshot();
    try {
      const live = await backendRequest<BackendSnapshot>(
        "/v1/admin/operations/snapshot",
      );
      return this.merge(demo, live);
    } catch {
      // The demo half still works offline; `live: false` tells the screen to say so.
      return { ...demo, live: false };
    }
  }

  simulateResultsFeedFailure = () =>
    this.withLive(() => this.local.simulateResultsFeedFailure());
  openS1Incident = () => this.withLive(() => this.local.openS1Incident());
  applyDocumentedWorkaround = () =>
    this.withLive(() => this.local.applyDocumentedWorkaround());
  resolveIncident = () => this.withLive(() => this.local.resolveIncident());
  setChangeFreeze = (active: boolean) =>
    this.withLive(() => this.local.setChangeFreeze(active));
  resetDemo = () => this.withLive(() => this.local.resetDemo());

  /** Run a demo-state action, then re-read the real figures so the two halves never drift apart. */
  private async withLive(
    action: () => Promise<OperationsSnapshot>,
  ): Promise<OperationsSnapshot> {
    const demo = await action();
    try {
      const live = await backendRequest<BackendSnapshot>(
        "/v1/admin/operations/snapshot",
      );
      return this.merge(demo, live);
    } catch {
      return { ...demo, live: false };
    }
  }

  private merge(
    demo: OperationsSnapshot,
    live: BackendSnapshot,
  ): OperationsSnapshot {
    const incidents = demo.serviceLevels.find(
      (metric) => metric.id === "incidents",
    );
    const serviceLevels: ServiceLevelMetric[] = [
      {
        id: "evidence-backlog",
        label: "Evidence awaiting review",
        value: `${live.evidenceBacklog}`,
        healthy: live.evidenceBacklog === 0,
      },
      {
        id: "waitlist",
        label: "Waitlisted entries",
        value: `${live.waitlisted}`,
        healthy: true,
      },
      {
        id: "unpaid",
        label: "Unpaid balance",
        value: euro.format(live.capacity.unpaidMinor / 100),
        healthy: live.capacity.unpaidMinor === 0,
      },
    ];
    if (incidents) serviceLevels.push(incidents);

    return {
      ...demo,
      live: true,
      generatedAt: live.generatedAt,
      capacity: live.capacity,
      funnelWindow: "All entries for the current event",
      funnel: live.funnel.map((stage) => ({
        id: stage.id,
        label: FUNNEL_LABELS[stage.id],
        value: stage.value,
      })),
      serviceLevels,
    };
  }
}
