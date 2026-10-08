import accreditationsJson from '../data/accreditations.json';
import { backendRequest } from '../auth/backendRequest';
import type {
  AccreditationOverview,
  AccreditationRecord,
  AccreditationSummary,
  CredentialActionResponse,
  IssueCredentialRequest,
  RevokeCredentialRequest,
} from '../domain/accreditationDesk';
import type { AccreditationDeskRepository } from './AccreditationDeskRepository';

const REQUEST_DELAY_MS = 120;
const BADGE_PREFIX = 'COMO27-';
const seed = accreditationsJson as unknown as AccreditationOverview['records'];

function clone<T>(value: T): T {
  return structuredClone(value);
}

function summarize(records: readonly AccreditationRecord[]): AccreditationSummary {
  return {
    pendingCount: records.filter((record) => record.status === 'pending_review').length,
    issuedCount: records.filter((record) => record.status === 'issued').length,
    revokedCount: records.filter((record) => record.status === 'revoked').length,
  };
}

/** Next COMO27-NNNNNN after the highest badge already present on the desk. */
function nextBadgeCounter(records: readonly AccreditationRecord[]): number {
  return records.reduce((maximum, record) => {
    const value = record.badgeNumber ? Number(record.badgeNumber.replace(BADGE_PREFIX, '')) : 0;
    return Number.isFinite(value) ? Math.max(maximum, value) : maximum;
  }, 0) + 1;
}

export class MockAccreditationDeskRepository implements AccreditationDeskRepository {
  private records: AccreditationRecord[] = clone(seed.items);
  private badgeCounter = nextBadgeCounter(this.records);

  // Browser talks to wms_api; vitest stays on the local seed so page tests stay deterministic.
  constructor(private readonly liveApi = import.meta.env.MODE !== 'test') {}

  async getOverview(): Promise<AccreditationOverview> {
    await this.delay();
    if (this.liveApi) await this.hydrateFromApi();
    return this.overview();
  }

  async issueCredential(input: IssueCredentialRequest): Promise<CredentialActionResponse> {
    return this.issueInternal(input, false);
  }

  async reissueCredential(input: IssueCredentialRequest): Promise<CredentialActionResponse> {
    return this.issueInternal(input, true);
  }

  async revokeCredential(input: RevokeCredentialRequest): Promise<CredentialActionResponse> {
    await this.delay();
    const record = this.requireRecord(input.recordId, input.idempotencyKey);
    if (!input.reason.trim()) throw new Error('A revoke reason is required.');
    if (record.status !== 'issued') throw new Error('Only an issued credential can be revoked.');

    const updated: AccreditationRecord = {
      ...record,
      status: 'revoked',
      revokedReason: input.reason.trim(),
      updatedAt: new Date().toISOString(),
    };
    this.replace(updated);
    return this.confirmLive(input.recordId, 'revoke', {
      reason: input.reason.trim(),
      idempotencyKey: input.idempotencyKey,
    }, { record: updated, summary: summarize(this.records) });
  }

  private async issueInternal(
    input: IssueCredentialRequest,
    reissue: boolean,
  ): Promise<CredentialActionResponse> {
    await this.delay();
    const record = this.requireRecord(input.recordId, input.idempotencyKey);
    if (reissue && record.status !== 'issued') {
      throw new Error('Only an issued credential can be reissued.');
    }
    if (!reissue && record.status === 'issued') {
      return this.confirmLive(input.recordId, 'issue', { idempotencyKey: input.idempotencyKey }, {
        record,
        summary: summarize(this.records),
      });
    }
    if (record.photoStatus !== 'approved' || record.eligibilityStatus !== 'approved') {
      throw new Error('Photo and eligibility must both be approved before a credential can be issued.');
    }

    const now = new Date().toISOString();
    const updated: AccreditationRecord = {
      ...record,
      badgeNumber: `${BADGE_PREFIX}${String(this.badgeCounter).padStart(6, '0')}`,
      status: 'issued',
      issuedAt: now,
      revokedReason: undefined,
      updatedAt: now,
    };
    this.badgeCounter += 1;
    this.replace(updated);
    return this.confirmLive(
      input.recordId,
      reissue ? 'reissue' : 'issue',
      { idempotencyKey: input.idempotencyKey },
      { record: updated, summary: summarize(this.records) },
    );
  }

  /**
   * Prefer wms_api as the live desk. Failures (API down) leave the local seed in place.
   */
  private async hydrateFromApi(): Promise<void> {
    try {
      const remote = await backendRequest<AccreditationOverview>('/v1/accreditation-desk');
      this.records = clone(remote.records.items);
      this.badgeCounter = nextBadgeCounter(this.records);
    } catch {
      // Local seed still renders if wms_api is unreachable.
    }
  }

  /**
   * After local gating/mutation succeeds, confirm against wms_api. The API badge and
   * record win when reachable; a failed write keeps the locally computed result.
   */
  private async confirmLive(
    recordId: string,
    action: 'issue' | 'reissue' | 'revoke',
    body: { idempotencyKey: string; reason?: string },
    local: CredentialActionResponse,
  ): Promise<CredentialActionResponse> {
    if (!this.liveApi) return clone(local);
    try {
      const remote = await backendRequest<CredentialActionResponse>(`/v1/accreditation-desk/${recordId}/${action}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      this.replace(remote.record);
      this.badgeCounter = nextBadgeCounter(this.records);
      return clone(remote);
    } catch {
      return clone(local);
    }
  }

  private requireRecord(recordId: string, idempotencyKey: string): AccreditationRecord {
    if (!idempotencyKey.trim()) throw new Error('An idempotency key is required.');
    const record = this.records.find((item) => item.id === recordId);
    if (!record) throw new Error('Accreditation record was not found.');
    return record;
  }

  private replace(updated: AccreditationRecord): void {
    this.records = this.records.map((record) => record.id === updated.id ? updated : record);
  }

  private overview(): AccreditationOverview {
    return clone({
      summary: summarize(this.records),
      records: { items: this.records, total: this.records.length },
    });
  }

  private delay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
  }
}
