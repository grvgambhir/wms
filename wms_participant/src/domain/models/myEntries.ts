/**
 * The signed-in participant's own entries and what they can register for.
 * Mirrors `GET /v1/me/entries`, `POST /v1/me/entries` and `GET /v1/me/registration-options`.
 */
import type { EntryGrade, RegistrationEntry } from './registrationJourney';

export type MyEntry = {
  id: string;
  eventId: string;
  eventName: string;
  sportId: string;
  sportName: string;
  sportEntryProductId: string;
  productName: string;
  grade: string;
  categoryName: string | null;
  status: string;
  evidenceStatus: string;
  teamRosterId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MyEntriesPage = {
  items: MyEntry[];
  cursor?: string;
};

export type RegistrationOptionProduct = {
  id: string;
  name: string;
  sportId: string;
  sportName: string;
  participantType: string;
  allowedGrades: EntryGrade[];
  partnerRequired: boolean;
  requiresEvidence: boolean;
  /** The caller's live entry for this product — open it instead of creating another. */
  myEntryId: string | null;
  /** Individual products only. `null` where the category depends on a partner or roster. */
  category: {
    name: string | null;
    eligible: boolean;
    referenceDate: string;
    blockedBy: string[];
  } | null;
};

export type RegistrationOptions = {
  event: {
    id: string;
    name: string;
    startsOn: string;
    endsOn: string;
    registrationOpen: boolean;
  } | null;
  products: RegistrationOptionProduct[];
};

export type CreateEntryRequest = {
  sportEntryProductId: string;
  grade: EntryGrade;
  idempotencyKey: string;
};

export type CreatedEntry = RegistrationEntry;

export type RaisedEntryException = {
  id: string;
  decision: 'pending' | 'approved' | 'rejected';
  approvers: string[];
  reason: string;
};
