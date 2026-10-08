import type {
  DecideEvidenceRequest,
  EvidenceMutationResponse,
  EvidenceStatus,
  ListEvidenceRequest,
  ReviewEvidenceRequest,
  UploadEvidenceRequest,
} from './evidence';

export type RestrictedEvidenceType = 'medical_certificate' | 'para_classification';

/** Stored behind a distinct service/key/access-log boundary (PRV-04). */
export type RestrictedEvidence = {
  id: string;
  registrationEntryId: string;
  sportEntryProductId: string;
  athleteId: string;
  type: RestrictedEvidenceType;
  label: string;
  required: true;
  status: EvidenceStatus;
  accessClassification: 'restricted';
  accessPolicy: string;
  fileName?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  mockUri?: string;
  uploadedAt?: string;
  reviewStartedAt?: string;
  reviewedAt?: string;
  reviewerDisplayName?: string;
  rejectionReason?: string;
  accessLoggedAt?: string;
};

export type ListRestrictedEvidenceRequest = ListEvidenceRequest;
export type UploadRestrictedEvidenceRequest = UploadEvidenceRequest;
export type ReviewRestrictedEvidenceRequest = ReviewEvidenceRequest;
export type DecideRestrictedEvidenceRequest = DecideEvidenceRequest;
export type RestrictedEvidenceMutationResponse = EvidenceMutationResponse<RestrictedEvidence>;

