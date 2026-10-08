import type { PaginatedResponse } from '@/domain/models/api';
import type {
  DecideEvidenceRequest,
  EligibilityEvidence,
  EvidenceMutationResponse,
  EvidenceStatus,
  ListEvidenceRequest,
  ReviewEvidenceRequest,
  UploadEvidenceRequest,
} from '@/domain/models/evidence';
import type { EvidenceRepository } from '@/domain/repositories/evidence.repository';
import { RepositoryError } from '@/data/errors/repositoryError';
import evidenceJson from '@/data/mock/fixtures/data-hub/evidence.json';

const seed = evidenceJson as unknown as PaginatedResponse<EligibilityEvidence>;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 260));

export class MockEvidenceRepository implements EvidenceRepository {
  private items = clone(seed.items);

  async list(input: ListEvidenceRequest): Promise<PaginatedResponse<EligibilityEvidence>> {
    await delay();
    const items = this.items.filter(
      (item) => item.registrationEntryId === input.registrationEntryId && item.sportEntryProductId === input.sportEntryProductId,
    );
    return { items: clone(items), total: items.length };
  }

  async upload(input: UploadEvidenceRequest): Promise<EvidenceMutationResponse<EligibilityEvidence>> {
    await delay();
    const item = this.find(input.evidenceId);
    if (item.status !== 'required' && item.status !== 'rejected') this.invalid('upload', item.status);
    Object.assign(item, {
      status: 'uploaded' as const,
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      mockUri: `mock://ordinary-evidence/${item.id}`,
      uploadedAt: new Date().toISOString(),
      rejectionReason: undefined,
      reviewedAt: undefined,
    });
    return this.response(item);
  }

  async startReview(input: ReviewEvidenceRequest): Promise<EvidenceMutationResponse<EligibilityEvidence>> {
    await delay();
    const item = this.find(input.evidenceId);
    if (item.status !== 'uploaded') this.invalid('start review for', item.status);
    item.status = 'under_review';
    item.reviewStartedAt = new Date().toISOString();
    return this.response(item);
  }

  async decide(input: DecideEvidenceRequest): Promise<EvidenceMutationResponse<EligibilityEvidence>> {
    await delay();
    const item = this.find(input.evidenceId);
    if (item.status !== 'under_review') this.invalid('decide', item.status);
    if (input.decision === 'rejected' && !input.reason) {
      throw new RepositoryError({ code: 'REJECTION_REASON_REQUIRED', message: 'A rejection reason is required.' });
    }
    item.status = input.decision;
    item.reviewerDisplayName = 'Demo reviewer';
    item.reviewedAt = new Date().toISOString();
    item.rejectionReason = input.decision === 'rejected' ? input.reason : undefined;
    return this.response(item);
  }

  private find(id: string): EligibilityEvidence {
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item) throw new RepositoryError({ code: 'NOT_FOUND', message: 'Evidence was not found.' });
    return item;
  }

  private invalid(action: string, status: EvidenceStatus): never {
    throw new RepositoryError({ code: 'INVALID_EVIDENCE_TRANSITION', message: `Cannot ${action} evidence in ${status}.` });
  }

  private response(item: EligibilityEvidence): EvidenceMutationResponse<EligibilityEvidence> {
    return { item: clone(item), entryEvidenceStatus: item.status === 'approved' ? 'approved' : item.status === 'rejected' ? 'rejected' : 'pending_review' };
  }
}

