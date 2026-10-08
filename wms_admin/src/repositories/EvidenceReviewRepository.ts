import type { EvidenceReviewItem } from "../domain/evidenceReview";

export type EvidenceAction = {
  item: Pick<EvidenceReviewItem, "id" | "classification">;
  idempotencyKey: string;
  /** Required when rejecting: an i18n reason key, never free text. */
  reason?: string;
};

export interface EvidenceReviewRepository {
  /** Both queues, ordinary and restricted, merged and ordered oldest upload first. */
  queue(): Promise<EvidenceReviewItem[]>;
  startReview(input: EvidenceAction): Promise<void>;
  approve(input: EvidenceAction): Promise<void>;
  reject(input: EvidenceAction & { reason: string }): Promise<void>;
  waive(input: EvidenceAction & { reason: string }): Promise<void>;
}
