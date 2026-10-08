import type {
  OperationsIncident,
  OperationsLogEntry,
  OperationsSnapshot,
} from '../domain/operations';
import type { OperationsRepository } from './OperationsRepository';

const REQUEST_DELAY_MS = 120;

function initialSnapshot(): OperationsSnapshot {
  return {
    generatedAt: '2026-09-04T09:30:00.000Z',
    // Zeroes, not invented figures: this half only runs when the backend is unreachable, and a
    // dashboard that makes numbers up is the bug this file used to carry.
    live: false,
    capacity: {
      paidEntries: 0,
      liveEntries: 0,
      quotaCapacity: null,
      quotaConfirmed: 0,
      quotaReserved: 0,
      registeredPeople: 0,
      reconciliationVarianceMinor: 0,
      chargedMinor: 0,
      settledMinor: 0,
      unpaidMinor: 0,
      currency: 'EUR',
      activeSessions: null,
    },
    funnelWindow: 'Counts unavailable',
    funnel: [
      { id: 'started', label: '1. Entries started', value: 0 },
      { id: 'submitted', label: '2. Submitted (awaiting evidence or payment)', value: 0 },
      { id: 'paid', label: '3. Paid in full', value: 0 },
    ],
    serviceLevels: serviceLevelsFor(undefined),
    integration: {
      name: 'Results Interface (competition feed)',
      status: 'healthy',
      detail: 'Feed healthy · last import 12s ago',
    },
    changeFreezeActive: false,
    activityLog: [
      logEntry('LOG-001', '2026-09-04T09:30:00.000Z', 'Operations snapshot loaded'),
    ],
  };
}

function serviceLevelsFor(incident: OperationsIncident | undefined) {
  const activeIncident = incident != null && incident.status !== 'resolved';
  const coreHealthy = incident?.status !== 'open';

  void coreHealthy;
  return [
    {
      id: 'evidence-backlog' as const,
      label: 'Evidence awaiting review',
      value: '—',
      healthy: true,
    },
    {
      id: 'waitlist' as const,
      label: 'Waitlisted entries',
      value: '—',
      healthy: true,
    },
    {
      id: 'unpaid' as const,
      label: 'Unpaid balance',
      value: '—',
      healthy: true,
    },
    {
      id: 'incidents' as const,
      label: 'Active Incidents',
      value: `${activeIncident ? 1 : 0} Open`,
      healthy: !activeIncident,
    },
  ];
}

function logEntry(id: string, at: string, message: string): OperationsLogEntry {
  return { id, at, message };
}

function cloneSnapshot(snapshot: OperationsSnapshot): OperationsSnapshot {
  return structuredClone(snapshot);
}

export class MockOperationsRepository implements OperationsRepository {
  private snapshot: OperationsSnapshot = initialSnapshot();

  async getSnapshot(): Promise<OperationsSnapshot> {
    await this.delay();
    return cloneSnapshot(this.snapshot);
  }

  async simulateResultsFeedFailure(): Promise<OperationsSnapshot> {
    if (this.snapshot.integration.status !== 'healthy' || this.snapshot.integration.incident) {
      throw new Error('The results feed is not in a healthy starting state.');
    }

    this.snapshot = this.withIntegration(
      {
        name: this.snapshot.integration.name,
        status: 'stale',
        detail: 'Feed STALE · no import for 6m · downstream results not updating',
      },
      'Results interface marked stale by monitoring',
    );
    return this.respond();
  }

  async openS1Incident(): Promise<OperationsSnapshot> {
    if (this.snapshot.integration.status !== 'stale' || this.snapshot.integration.incident) {
      throw new Error('A stale feed without an active incident is required.');
    }

    const incident: OperationsIncident = {
      id: 'INC-001',
      severity: 'S1',
      status: 'open',
      acknowledgementMinutes: 3,
    };
    this.snapshot = this.withIntegration(
      { ...this.snapshot.integration, incident },
      `${incident.id} opened and acknowledged in 3 minutes`,
    );
    return this.respond();
  }

  async applyDocumentedWorkaround(): Promise<OperationsSnapshot> {
    const incident = this.snapshot.integration.incident;
    if (!incident || incident.status !== 'open') {
      throw new Error('An open S1 incident is required.');
    }

    const updatedIncident: OperationsIncident = {
      ...incident,
      status: 'workaround',
      workaroundMinutes: 22,
    };
    this.snapshot = this.withIntegration(
      { ...this.snapshot.integration, incident: updatedIncident },
      'Documented workaround applied: manual results entry',
    );
    return this.respond();
  }

  async resolveIncident(): Promise<OperationsSnapshot> {
    const incident = this.snapshot.integration.incident;
    if (!incident || incident.status !== 'workaround') {
      throw new Error('The documented workaround must be active before resolution.');
    }

    const updatedIncident: OperationsIncident = { ...incident, status: 'resolved' };
    this.snapshot = this.withIntegration(
      {
        name: this.snapshot.integration.name,
        status: 'healthy',
        detail: 'Feed healthy · last import 12s ago',
        incident: updatedIncident,
      },
      `${incident.id} resolved; service returned to nominal`,
    );
    return this.respond();
  }

  async setChangeFreeze(active: boolean): Promise<OperationsSnapshot> {
    this.snapshot = {
      ...this.snapshot,
      changeFreezeActive: active,
      generatedAt: new Date().toISOString(),
      activityLog: [
        ...this.snapshot.activityLog,
        this.nextLog(active ? 'Protected change freeze activated' : 'Protected change freeze lifted'),
      ],
    };
    return this.respond();
  }

  async resetDemo(): Promise<OperationsSnapshot> {
    this.snapshot = initialSnapshot();
    return this.respond();
  }

  private withIntegration(
    integration: OperationsSnapshot['integration'],
    message: string,
  ): OperationsSnapshot {
    const incident = integration.incident;
    return {
      ...this.snapshot,
      generatedAt: new Date().toISOString(),
      integration,
      serviceLevels: serviceLevelsFor(incident),
      activityLog: [...this.snapshot.activityLog, this.nextLog(message)],
    };
  }

  private nextLog(message: string): OperationsLogEntry {
    return logEntry(
      `LOG-${String(this.snapshot.activityLog.length + 1).padStart(3, '0')}`,
      new Date().toISOString(),
      message,
    );
  }

  private async respond(): Promise<OperationsSnapshot> {
    await this.delay();
    return cloneSnapshot(this.snapshot);
  }

  private delay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
  }
}
