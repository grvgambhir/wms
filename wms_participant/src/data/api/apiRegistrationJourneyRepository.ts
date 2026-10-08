/**
 * HTTP client for RegistrationJourneyRepository against wms_backend.
 * Same DTOs and RepositoryError codes as MockRegistrationJourneyRepository.
 */
import { backendRequest, queryString } from '@/data/api/wmsBackend';
import type {
  EntryDecision,
  ExportParticipantEntryRequest,
  ExportParticipantEntryResponse,
  GetRegistrationJourneyRequest,
  JourneyEntryStatus,
  JourneyPayment,
  PayOrderRequest,
  PayOrderResponse,
  RegistrationEntry,
  RegistrationJourneySnapshot,
  RegistrationOrder,
  SaveEntryRequest,
  TransitionEntryStatusRequest,
  UpdateEntryEvidenceRequest,
  WaitlistActionRequest,
  WaitlistActionResponse,
} from '@/domain/models/registrationJourney';
import type { RegistrationJourneyRepository } from '@/domain/repositories/registrationJourney.repository';

type ListEnvelope<T> = { items: T[]; total: number };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Path verb for POST /status/:action — backend also accepts toStatus in the body. */
function actionPathForTargetStatus(toStatus: JourneyEntryStatus): string {
  switch (toStatus) {
    case 'withdrawn':
      return 'withdraw';
    case 'cancelled':
      return 'cancel';
    case 'disqualified':
      return 'disqualify';
    case 'substituted':
      return 'substitute';
    case 'draft':
    case 'confirmed':
      return 'reinstate';
    default:
      return toStatus;
  }
}

export class ApiRegistrationJourneyRepository implements RegistrationJourneyRepository {
  private orders: RegistrationOrder[] = [];
  private payments: JourneyPayment[] = [];
  private entries: RegistrationEntry[] = [];

  async getJourney(input: GetRegistrationJourneyRequest): Promise<RegistrationJourneySnapshot> {
    return backendRequest<RegistrationJourneySnapshot>(
      // No athleteId: the backend reads the athlete from the token and ignores one in the URL.
      `/v1/registration-journeys/${encodeURIComponent(input.registrationEntryId)}${queryString({
        eventId: input.eventId,
      })}`,
    );
  }

  async saveEntry(input: SaveEntryRequest): Promise<EntryDecision> {
    return backendRequest<EntryDecision>(`/v1/registration-entries/${encodeURIComponent(input.registrationEntryId)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  }

  async updateEvidenceStatus(input: UpdateEntryEvidenceRequest): Promise<RegistrationEntry> {
    return backendRequest<RegistrationEntry>(
      `/v1/registration-entries/${encodeURIComponent(input.registrationEntryId)}/evidence-status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ evidenceStatus: input.evidenceStatus }),
      },
    );
  }

  async exportParticipantEntry(input: ExportParticipantEntryRequest): Promise<ExportParticipantEntryResponse> {
    return backendRequest<ExportParticipantEntryResponse>(
      `/v1/registration-entries/${encodeURIComponent(input.registrationEntryId)}/exports/participant-safe`,
    );
  }

  async joinWaitlist(input: WaitlistActionRequest): Promise<WaitlistActionResponse> {
    return this.postWaitlist(input, 'join');
  }

  async releaseWaitlistOffer(input: WaitlistActionRequest): Promise<WaitlistActionResponse> {
    return this.postWaitlist(input, 'release-offer');
  }

  async expireWaitlistOffer(input: WaitlistActionRequest): Promise<WaitlistActionResponse> {
    return this.postWaitlist(input, 'expire-offer');
  }

  async claimWaitlistOffer(input: WaitlistActionRequest): Promise<WaitlistActionResponse> {
    return this.postWaitlist(input, 'claim-offer');
  }

  async payOrder(input: PayOrderRequest): Promise<PayOrderResponse> {
    return backendRequest<PayOrderResponse>(`/v1/orders/${encodeURIComponent(input.orderId)}/payments`, {
      method: 'POST',
      body: JSON.stringify({
        idempotencyKey: input.idempotencyKey,
        method: input.method,
        simulateFirstAttemptTimeout: input.simulateFirstAttemptTimeout,
      }),
    });
  }

  async getEntry(registrationEntryId: string): Promise<RegistrationEntry | null> {
    return backendRequest<RegistrationEntry | null>(`/v1/registration-entries/${encodeURIComponent(registrationEntryId)}`, {
      nullOn404: true,
    });
  }

  async transitionEntryStatus(input: TransitionEntryStatusRequest): Promise<RegistrationEntry> {
    const action = actionPathForTargetStatus(input.toStatus);
    return backendRequest<RegistrationEntry>(
      `/v1/registration-entries/${encodeURIComponent(input.registrationEntryId)}/status/${encodeURIComponent(action)}`,
      {
        method: 'POST',
        body: JSON.stringify({
          toStatus: input.toStatus,
          actor: input.actor,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
        }),
      },
    );
  }

  async ensureHydrated(): Promise<void> {
    const [orders, payments, entries] = await Promise.all([
      backendRequest<ListEnvelope<RegistrationOrder>>('/v1/live/orders'),
      backendRequest<ListEnvelope<JourneyPayment>>('/v1/live/payments'),
      backendRequest<ListEnvelope<RegistrationEntry>>('/v1/live/entries'),
    ]);
    this.orders = orders.items;
    this.payments = payments.items;
    this.entries = entries.items;
  }

  listLiveOrders(): RegistrationOrder[] {
    return clone(this.orders);
  }

  listLivePayments(): JourneyPayment[] {
    return clone(this.payments);
  }

  listLiveEntries(): RegistrationEntry[] {
    return clone(this.entries);
  }

  private postWaitlist(input: WaitlistActionRequest, action: string): Promise<WaitlistActionResponse> {
    return backendRequest<WaitlistActionResponse>(`/v1/waitlists/${encodeURIComponent(input.waitlistId)}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey: input.idempotencyKey }),
    });
  }
}
