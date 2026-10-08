/**
 * In-memory stand-in for tests. Behaves like the backend on the points screens depend on:
 * an empty list is `[]`, a second entry for the same product is refused with the existing id.
 */
import type {
  CreateEntryRequest,
  CreatedEntry,
  MyEntriesPage,
  MyEntry,
  RegistrationOptions,
  RaisedEntryException,
} from '@/domain/models/myEntries';
import type { MyEntriesRepository } from '@/domain/repositories/myEntries.repository';
import { RepositoryError } from '@/data/errors/repositoryError';

export class MockMyEntriesRepository implements MyEntriesRepository {
  constructor(
    private options: RegistrationOptions = { event: null, products: [] },
    private entries: MyEntry[] = [],
  ) {}

  async list(): Promise<MyEntriesPage> {
    return { items: [...this.entries] };
  }

  async create(input: CreateEntryRequest): Promise<CreatedEntry> {
    const product = this.options.products.find((item) => item.id === input.sportEntryProductId);
    if (!product) {
      throw new RepositoryError({ code: 'SPORT_ENTRY_PRODUCT_NOT_FOUND', message: 'Sport entry product was not found.' });
    }
    const existing = this.entries.find((entry) => entry.sportEntryProductId === product.id);
    if (existing) {
      throw new RepositoryError({
        code: 'DUPLICATE_ENTRY',
        message: 'registration.entry.already_exists',
        fields: { entryId: existing.id },
      });
    }
    const now = new Date().toISOString();
    const entry: MyEntry = {
      id: `entry-${this.entries.length + 1}`,
      eventId: this.options.event?.id ?? 'event',
      eventName: this.options.event?.name ?? 'Event',
      sportId: product.sportId,
      sportName: product.sportName,
      sportEntryProductId: product.id,
      productName: product.name,
      grade: input.grade,
      categoryName: product.category?.name ?? null,
      status: 'draft',
      evidenceStatus: product.requiresEvidence ? 'required' : 'not_required',
      teamRosterId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.entries = [entry, ...this.entries];
    product.myEntryId = entry.id;
    return {
      id: entry.id,
      eventId: entry.eventId,
      sportEntryProductId: product.id,
      grade: input.grade,
      status: 'draft',
      evidenceStatus: entry.evidenceStatus,
      statusHistory: [],
      createdAt: now,
      updatedAt: now,
    } as unknown as CreatedEntry;
  }

  async registrationOptions(): Promise<RegistrationOptions> {
    return this.options;
  }

  async raiseException(input: { entryId: string }): Promise<RaisedEntryException> {
    if (!this.entries.some((entry) => entry.id === input.entryId)) {
      throw new RepositoryError({ code: 'REGISTRATION_ENTRY_NOT_FOUND', message: 'registration.entry.not_found' });
    }
    return { id: `exception-${input.entryId}`, decision: 'pending', approvers: [], reason: 'eligibility.cannot_evaluate' };
  }
}
