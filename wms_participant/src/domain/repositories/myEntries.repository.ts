import type {
  CreateEntryRequest,
  CreatedEntry,
  MyEntriesPage,
  RegistrationOptions,
} from '@/domain/models/myEntries';

/** The participant's own entries. Always token-scoped — no athlete id anywhere in the contract. */
export interface MyEntriesRepository {
  list(input?: { eventId?: string; cursor?: string }): Promise<MyEntriesPage>;
  create(input: CreateEntryRequest): Promise<CreatedEntry>;
  registrationOptions(): Promise<RegistrationOptions>;
  raiseException(input: { entryId: string; idempotencyKey: string }): Promise<import('@/domain/models/myEntries').RaisedEntryException>;
}
