// Mock participant claim / pre-registration repository (P03 — REG-13). Looks up a migrated
// EOI record by reference or email and returns a privacy-masked preview; claim marks it
// claimed in-memory (idempotent replay) and returns the full pre-fill details. ApiPreRegistrationRepository
// is the live path; this class stays as the offline fallback. State is in-memory (a claim resets on
// reload) — a first cut; persistence can follow the save-&-resume pattern when needed.
import type {
  ClaimPreRegistrationRequest,
  ClaimPreRegistrationResponse,
  PreRegistrationLookupRequest,
  PreRegistrationLookupResult,
  PreRegistrationPreview,
  PreRegistrationRecord,
  PreRegistrationSeed,
} from '@/domain/models/preRegistration';
import type { PreRegistrationRepository } from '@/domain/repositories/preRegistration.repository';
import { RepositoryError } from '@/data/errors/repositoryError';

import preRegistrationsJson from '@/data/mock/fixtures/data-hub/pre-registrations.json';

const QUERY_DELAY_MS = 260;
const MUTATION_DELAY_MS = 420;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** "Daniel Harper" -> "D••• H•••" — recognisable, not harvestable (PRV). */
function maskName(firstName: string, lastName: string): string {
  const mask = (part: string) => (part ? `${part[0]}•••` : '');
  return [mask(firstName), mask(lastName)].filter(Boolean).join(' ');
}

/** "daniel.harper@example.com" -> "d••••@example.com". */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '•••';
  return `${local[0] ?? ''}••••@${domain}`;
}

function toPreview(record: PreRegistrationRecord): PreRegistrationPreview {
  return {
    id: record.id,
    reference: record.reference,
    maskedName: maskName(record.firstName, record.lastName),
    maskedEmail: maskEmail(record.email),
    birthYear: Number(record.dateOfBirth.slice(0, 4)),
    nationalityCountryCode: record.nationalityCountryCode,
    intendedSports: [...record.intendedSports],
    status: record.status,
  };
}

const seed = preRegistrationsJson as unknown as PreRegistrationSeed;

export class MockPreRegistrationRepository implements PreRegistrationRepository {
  private records = clone(seed.items);

  async lookup(input: PreRegistrationLookupRequest): Promise<PreRegistrationLookupResult> {
    await delay(QUERY_DELAY_MS);
    const q = input.query.trim().toLowerCase();
    if (!q) return { outcome: 'not_found' };
    const record = this.records.find(
      (r) => r.reference.toLowerCase() === q || r.email.toLowerCase() === q,
    );
    if (!record) return { outcome: 'not_found' };
    const preview = toPreview(record);
    return record.status === 'claimed'
      ? { outcome: 'already_claimed', preview }
      : { outcome: 'found', preview };
  }

  async claim(input: ClaimPreRegistrationRequest): Promise<ClaimPreRegistrationResponse> {
    await delay(MUTATION_DELAY_MS);
    if (!input.idempotencyKey) {
      throw new RepositoryError({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'An idempotency key is required.' });
    }
    const record = this.records.find((r) => r.id === input.recordId);
    if (!record) {
      throw new RepositoryError({ code: 'NOT_FOUND', message: 'Pre-registration record was not found.' });
    }
    // Idempotent: an already-claimed record returns its details with alreadyClaimed = true.
    if (record.status === 'claimed') {
      return { record: clone(record), alreadyClaimed: true };
    }
    record.status = 'claimed';
    record.claimedAt = new Date().toISOString();
    return { record: clone(record), alreadyClaimed: false };
  }
}
