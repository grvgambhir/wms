import type { PaginatedResponse } from '@/domain/models/api';
import type { EvidenceStatus } from '@/domain/models/evidence';
import type {
  DecideRestrictedEvidenceRequest,
  ListRestrictedEvidenceRequest,
  RestrictedEvidence,
  RestrictedEvidenceMutationResponse,
  ReviewRestrictedEvidenceRequest,
  UploadRestrictedEvidenceRequest,
} from '@/domain/models/restrictedEvidence';
import type { RestrictedEvidenceRepository } from '@/domain/repositories/restrictedEvidence.repository';
import { RepositoryError } from '@/data/errors/repositoryError';
import restrictedEvidenceJson from '@/data/mock/fixtures/data-hub/restricted-evidence.json';

const seed = restrictedEvidenceJson as unknown as PaginatedResponse<RestrictedEvidence>;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 260));

export class MockRestrictedEvidenceRepository implements RestrictedEvidenceRepository {
  private items = clone(seed.items);

  async list(input: ListRestrictedEvidenceRequest): Promise<PaginatedResponse<RestrictedEvidence>> {
    await delay();
    const now = new Date().toISOString();
    const items = this.items.filter(
      (item) => item.registrationEntryId === input.registrationEntryId && item.sportEntryProductId === input.sportEntryProductId,
    );
    items.forEach((item) => { item.accessLoggedAt = now; });
    return { items: clone(items), total: items.length };
  }

  async upload(input: UploadRestrictedEvidenceRequest): Promise<RestrictedEvidenceMutationResponse> {
    await delay();
    const item = this.find(input.evidenceId);
    if (item.status !== 'required' && item.status !== 'rejected') this.invalid('upload', item.status);
    Object.assign(item, {
      status: 'uploaded' as const,
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      mockUri: `mock://restricted-evidence/${item.id}`,
      uploadedAt: new Date().toISOString(),
      rejectionReason: undefined,
      reviewedAt: undefined,
    });
    return this.response(item);
  }

  async startReview(input: ReviewRestrictedEvidenceRequest): Promise<RestrictedEvidenceMutationResponse> {
    await delay();
    const item = this.find(input.evidenceId);
    if (item.status !== 'uploaded') this.invalid('start review for', item.status);
    item.status = 'under_review';
    item.reviewStartedAt = new Date().toISOString();
    return this.response(item);
  }

  async decide(input: DecideRestrictedEvidenceRequest): Promise<RestrictedEvidenceMutationResponse> {
    await delay();
    const item = this.find(input.evidenceId);
    if (item.status !== 'under_review') this.invalid('decide', item.status);
    if (input.decision === 'rejected' && !input.reason) {
      throw new RepositoryError({ code: 'REJECTION_REASON_REQUIRED', message: 'A rejection reason is required.' });
    }
    item.status = input.decision;
    item.reviewerDisplayName = 'Restricted evidence reviewer';
    item.reviewedAt = new Date().toISOString();
    item.rejectionReason = input.decision === 'rejected' ? input.reason : undefined;
    return this.response(item);
  }

  private find(id: string): RestrictedEvidence {
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item) throw new RepositoryError({ code: 'NOT_FOUND', message: 'Restricted evidence was not found.' });
    return item;
  }

  private invalid(action: string, status: EvidenceStatus): never {
    throw new RepositoryError({ code: 'INVALID_EVIDENCE_TRANSITION', message: `Cannot ${action} restricted evidence in ${status}.` });
  }

  private response(item: RestrictedEvidence): RestrictedEvidenceMutationResponse {
    return { item: clone(item), entryEvidenceStatus: item.status === 'approved' ? 'approved' : item.status === 'rejected' ? 'rejected' : 'pending_review' };
  }
}
