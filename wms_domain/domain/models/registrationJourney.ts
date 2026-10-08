import type { PaginatedResponse } from './api';
import type { AthleteProfile } from './athlete';
import type { EligibilityDocument } from './document';
import type { Event } from './event';
import type { EvidenceGateStatus, ParticipantEntryExport } from './evidence';
import type { SportRule } from './rule';
import type { Sport } from './sport';
import type { CategoryAuditRecord } from './teamRoster';

export type EntryGrade = 'competitive' | 'recreational';
export type JourneyEntryStatus =
  | 'draft'
  | 'pending_evidence'
  | 'pending_team'
  | 'pending_payment'
  | 'waitlisted'
  | 'confirmed'
  | 'cancelled'
  | 'substituted'
  | 'withdrawn'
  | 'disqualified';

/** One recorded step in the entry's status lifecycle (REG-11) — who moved it, when, why. */
export type EntryStatusEvent = {
  status: JourneyEntryStatus;
  actor: 'participant' | 'admin' | 'system';
  reason?: string;
  occurredAt: string;
};

export type SportEntryProduct = {
  id: string;
  eventId: string;
  sportId: string;
  name: string;
  participantType: 'individual' | 'doubles' | 'team' | 'crew' | 'relay';
  ruleId: string;
  allowedGrades: EntryGrade[];
  partnerRequired: boolean;
  requiresEvidence: boolean;
};

export type RegistrationEntry = {
  id: string;
  athleteId: string;
  eventId: string;
  sportId: string;
  sportEntryProductId: string;
  partnerAthleteId?: string;
  grade: EntryGrade;
  ruleId: string;
  ruleVersion: string;
  originalCategoryId?: string;
  originalCategoryName?: string;
  currentCategoryId?: string;
  currentCategoryName?: string;
  categoryChangeReason?: string;
  teamRosterId?: string;
  rosterMemberIds?: string[];
  categoryAudit?: CategoryAuditRecord[];
  evidenceStatus: EvidenceGateStatus;
  status: JourneyEntryStatus;
  /** REG-11 audit trail of status changes (optional — absent on legacy seed rows). */
  statusHistory?: EntryStatusEvent[];
  orderId?: string;
  waitlistId?: string;
  createdAt: string;
  updatedAt: string;
};

/** REG-11 — apply an explicit lifecycle transition (withdraw/cancel/disqualify/substitute/reinstate). */
export type TransitionEntryStatusRequest = {
  registrationEntryId: string;
  toStatus: JourneyEntryStatus;
  actor: 'participant' | 'admin' | 'system';
  reason?: string;
  idempotencyKey: string;
};

export type Fee = {
  id: string;
  eventId: string;
  sportEntryProductId: string;
  categoryId?: string;
  grade: EntryGrade;
  currency: 'EUR';
  baseAmountMinor: number;
  serviceAmountMinor: number;
  effectiveFrom: string;
  effectiveTo?: string;
};

export type QuotaState = 'available' | 'full' | 'reserved';

export type EntryQuota = {
  id: string;
  eventId: string;
  sportEntryProductId: string;
  categoryId?: string;
  capacity: number;
  confirmed: number;
  reserved: number;
  status: QuotaState;
  updatedAt: string;
};

export type WaitlistStatus = 'eligible' | 'waiting' | 'offered' | 'claimed' | 'expired';

export type WaitlistEntry = {
  id: string;
  registrationEntryId: string;
  quotaId: string;
  athleteId: string;
  status: WaitlistStatus;
  position?: number;
  offerExpiresAt?: string;
  joinedAt?: string;
  updatedAt: string;
};

export type OrderStatus = 'draft' | 'pending_payment' | 'paid' | 'cancelled';

export type RegistrationOrder = {
  id: string;
  registrationEntryId: string;
  currency: 'EUR';
  subtotalAmountMinor: number;
  serviceAmountMinor: number;
  totalAmountMinor: number;
  status: OrderStatus;
  paymentId?: string;
  createdAt: string;
  updatedAt: string;
};

export type JourneyPaymentStatus = 'pending' | 'processing' | 'captured' | 'failed' | 'refunded';

export type JourneyPayment = {
  id: string;
  orderId: string;
  registrationEntryId: string;
  amountMinor: number;
  currency: 'EUR';
  method: 'card';
  status: JourneyPaymentStatus;
  providerReference?: string;
  idempotencyKey: string;
  attemptCount: number;
  chargeCount: number;
  createdAt: string;
  updatedAt: string;
};

export type JourneyDocument = EligibilityDocument & {
  accessLevel: 'standard' | 'restricted';
};

export type RegistrationJourneySnapshot = {
  event: Event;
  athlete: AthleteProfile;
  sports: PaginatedResponse<Sport>;
  sportEntryProducts: PaginatedResponse<SportEntryProduct>;
  partners: PaginatedResponse<AthleteProfile>;
  rules: PaginatedResponse<SportRule>;
  documents: PaginatedResponse<JourneyDocument>;
  entry: RegistrationEntry;
  fees: PaginatedResponse<Fee>;
  quotas: PaginatedResponse<EntryQuota>;
  waitlist: WaitlistEntry | null;
  order: RegistrationOrder | null;
  payment: JourneyPayment | null;
};

export type GetRegistrationJourneyRequest = {
  eventId: string;
  athleteId: string;
  registrationEntryId: string;
};

export type SaveEntryRequest = {
  registrationEntryId: string;
  sportEntryProductId: string;
  partnerAthleteId?: string;
  grade: EntryGrade;
  teamRosterId?: string;
  rosterMemberIds?: string[];
  idempotencyKey: string;
};

export type EntryDecision = {
  entry: RegistrationEntry;
  quota: EntryQuota;
  order: RegistrationOrder | null;
  nextStep: 'evidence' | 'checkout' | 'waitlist';
};

export type UpdateEntryEvidenceRequest = {
  registrationEntryId: string;
  evidenceStatus: EvidenceGateStatus;
};

export type ExportParticipantEntryRequest = { registrationEntryId: string };
export type ExportParticipantEntryResponse = { export: ParticipantEntryExport };

export type WaitlistActionRequest = {
  waitlistId: string;
  idempotencyKey: string;
};

export type WaitlistActionResponse = {
  waitlist: WaitlistEntry;
  entry: RegistrationEntry;
  quota: EntryQuota;
  order: RegistrationOrder | null;
};

export type PayOrderRequest = {
  orderId: string;
  idempotencyKey: string;
  method: 'card';
  simulateFirstAttemptTimeout: boolean;
};

export type PayOrderResponse = {
  payment: JourneyPayment;
  order: RegistrationOrder;
  entry: RegistrationEntry;
  duplicateChargePrevented: boolean;
};
