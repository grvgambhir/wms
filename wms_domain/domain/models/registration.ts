export type RegistrationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'action_required'
  | 'waitlisted'
  | 'rejected'
  | 'approved'
  | 'accreditation_pending'
  | 'accreditation_issued';

export interface RegistrationDraft {
  id: string;
  athleteId: string;
  eventId: string;
  sportId?: string;
  disciplineId?: string;
  categoryId?: string;
  partnerAthleteId?: string;
  documentIds: string[];
  accreditationPhotoUri?: string;
  termsAccepted: boolean;
  promoCode?: string;
  currentStep: number;
  updatedAt: string;
}

export interface Registration {
  id: string;
  athleteId: string;
  eventId: string;
  sportId: string;
  disciplineId: string;
  categoryId: string;
  partnerAthleteId?: string;
  documentIds: string[];
  paymentId?: string;
  status: RegistrationStatus;
  submittedAt?: string;
  approvedAt?: string;
}

export interface RegistrationFeeConfig {
  eventId: string;
  currency: string;
  entryFee: number;
  serviceFee: number;
  promoCodes?: Array<{ code: string; discountAmount: number; label?: string }>;
}
