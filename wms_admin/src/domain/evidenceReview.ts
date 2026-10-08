import { ApiError } from "../api/httpClient";

/**
 * The OC's evidence work queue.
 *
 * Until now nothing in the admin portal rendered the review queues: an athlete could upload a
 * medical certificate and the only way to approve it was to call the API by hand, which is how
 * scenario 1 was demonstrated. The reviewer actions were also sitting on the *athlete's* own
 * screen, where they return Forbidden.
 *
 * Two queues, one screen. Ordinary evidence (identity documents) and restricted evidence (medical,
 * para classification) are separate endpoints on purpose — the restricted one is read through the
 * `restricted_rw` boundary and every read of it is access-logged.
 */

export type EvidenceStatus =
  "required" | "uploaded" | "under_review" | "approved" | "rejected" | "waived";

export type EvidenceClassification = "ordinary" | "restricted";

export type EvidenceReviewItem = {
  id: string;
  classification: EvidenceClassification;
  registrationEntryId: string;
  athleteId: string;
  athleteName?: string;
  sportName?: string;
  productName?: string;
  label: string;
  type: string;
  required: boolean;
  status: EvidenceStatus;
  fileName?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  uploadedAt?: string;
  reviewStartedAt?: string;
  reviewedAt?: string;
  reviewerDisplayName?: string;
  rejectionReason?: string;
  /** Set on restricted items: reading them is logged, and the screen says so. */
  accessLoggedAt?: string;
};

/** Reason codes the OC can pick when refusing a document. They are i18n keys, not free text. */
export const REJECTION_REASONS = [
  {
    key: "evidence.rejected.unreadable",
    label: "Unreadable or incomplete scan",
  },
  { key: "evidence.rejected.expired", label: "Document has expired" },
  {
    key: "evidence.rejected.wrong_person",
    label: "Does not match the athlete",
  },
  { key: "evidence.rejected.wrong_document", label: "Wrong document type" },
] as const;

export function evidenceStatusLabel(status: EvidenceStatus): string {
  const text = status.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function athleteLabel(item: EvidenceReviewItem): string {
  return item.athleteName ?? item.athleteId.slice(0, 8);
}

export function entryLabel(item: EvidenceReviewItem): string {
  if (item.sportName && item.productName)
    return `${item.sportName} · ${item.productName}`;
  return item.registrationEntryId.slice(0, 8);
}

export function explainEvidenceError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "EVIDENCE_NOT_FOUND")
      return "That document no longer exists.";
    if (error.code === "INVALID_EVIDENCE_TRANSITION") {
      return "Someone else has already acted on this document. The queue has been refreshed.";
    }
    if (error.code === "REJECTION_REASON_REQUIRED")
      return "Choose a reason before rejecting.";
    return "The review action was refused.";
  }
  if (error instanceof TypeError)
    return "The request did not reach the server. Try again.";
  return "The review action could not be completed.";
}
