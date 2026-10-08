/**
 * Read-only loader for seed data-hub fixtures (moved from wms_api at cutover).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, 'fixtures/data-hub');

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(join(DIR, file), 'utf8')) as unknown;
}

function items<T>(file: string): T[] {
  const raw = readJson(file) as { items?: T[] };
  return raw.items ?? [];
}

export interface EventFixture {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface SportFixture {
  id: string;
  name: string;
  eventId: string;
}

export interface ProductFixture {
  id: string;
  eventId: string;
  sportId: string;
  name: string;
  participantType: 'individual' | 'doubles' | 'team' | 'crew' | 'relay';
  ruleId: string;
  allowedGrades: string[];
  partnerRequired: boolean;
  requiresEvidence: boolean;
}

export interface RuleFixture {
  id: string;
  sport: string;
  event: string;
  strategy: string;
  excludeRoles?: string[];
  rounding?: string;
  referenceDate: string;
  version: string;
  effectiveDate: string;
  status: string;
  bands?: Array<{ id: string; name: string; minAge: number; maxAge: number | null }>;
  dimensions?: Array<{
    attribute: string;
    aggregation: 'self' | 'min' | 'max' | 'mean' | 'sum';
    rounding: 'none' | 'floor' | 'round' | 'ceil';
    valueScale: number;
    bandKind: 'range' | 'enum';
    bands: unknown[];
  }>;
  eligibility?: Array<{ predicate: string; params: Record<string, unknown>; messageKey: string }>;
}

export interface QuotaFixture {
  id: string;
  eventId: string;
  sportEntryProductId: string;
  categoryId?: string;
  capacity: number;
  confirmed: number;
  reserved: number;
}

export interface FeeFixture {
  id: string;
  eventId: string;
  sportEntryProductId: string;
  categoryId?: string;
  grade: string;
  currency: string;
  baseAmountMinor: number;
  serviceAmountMinor: number;
  effectiveFrom: string;
}

export interface AthleteFixture {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  nationalityCountryCode: string;
  gender: string;
  email: string;
  phone?: string;
  profileImageKey?: string;
  emergencyContact?: { name: string; relationship: string; phone: string };
}

export interface RosterMemberFixture {
  id: string;
  athleteId: string;
  name: string;
  dob: string;
  role: string;
}

export interface RosterFixture {
  id: string;
  eventId: string;
  sportEntryProductId: string;
  name: string;
  members: RosterMemberFixture[];
  originalMemberIds: string[];
  substituteMemberIds: string[];
  originalCategoryId: string;
  originalCategoryName: string;
}

export interface AccreditationFixture {
  id: string;
  athleteId?: string;
  participantName: string;
  nationalityCountryCode: string;
  sportName: string;
  role: string;
  photoStatus: string;
  eligibilityStatus: string;
  status: string;
  accessZones: string[];
  badgeNumber?: string;
  validFrom: string;
  validUntil: string;
  issuedAt?: string;
  revokedReason?: string;
  updatedAt?: string;
}

export interface TemplateFixture {
  id: string;
  name: string;
  subjectEn: string;
  bodyEn: string;
  subjectIt: string;
  bodyIt: string;
  defaultAudienceId: string;
  channel: string;
}

export interface BroadcastFixture {
  id: string;
  subject: string;
  audienceId: string;
  channel: string;
  recipientCount: number;
  status: string;
  sentAt: string;
  templateId?: string;
}

export interface ExceptionFixture {
  id: string;
  participant: string;
  sport: string;
  event: string;
  impact: string;
  reason: string;
  restricted?: boolean;
}

export interface EvidenceFixture {
  id: string;
  registrationEntryId: string;
  sportEntryProductId: string;
  athleteId: string;
  type: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  mockUri: string;
  uploadedAt: string;
  reviewedAt?: string;
}

export interface DocumentFixture {
  id: string;
  athleteId: string;
  registrationDraftId: string;
  type: string;
  fileName: string;
  status: string;
  uploadedAt: string;
  accessLevel: string;
}

export interface PreRegistrationFixture {
  id: string;
  reference: string;
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: string;
  nationalityCountryCode: string;
  intendedSports: string[];
  sourceList: string;
  status: string;
  migratedAt: string;
  claimedAt?: string;
}

export interface AssistedSessionFixture {
  id: string;
  participantId: string;
  registrationStatus: string;
  consent?: {
    id: string;
    reference: string;
    participantId: string;
    participantName: string;
    method: string;
    capturedByOperatorId: string;
    capturedAt: string;
  };
  updatedAt: string;
}

export interface WaitlistFixture {
  id: string;
  registrationEntryId: string;
  quotaId: string;
  athleteId: string;
  status: string;
}

export interface RegistrationFixture {
  id: string;
  athleteId: string;
  sportEntryProductId: string;
  partnerAthleteId?: string;
  grade: string;
  ruleId: string;
  originalCategoryId: string;
  originalCategoryName: string;
  currentCategoryId: string;
  currentCategoryName: string;
  evidenceStatus: string;
  status: string;
  orderId?: string;
}

export const events = items<EventFixture>('events.json');
export const sports = items<SportFixture>('sports.json');
export const products = items<ProductFixture>('sport-entries.json');
export const rules = items<RuleFixture>('sport-rules.json');
export const quotas = items<QuotaFixture>('quotas.json');
export const fees = items<FeeFixture>('fees.json');
export const athletes = items<AthleteFixture>('athletes.json');
export const rosters = items<RosterFixture>('team-rosters.json');
export const accreditations = items<AccreditationFixture>('accreditations.json');
export const exceptions = items<ExceptionFixture>('exceptions.json');
export const evidence = items<EvidenceFixture>('evidence.json');
export const documents = items<DocumentFixture>('documents.json');
export const preRegistrations = items<PreRegistrationFixture>('pre-registrations.json');
export const waitlists = items<WaitlistFixture>('waitlists.json');
export const registrations = items<RegistrationFixture>('registrations.json');

const comms = readJson('communications.json') as {
  templates: TemplateFixture[];
  history: { items: BroadcastFixture[] };
};

export const templates = comms.templates;
export const broadcasts = comms.history.items;

const assisted = readJson('assisted-sessions.json') as {
  operator: { id: string; name: string };
  sessions: { items: AssistedSessionFixture[] };
};

export const assistedOperatorId = assisted.operator.id;
export const assistedSessions = assisted.sessions.items;
