// Assisted/proxy registration domain (PLT-06). Helpdesk operators may act for a
// participant only after recording authority/consent. Every mutation produces an
// immutable audit event that distinguishes the operator from the participant.
// Backend-adaptable: plain JSON DTOs, UUID IDs and ISO-8601 timestamps only.
import type { PaginatedResponse } from './api';

export type AssistedParticipantSource = 'athlete' | 'pre_registration';
export type AssistedConsentMethod = 'phone' | 'in_person' | 'email';
export type AssistedRegistrationStatus = 'not_started' | 'draft' | 'submitted';
export type ProxyRegistrationAction = 'registration_started' | 'registration_submitted';
export type AssistedAuditAction = 'consent_recorded' | ProxyRegistrationAction;

export type AssistedOperator = {
  id: string;
  name: string;
};

export type AssistedParticipant = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  nationalityCountryCode: string;
  source: AssistedParticipantSource;
};

export type ProxyConsentRecord = {
  id: string;
  reference: string;
  participantId: string;
  participantName: string;
  method: AssistedConsentMethod;
  capturedByOperatorId: string;
  capturedByOperatorName: string;
  capturedAt: string;
};

export type AssistedRegistrationSession = {
  id: string;
  participantId: string;
  registrationStatus: AssistedRegistrationStatus;
  consent?: ProxyConsentRecord;
  updatedAt: string;
};

export type ProxyAuditEntry = {
  id: string;
  action: AssistedAuditAction;
  operatorId: string;
  operatorName: string;
  participantId: string;
  participantName: string;
  consentReference: string;
  occurredAt: string;
};

export type AssistedRegistrationOverview = {
  operator: AssistedOperator;
  participants: PaginatedResponse<AssistedParticipant>;
  sessions: PaginatedResponse<AssistedRegistrationSession>;
  auditTrail: PaginatedResponse<ProxyAuditEntry>;
};

export type RecordProxyConsentInput = {
  participantId: string;
  operatorId: string;
  method: AssistedConsentMethod;
  idempotencyKey: string;
};

export type PerformProxyActionInput = {
  participantId: string;
  operatorId: string;
  action: ProxyRegistrationAction;
  idempotencyKey: string;
};

export type AssistedMutationResponse = {
  session: AssistedRegistrationSession;
  auditEntry: ProxyAuditEntry;
};
