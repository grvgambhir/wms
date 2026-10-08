export type DocumentType = 'passport_id' | 'dob_proof' | 'medical_declaration' | 'liability_waiver' | 'other';
export type DocumentStatus = 'missing' | 'uploaded' | 'verified' | 'rejected';

export interface EligibilityDocument {
  id: string;
  athleteId: string;
  registrationDraftId?: string;
  type: DocumentType;
  fileName: string;
  localUri?: string;
  remoteUrl?: string;
  status: DocumentStatus;
  uploadedAt?: string;
  rejectionReason?: string;
}

export interface DocumentRequirement {
  eventId?: string;
  type: DocumentType;
  label: string;
  required: boolean;
}
