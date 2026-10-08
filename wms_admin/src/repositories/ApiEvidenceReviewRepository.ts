import { backendRequest } from "../auth/backendRequest";
import type {
  EvidenceClassification,
  EvidenceReviewItem,
} from "../domain/evidenceReview";
import type {
  EvidenceAction,
  EvidenceReviewRepository,
} from "./EvidenceReviewRepository";

/**
 * Ordinary and restricted evidence are two endpoints, on purpose: the restricted queue is served
 * through the `restricted_rw` boundary and every read of it is access-logged. The screen shows one
 * list, so this repository fetches both and tags each row with where it came from.
 */
type Page<T> = { items: T[] };

type QueueRow = {
  id: string;
  registrationEntryId: string;
  athleteId: string;
  athleteName?: string;
  sportName?: string;
  productName?: string;
  label: string;
  type: string;
  required: boolean;
  status: EvidenceReviewItem["status"];
  fileName?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  uploadedAt?: string;
  reviewStartedAt?: string;
  reviewedAt?: string;
  reviewerDisplayName?: string;
  rejectionReason?: string;
  accessLoggedAt?: string;
};

const basePath = (classification: EvidenceClassification): string =>
  classification === "restricted" ? "/v1/restricted-evidence" : "/v1/evidence";

function toItem(
  row: QueueRow,
  classification: EvidenceClassification,
): EvidenceReviewItem {
  return { ...row, classification };
}

export class ApiEvidenceReviewRepository implements EvidenceReviewRepository {
  async queue(): Promise<EvidenceReviewItem[]> {
    const [ordinary, restricted] = await Promise.all([
      backendRequest<Page<QueueRow>>("/v1/evidence/review-queue"),
      backendRequest<Page<QueueRow>>("/v1/restricted-evidence/review-queue"),
    ]);
    return [
      ...ordinary.items.map((row) => toItem(row, "ordinary")),
      ...restricted.items.map((row) => toItem(row, "restricted")),
    ].sort((a, b) => (a.uploadedAt ?? "").localeCompare(b.uploadedAt ?? ""));
  }

  startReview(input: EvidenceAction): Promise<void> {
    return this.post(input, "review", {});
  }

  approve(input: EvidenceAction): Promise<void> {
    return this.post(input, "decisions", { decision: "approved" });
  }

  reject(input: EvidenceAction & { reason: string }): Promise<void> {
    return this.post(input, "decisions", {
      decision: "rejected",
      reason: input.reason,
    });
  }

  waive(input: EvidenceAction & { reason: string }): Promise<void> {
    return this.post(input, "waivers", { reason: input.reason });
  }

  private async post(
    input: EvidenceAction,
    action: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    await backendRequest<unknown>(
      `${basePath(input.item.classification)}/${encodeURIComponent(input.item.id)}/${action}`,
      {
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: JSON.stringify(body),
      },
    );
  }
}
