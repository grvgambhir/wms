import type {
  EntryDecision,
  ExportParticipantEntryRequest,
  ExportParticipantEntryResponse,
  GetRegistrationJourneyRequest,
  PayOrderRequest,
  PayOrderResponse,
  RegistrationEntry,
  RegistrationJourneySnapshot,
  SaveEntryRequest,
  TransitionEntryStatusRequest,
  UpdateEntryEvidenceRequest,
  WaitlistActionRequest,
  WaitlistActionResponse,
} from '../models/registrationJourney';

/**
 * REST mapping:
 * - getJourney -> GET /registration-journeys/{entryId}
 * - saveEntry -> PUT /registration-entries/{entryId}
 * - updateEvidenceStatus -> PATCH /registration-entries/{entryId}/evidence-status
 * - exportParticipantEntry -> GET /registration-entries/{entryId}/exports/participant-safe
 * - joinWaitlist -> POST /waitlists/{waitlistId}/join
 * - releaseWaitlistOffer -> POST /waitlists/{waitlistId}/release-offer (demo/admin action)
 * - expireWaitlistOffer -> POST /waitlists/{waitlistId}/expire-offer
 * - claimWaitlistOffer -> POST /waitlists/{waitlistId}/claim-offer
 * - payOrder -> POST /orders/{orderId}/payments
 * - getEntry -> GET /registration-entries/{entryId}
 * - transitionEntryStatus -> POST /registration-entries/{entryId}/status/{action} (REG-11)
 *
 * Every mutation receives a client idempotency key. Implementations throw a
 * normalized repository error carrying `{ code, message, fields? }`.
 */
export interface RegistrationJourneyRepository {
  getJourney(input: GetRegistrationJourneyRequest): Promise<RegistrationJourneySnapshot>;
  saveEntry(input: SaveEntryRequest): Promise<EntryDecision>;
  updateEvidenceStatus(input: UpdateEntryEvidenceRequest): Promise<RegistrationJourneySnapshot['entry']>;
  exportParticipantEntry(input: ExportParticipantEntryRequest): Promise<ExportParticipantEntryResponse>;
  joinWaitlist(input: WaitlistActionRequest): Promise<WaitlistActionResponse>;
  releaseWaitlistOffer(input: WaitlistActionRequest): Promise<WaitlistActionResponse>;
  expireWaitlistOffer(input: WaitlistActionRequest): Promise<WaitlistActionResponse>;
  claimWaitlistOffer(input: WaitlistActionRequest): Promise<WaitlistActionResponse>;
  payOrder(input: PayOrderRequest): Promise<PayOrderResponse>;
  /** REG-11 — read a single entry (hydrated) so the admin governance panel can act on it. */
  getEntry(registrationEntryId: string): Promise<RegistrationEntry | null>;
  /** REG-11 — apply a guarded lifecycle transition; throws on an illegal move. */
  transitionEntryStatus(input: TransitionEntryStatusRequest): Promise<RegistrationEntry>;
}
