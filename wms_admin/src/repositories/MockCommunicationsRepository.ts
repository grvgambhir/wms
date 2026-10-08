import communicationsJson from '../data/communications.json';
import { backendRequest } from '../auth/backendRequest';
import type {
  AudienceSegment,
  CommunicationRecord,
  CommunicationsOverview,
  CommunicationsSummary,
  MessageTemplate,
  SendBroadcastInput,
  SendBroadcastResponse,
} from '../domain/communications';
import type { CommunicationsRepository } from './CommunicationsRepository';

const REQUEST_DELAY_MS = 120;
const BROADCAST_PREFIX = 'bcast-';

type CommunicationsSeed = {
  segments: AudienceSegment[];
  templates: MessageTemplate[];
  history: { items: CommunicationRecord[]; total: number };
};

const seed = communicationsJson as unknown as CommunicationsSeed;

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Next bcast-NNNN after the highest id already in the delivery log. */
function nextBroadcastCounter(history: readonly CommunicationRecord[]): number {
  return history.reduce((maximum, record) => {
    const value = record.id.startsWith(BROADCAST_PREFIX)
      ? Number(record.id.replace(BROADCAST_PREFIX, ''))
      : 0;
    return Number.isFinite(value) ? Math.max(maximum, value) : maximum;
  }, 0);
}

export class MockCommunicationsRepository implements CommunicationsRepository {
  private segments = clone(seed.segments);
  private templates = clone(seed.templates);
  private history = clone(seed.history.items);
  private readonly sentKeys = new Map<string, CommunicationRecord>();
  private broadcastCounter = nextBroadcastCounter(this.history);

  // Browser talks to wms_api; vitest stays on the local seed so page tests stay deterministic.
  constructor(private readonly liveApi = import.meta.env.MODE !== 'test') {}

  async getOverview(): Promise<CommunicationsOverview> {
    await this.delay();
    if (this.liveApi) await this.hydrateFromApi();
    return this.overview();
  }

  async sendBroadcast(input: SendBroadcastInput): Promise<SendBroadcastResponse> {
    await this.delay();
    if (!input.idempotencyKey.trim()) {
      throw new Error('An idempotency key is required.');
    }

    const existing = this.sentKeys.get(input.idempotencyKey);
    if (existing) {
      return this.confirmLive(input, { record: existing, summary: this.summarize() });
    }

    const subject = input.subject.trim();
    if (!subject) {
      throw new Error('A subject is required to send a broadcast.');
    }
    const segment = this.segments.find((item) => item.id === input.audienceId);
    if (!segment) {
      throw new Error('The selected audience was not found.');
    }

    this.broadcastCounter += 1;
    const record: CommunicationRecord = {
      id: `${BROADCAST_PREFIX}${String(this.broadcastCounter).padStart(4, '0')}`,
      subject,
      audienceId: input.audienceId,
      channel: input.channel,
      recipientCount: segment.recipientCount,
      status: 'sent',
      sentAt: new Date().toISOString(),
      ...(input.templateId ? { templateId: input.templateId } : {}),
    };
    this.history = [record, ...this.history];
    this.sentKeys.set(input.idempotencyKey, clone(record));
    return this.confirmLive(input, { record, summary: this.summarize() });
  }

  /**
   * Prefer wms_api as the live comms centre. Failures (API down) leave the local seed in place.
   */
  private async hydrateFromApi(): Promise<void> {
    try {
      const remote = await backendRequest<CommunicationsOverview>('/v1/communications');
      this.segments = clone(remote.segments);
      this.templates = clone(remote.templates);
      this.history = clone(remote.history.items);
      this.broadcastCounter = nextBroadcastCounter(this.history);
    } catch {
      // Local seed still renders if wms_api is unreachable.
    }
  }

  /**
   * After local gating/mutation succeeds, confirm against wms_api. The API record and
   * summary win when reachable; a failed write keeps the locally computed result.
   */
  private async confirmLive(
    input: SendBroadcastInput,
    local: SendBroadcastResponse,
  ): Promise<SendBroadcastResponse> {
    if (!this.liveApi) return clone(local);
    try {
      const remote = await backendRequest<SendBroadcastResponse>('/v1/communications/broadcasts', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      this.replaceRecord(local.record.id, remote.record);
      this.sentKeys.set(input.idempotencyKey, clone(remote.record));
      this.broadcastCounter = nextBroadcastCounter(this.history);
      return clone(remote);
    } catch {
      return clone(local);
    }
  }

  private replaceRecord(localId: string, remote: CommunicationRecord): void {
    const replaced = this.history.some((record) => record.id === localId);
    this.history = replaced
      ? this.history.map((record) => (record.id === localId ? remote : record))
      : [remote, ...this.history];
  }

  private summarize(): CommunicationsSummary {
    return {
      sentCount: this.history.length,
      totalRecipients: this.history.reduce((sum, record) => sum + record.recipientCount, 0),
      templateCount: this.templates.length,
    };
  }

  private overview(): CommunicationsOverview {
    return clone({
      summary: this.summarize(),
      segments: this.segments,
      templates: this.templates,
      history: { items: this.history, total: this.history.length },
    });
  }

  private delay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
  }
}
