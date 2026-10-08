import type { PaginatedResponse } from './api';

export type EvidenceStatus = 'required' | 'uploaded' | 'under_review' | 'approved' | 'rejected';
export type EvidenceGateStatus = 'not_required' | 'required' | 'pending_review' | 'approved' | 'rejected';
export type OrdinaryEvidenceType =
  | 'identity_document'
  | 'accreditation_photo'
  | 'federation_licence'
  | 'belt_certificate'
  | 'weigh_in';

/** Values declared with a Judo evidence upload; an OC decision turns these into verified facts. */
export type EvidenceDeclaredAttribute = {
  attribute: 'weight_kg' | 'belt_rank' | 'federation_licence';
  numericValue?: number;
  textValue?: string;
  validUntil?: string;
};

export type EligibilityEvidence = {
  id: string;
  registrationEntryId: string;
  sportEntryProductId: string;
  athleteId: string;
  type: OrdinaryEvidenceType;
  label: string;
  required: boolean;
  status: EvidenceStatus;
  fileName?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  mockUri?: string;
  uploadedAt?: string;
  reviewStartedAt?: string;
  reviewedAt?: string;
  reviewerDisplayName?: string;
  rejectionReason?: string;
};

export type ListEvidenceRequest = {
  registrationEntryId: string;
  sportEntryProductId: string;
};

export type UploadEvidenceRequest = {
  evidenceId: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  idempotencyKey: string;
  declaredAttribute?: EvidenceDeclaredAttribute;
};

export type ReviewEvidenceRequest = { evidenceId: string; idempotencyKey: string };
export type DecideEvidenceRequest = ReviewEvidenceRequest & {
  decision: 'approved' | 'rejected';
  reason?: string;
};

export type EvidenceMutationResponse<T> = {
  item: T;
  entryEvidenceStatus: EvidenceGateStatus;
};

export type ParticipantEntryExport = {
  generatedAt: string;
  privacyProfile: 'participant-safe';
  participant: { id: string; displayName: string };
  entry: {
    id: string;
    eventId: string;
    sportId: string;
    sportName: string;
    sportEntryProductId: string;
    entryName: string;
    categoryName?: string;
    ruleVersion: string;
    status: string;
  };
  ordinaryEvidence: PaginatedResponse<Pick<EligibilityEvidence, 'id' | 'type' | 'status'>>;
  exclusions: {
    restrictedEvidence: true;
    excludedFieldGroups: string[];
  };
};
