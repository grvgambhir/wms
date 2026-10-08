// Mock participant-consent repository (P06 — PLT-07 / PRV-02). Serves granular
// notices from an API-shaped seed and mutates in-memory: grant / withdraw each
// bump the timestamp. Idempotency-key guarded so a double-tap/retry applies once.
// Swap for an ApiConsentRepository later, no UI change.
import type { PaginatedResponse } from '@/domain/models/api';
import {
  COMO_DEMO_PARTICIPANT_ID,
  type ConsentActionRequest,
  type ConsentActionResponse,
  type ConsentListResponse,
  type ConsentRecord,
} from '@/domain/models/consent';
import type { ConsentRepository } from '@/domain/repositories/consent.repository';
import { RepositoryError } from '@/data/errors/repositoryError';

import consentsJson from '@/data/mock/fixtures/data-hub/consents.json';

const QUERY_DELAY_MS = 240;
const MUTATION_DELAY_MS = 360;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const seed = consentsJson as unknown as PaginatedResponse<ConsentRecord>;

export class MockConsentRepository implements ConsentRepository {
  private records = clone(seed.items);
  // Maps a used idempotency key to the record it produced (retry returns the same one).
  private replay = new Map<string, ConsentRecord>();

  async getConsents(participantId: string): Promise<ConsentListResponse> {
    await delay(QUERY_DELAY_MS);
    let items = this.records.filter((record) => record.participantId === participantId);
    if (items.length === 0) {
      const now = new Date().toISOString();
      const templated = clone(
        this.records.filter((record) => record.participantId === COMO_DEMO_PARTICIPANT_ID),
      ).map((record, index) => ({
        ...record,
        id: `${participantId}-consent-${index}`,
        participantId,
        status: 'withdrawn' as const,
        updatedAt: now,
        grantedAt: undefined,
        withdrawnAt: now,
      }));
      this.records.push(...templated);
      items = templated;
    }
    return { items: clone(items), total: items.length };
  }

  async grantConsent(input: ConsentActionRequest): Promise<ConsentActionResponse> {
    return this.apply(input, 'granted');
  }

  async withdrawConsent(input: ConsentActionRequest): Promise<ConsentActionResponse> {
    return this.apply(input, 'withdrawn');
  }

  private async apply(
    input: ConsentActionRequest,
    nextStatus: ConsentRecord['status'],
  ): Promise<ConsentActionResponse> {
    await delay(MUTATION_DELAY_MS);
    if (!input.idempotencyKey) {
      throw new RepositoryError({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'An idempotency key is required.' });
    }
    const cached = this.replay.get(input.idempotencyKey);
    if (cached) {
      return { record: clone(cached) };
    }
    const record = this.requireRecord(input.consentId);
    const now = new Date().toISOString();
    // Already in the requested state → return current (no silent timestamp bump).
    if (record.status !== nextStatus) {
      record.status = nextStatus;
      record.updatedAt = now;
      if (nextStatus === 'granted') {
        record.grantedAt = now;
      } else {
        record.withdrawnAt = now;
      }
    }
    const result = clone(record);
    this.replay.set(input.idempotencyKey, result);
    return { record: result };
  }

  private requireRecord(consentId: string): ConsentRecord {
    const record = this.records.find((item) => item.id === consentId);
    if (!record) {
      throw new RepositoryError({ code: 'NOT_FOUND', message: 'Consent record was not found.' });
    }
    return record;
  }
}
