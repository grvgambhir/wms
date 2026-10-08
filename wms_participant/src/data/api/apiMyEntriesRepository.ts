/**
 * HTTP client for the participant's own entries against wms_backend.
 *
 * No mock fallback on purpose: a network error here must surface as an error, not as a fixture
 * list that looks like the athlete's real registrations.
 */
import { backendRequest, queryString } from '@/data/api/wmsBackend';
import type {
  CreateEntryRequest,
  CreatedEntry,
  MyEntriesPage,
  RegistrationOptions,
  RaisedEntryException,
} from '@/domain/models/myEntries';
import type { MyEntriesRepository } from '@/domain/repositories/myEntries.repository';

export class ApiMyEntriesRepository implements MyEntriesRepository {
  list(input: { eventId?: string; cursor?: string } = {}): Promise<MyEntriesPage> {
    return backendRequest<MyEntriesPage>(
      `/v1/me/entries${queryString({ eventId: input.eventId, cursor: input.cursor, limit: '100' })}`,
    );
  }

  create(input: CreateEntryRequest): Promise<CreatedEntry> {
    return backendRequest<CreatedEntry>('/v1/me/entries', {
      method: 'POST',
      body: JSON.stringify({ sportEntryProductId: input.sportEntryProductId, grade: input.grade }),
      idempotencyKey: input.idempotencyKey,
    });
  }

  registrationOptions(): Promise<RegistrationOptions> {
    return backendRequest<RegistrationOptions>('/v1/me/registration-options');
  }

  raiseException(input: { entryId: string; idempotencyKey: string }): Promise<RaisedEntryException> {
    return backendRequest<RaisedEntryException>(
      `/v1/registration-entries/${encodeURIComponent(input.entryId)}/exceptions`,
      { method: 'POST', body: JSON.stringify({}), idempotencyKey: input.idempotencyKey },
    );
  }
}
