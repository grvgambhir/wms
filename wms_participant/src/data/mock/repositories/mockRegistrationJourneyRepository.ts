import type { PaginatedResponse } from '@/domain/models/api';
import type { AthleteProfile } from '@/domain/models/athlete';
import type { Event } from '@/domain/models/event';
import type { EligibilityEvidence, ParticipantEntryExport } from '@/domain/models/evidence';
import type {
  EntryDecision,
  EntryQuota,
  ExportParticipantEntryRequest,
  ExportParticipantEntryResponse,
  Fee,
  GetRegistrationJourneyRequest,
  JourneyDocument,
  JourneyPayment,
  PayOrderRequest,
  PayOrderResponse,
  RegistrationEntry,
  RegistrationJourneySnapshot,
  RegistrationOrder,
  SaveEntryRequest,
  SportEntryProduct,
  TransitionEntryStatusRequest,
  UpdateEntryEvidenceRequest,
  WaitlistActionRequest,
  WaitlistActionResponse,
  WaitlistEntry,
} from '@/domain/models/registrationJourney';
import type { RosterMember } from '@/domain/models/rule';
import type { Sport } from '@/domain/models/sport';
import type { TeamRoster } from '@/domain/models/teamRoster';
import type { RegistrationJourneyRepository } from '@/domain/repositories/registrationJourney.repository';
import { RepositoryError } from '@/data/errors/repositoryError';
import { categoryImpact, deriveCategory } from '@/features/rules/engine';
import { transitionFor } from '@/features/registration/statusLifecycle';
import { getJson, setJson } from '@/data/storage/asyncStorage';
import { storageKeys } from '@/data/storage/keys';

import athletesJson from '@/data/mock/fixtures/data-hub/athletes.json';
import documentsJson from '@/data/mock/fixtures/data-hub/documents.json';
import evidenceJson from '@/data/mock/fixtures/data-hub/evidence.json';
import eventsJson from '@/data/mock/fixtures/data-hub/events.json';
import feesJson from '@/data/mock/fixtures/data-hub/fees.json';
import ordersJson from '@/data/mock/fixtures/data-hub/orders.json';
import paymentsJson from '@/data/mock/fixtures/data-hub/payments.json';
import quotasJson from '@/data/mock/fixtures/data-hub/quotas.json';
import registrationsJson from '@/data/mock/fixtures/data-hub/registrations.json';
import sportEntriesJson from '@/data/mock/fixtures/data-hub/sport-entries.json';
import { DEMO_SPORT_RULES } from '@/data/mock/fixtures/demoSportRules';
import sportsJson from '@/data/mock/fixtures/data-hub/sports.json';
import teamRostersJson from '@/data/mock/fixtures/data-hub/team-rosters.json';
import waitlistsJson from '@/data/mock/fixtures/data-hub/waitlists.json';

const QUERY_DELAY_MS = 260;
const MUTATION_DELAY_MS = 420;
const PAYMENT_DELAY_MS = 1500;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function page<T>(items: T[], cursor?: string): PaginatedResponse<T> {
  return { items: clone(items), total: items.length, ...(cursor ? { cursor } : {}) };
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function notFound(resource: string): RepositoryError {
  return new RepositoryError({ code: 'NOT_FOUND', message: `${resource} was not found.` });
}

const seed = {
  events: eventsJson as unknown as PaginatedResponse<Event>,
  sports: sportsJson as unknown as PaginatedResponse<Sport>,
  athletes: athletesJson as unknown as PaginatedResponse<AthleteProfile>,
  rules: DEMO_SPORT_RULES,
  documents: documentsJson as unknown as PaginatedResponse<JourneyDocument>,
  evidence: evidenceJson as unknown as PaginatedResponse<EligibilityEvidence>,
  products: sportEntriesJson as unknown as PaginatedResponse<SportEntryProduct>,
  registrations: registrationsJson as unknown as PaginatedResponse<RegistrationEntry>,
  fees: feesJson as unknown as PaginatedResponse<Fee>,
  quotas: quotasJson as unknown as PaginatedResponse<EntryQuota>,
  waitlists: waitlistsJson as unknown as PaginatedResponse<WaitlistEntry>,
  orders: ordersJson as unknown as PaginatedResponse<RegistrationOrder>,
  payments: paymentsJson as unknown as PaginatedResponse<JourneyPayment>,
  teamRosters: teamRostersJson as unknown as PaginatedResponse<TeamRoster>,
};

/** The mutable slice of the journey persisted for save & resume across reloads. */
type JourneyPersistedState = {
  entries: RegistrationEntry[];
  quotas: EntryQuota[];
  waitlists: WaitlistEntry[];
  orders: RegistrationOrder[];
  payments: JourneyPayment[];
};

export class MockRegistrationJourneyRepository implements RegistrationJourneyRepository {
  private entries = clone(seed.registrations.items);
  private quotas = clone(seed.quotas.items);
  private waitlists = clone(seed.waitlists.items);
  private orders = clone(seed.orders.items);
  private payments = clone(seed.payments.items);
  // Save & resume: the live journey state is persisted to storage on every mutation and
  // rehydrated on first read, so a participant's progress (evidence → payment → confirmed)
  // survives a reload/session boundary instead of resetting to the seed. Mock analogue of
  // "the entry lives in the backend, not the browser tab." Cleared by Reset demo.
  private hydrated = false;

  /** Public so the finance repo (which reads the live orders/payments synchronously) can
   *  await the same rehydration after a reload — keeps both portals on one governed record. */
  async ensureHydrated(): Promise<void> {
    if (this.hydrated) return;
    const saved = await getJson<JourneyPersistedState>(storageKeys.registrationJourney);
    if (saved) {
      this.entries = saved.entries;
      this.quotas = saved.quotas;
      this.waitlists = saved.waitlists;
      this.orders = saved.orders;
      this.payments = saved.payments;
    }
    this.hydrated = true;
  }

  private async persist(): Promise<void> {
    this.hydrated = true;
    await setJson<JourneyPersistedState>(storageKeys.registrationJourney, {
      entries: this.entries,
      quotas: this.quotas,
      waitlists: this.waitlists,
      orders: this.orders,
      payments: this.payments,
    });
  }

  async getJourney(input: GetRegistrationJourneyRequest): Promise<RegistrationJourneySnapshot> {
    await delay(QUERY_DELAY_MS);
    await this.ensureHydrated();
    const event = seed.events.items.find((item) => item.id === input.eventId);
    const athlete = seed.athletes.items.find((item) => item.id === input.athleteId);
    const entry = this.entries.find((item) => item.id === input.registrationEntryId);
    if (!event) throw notFound('Event');
    if (!athlete) throw notFound('Athlete');
    if (!entry) throw notFound('Registration entry');

    const order = this.orders.find((item) => item.registrationEntryId === entry.id) ?? null;
    const payment = order
      ? this.payments.find((item) => item.orderId === order.id) ?? null
      : null;
    const waitlist = this.waitlists.find((item) => item.registrationEntryId === entry.id) ?? null;

    return {
      event: clone(event),
      athlete: clone(athlete),
      sports: page(seed.sports.items.filter((item) => item.eventId === event.id)),
      sportEntryProducts: page(seed.products.items.filter((item) => item.eventId === event.id)),
      partners: page(seed.athletes.items.filter((item) => item.id !== athlete.id)),
      rules: page(seed.rules.items.filter((item) => item.status === 'active')),
      documents: page(seed.documents.items.filter((item) => item.athleteId === athlete.id)),
      entry: clone(entry),
      fees: page(seed.fees.items.filter((item) => item.eventId === event.id)),
      quotas: page(this.quotas.filter((item) => item.eventId === event.id)),
      waitlist: waitlist ? clone(waitlist) : null,
      order: order ? clone(order) : null,
      payment: payment ? clone(payment) : null,
    };
  }

  async saveEntry(input: SaveEntryRequest): Promise<EntryDecision> {
    await delay(MUTATION_DELAY_MS);
    await this.ensureHydrated();
    if (!input.idempotencyKey) {
      throw new RepositoryError({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'An idempotency key is required.' });
    }

    const entry = this.entries.find((item) => item.id === input.registrationEntryId);
    const product = seed.products.items.find((item) => item.id === input.sportEntryProductId);
    const rule = seed.rules.items.find((item) => item.id === product?.ruleId);
    if (!entry) throw notFound('Registration entry');
    if (!product) throw notFound('Sport entry product');
    if (!rule) throw notFound('Sport rule');
    const isRosterEntry = product.participantType === 'team' || product.participantType === 'crew';
    if (!isRosterEntry && product.partnerRequired && !input.partnerAthleteId) {
      throw new RepositoryError({
        code: 'PARTNER_REQUIRED',
        message: 'A partner or team member is required for this entry.',
        fields: { partnerAthleteId: 'Choose a partner.' },
      });
    }
    const athlete = seed.athletes.items.find((item) => item.id === entry.athleteId);
    const partner = seed.athletes.items.find((item) => item.id === input.partnerAthleteId);
    if (!athlete) throw notFound('Athlete');
    if (!isRosterEntry && product.partnerRequired && !partner) throw notFound('Partner');

    const teamRoster = isRosterEntry
      ? seed.teamRosters.items.find(
          (item) => item.id === input.teamRosterId && item.sportEntryProductId === product.id,
        )
      : undefined;
    if (isRosterEntry && !teamRoster) throw notFound('Team roster');
    if (isRosterEntry && (!input.rosterMemberIds || input.rosterMemberIds.length === 0)) {
      throw new RepositoryError({
        code: 'ROSTER_REQUIRED',
        message: 'Complete the team roster before continuing.',
      });
    }

    const roster: RosterMember[] = teamRoster
      ? input.rosterMemberIds?.map((memberId) => {
          const member = teamRoster.members.find((item) => item.id === memberId);
          if (!member) throw notFound('Roster member');
          return member;
        }) ?? []
      : [
        {
          id: athlete.id,
          name: `${athlete.firstName} ${athlete.lastName}`,
          dob: athlete.dateOfBirth,
          role: product.participantType === 'team' ? 'captain' : 'entrant',
        },
        ...(product.partnerRequired && partner
          ? [
              {
                id: partner.id,
                name: `${partner.firstName} ${partner.lastName}`,
                dob: partner.dateOfBirth,
                role: product.participantType === 'team' ? 'team-member' : 'partner',
              },
            ]
          : []),
      ];
    const derivation = deriveCategory(roster, rule);
    if (!derivation.band) {
      throw new RepositoryError({
        code: 'CATEGORY_NOT_ELIGIBLE',
        message: 'The selected roster does not match an eligible category.',
      });
    }

    const quota = this.quotas.find(
      (item) =>
        item.sportEntryProductId === product.id &&
        (item.categoryId === derivation.band?.id || item.categoryId == null),
    );
    const fee = seed.fees.items.find(
      (item) =>
        item.sportEntryProductId === product.id &&
        item.grade === input.grade &&
        (item.categoryId === derivation.band?.id || item.categoryId == null),
    );
    if (!quota) throw notFound('Quota');
    if (!fee) {
      throw new RepositoryError({
        code: 'FEE_NOT_CONFIGURED',
        message: 'No active fee is configured for this grade and category.',
        fields: { grade: 'Select an available competition grade.' },
      });
    }

    const now = new Date().toISOString();
    const previous = teamRoster
      ? deriveCategory(
          teamRoster.originalMemberIds.map((memberId) => {
            const member = teamRoster.members.find((item) => item.id === memberId);
            if (!member) throw notFound('Original roster member');
            return member;
          }),
          rule,
        )
      : null;
    const impact = previous
      ? categoryImpact(
          previous,
          derivation,
          product.participantType === 'crew'
            ? 'Crew substitution revalidated under the active rule; configured excluded roles were omitted.'
            : 'Younger player added; category, fee and quota revalidated under the active rule.',
        )
      : null;
    const productChanged = entry.sportEntryProductId !== product.id;
    entry.sportId = product.sportId;
    entry.sportEntryProductId = product.id;
    entry.partnerAthleteId = !isRosterEntry && product.partnerRequired ? input.partnerAthleteId : undefined;
    entry.grade = input.grade;
    entry.ruleId = rule.id;
    entry.ruleVersion = rule.version;
    if (teamRoster) {
      entry.originalCategoryId = teamRoster.originalCategoryId;
      entry.originalCategoryName = teamRoster.originalCategoryName;
      entry.teamRosterId = teamRoster.id;
      entry.rosterMemberIds = [...(input.rosterMemberIds ?? [])];
      entry.categoryAudit = impact?.changed
        ? [
            {
              id:
                product.participantType === 'crew'
                  ? 'd52a5056-41e8-4c47-8e18-202700000002'
                  : 'd52a5056-41e8-4c47-8e18-202700000001',
              ruleId: rule.id,
              ruleVersion: rule.version,
              occurredAt: now,
              ...impact,
            },
          ]
        : [];
    } else if (productChanged) {
      entry.originalCategoryId = derivation.band.id;
      entry.originalCategoryName = derivation.categoryName;
      entry.teamRosterId = undefined;
      entry.rosterMemberIds = undefined;
      entry.categoryAudit = undefined;
    }
    entry.currentCategoryId = derivation.band.id;
    entry.currentCategoryName = derivation.categoryName;
    entry.categoryChangeReason = impact?.changed ? impact.reason : undefined;
    entry.evidenceStatus = product.requiresEvidence ? 'required' : 'not_required';
    entry.status = quota.status === 'full' ? 'draft' : product.requiresEvidence ? 'pending_evidence' : 'pending_payment';
    entry.updatedAt = now;

    const order = this.orders.find((item) => item.registrationEntryId === entry.id) ?? null;
    if (order) {
      order.subtotalAmountMinor = fee.baseAmountMinor;
      order.serviceAmountMinor = fee.serviceAmountMinor;
      order.totalAmountMinor = fee.baseAmountMinor + fee.serviceAmountMinor;
      order.status = quota.status === 'full' || product.requiresEvidence ? 'draft' : 'pending_payment';
      if (productChanged) order.paymentId = undefined;
      order.updatedAt = now;
      const payment = this.payments.find((item) => item.orderId === order.id);
      if (payment && (payment.status !== 'captured' || productChanged)) {
        payment.amountMinor = order.totalAmountMinor;
        payment.status = 'pending';
        payment.attemptCount = 0;
        payment.chargeCount = 0;
        payment.providerReference = undefined;
        payment.updatedAt = now;
      }
    }

    const waitlist = this.waitlists.find((item) => item.registrationEntryId === entry.id);
    if (waitlist) {
      waitlist.quotaId = quota.id;
      waitlist.status = 'eligible';
      waitlist.position = undefined;
      waitlist.offerExpiresAt = undefined;
      waitlist.joinedAt = undefined;
      waitlist.updatedAt = now;
    }

    await this.persist();
    return {
      entry: clone(entry),
      quota: clone(quota),
      order: order ? clone(order) : null,
      nextStep: quota.status === 'full' ? 'waitlist' : product.requiresEvidence ? 'evidence' : 'checkout',
    };
  }

  async updateEvidenceStatus(input: UpdateEntryEvidenceRequest): Promise<RegistrationEntry> {
    await delay(MUTATION_DELAY_MS);
    await this.ensureHydrated();
    const entry = this.entries.find((item) => item.id === input.registrationEntryId);
    if (!entry) throw notFound('Registration entry');
    const product = seed.products.items.find((item) => item.id === entry.sportEntryProductId);
    if (!product?.requiresEvidence) {
      throw new RepositoryError({ code: 'EVIDENCE_NOT_REQUIRED', message: 'This entry does not require evidence.' });
    }
    const now = new Date().toISOString();
    entry.evidenceStatus = input.evidenceStatus;
    entry.status = input.evidenceStatus === 'approved' ? 'pending_payment' : 'pending_evidence';
    entry.updatedAt = now;
    const order = this.orders.find((item) => item.registrationEntryId === entry.id);
    if (order) {
      order.status = input.evidenceStatus === 'approved' ? 'pending_payment' : 'draft';
      order.updatedAt = now;
    }
    await this.persist();
    return clone(entry);
  }

  async exportParticipantEntry(input: ExportParticipantEntryRequest): Promise<ExportParticipantEntryResponse> {
    await delay(QUERY_DELAY_MS);
    await this.ensureHydrated();
    const entry = this.entries.find((item) => item.id === input.registrationEntryId);
    if (!entry) throw notFound('Registration entry');
    const athlete = seed.athletes.items.find((item) => item.id === entry.athleteId);
    const product = seed.products.items.find((item) => item.id === entry.sportEntryProductId);
    const sport = seed.sports.items.find((item) => item.id === entry.sportId);
    if (!athlete || !product || !sport) throw notFound('Export source');
    const ordinary = seed.evidence.items
      .filter((item) => item.registrationEntryId === entry.id && item.sportEntryProductId === product.id)
      .map(({ id, type, status }) => ({ id, type, status }));
    const cleanExport: ParticipantEntryExport = {
      generatedAt: new Date().toISOString(),
      privacyProfile: 'participant-safe',
      participant: { id: athlete.id, displayName: `${athlete.firstName} ${athlete.lastName}` },
      entry: {
        id: entry.id,
        eventId: entry.eventId,
        sportId: entry.sportId,
        sportName: sport.name,
        sportEntryProductId: product.id,
        entryName: product.name,
        categoryName: entry.currentCategoryName,
        ruleVersion: entry.ruleVersion,
        status: entry.status,
      },
      ordinaryEvidence: { items: ordinary, total: ordinary.length },
      exclusions: {
        restrictedEvidence: true,
        excludedFieldGroups: ['medical', 'paraClassification', 'restrictedFiles', 'restrictedAccessLogs'],
      },
    };
    return { export: cleanExport };
  }

  async joinWaitlist(input: WaitlistActionRequest): Promise<WaitlistActionResponse> {
    await delay(MUTATION_DELAY_MS);
    await this.ensureHydrated();
    const state = this.waitlistState(input);
    if (state.quota.status !== 'full' && state.quota.status !== 'reserved') {
      throw new RepositoryError({ code: 'QUOTA_AVAILABLE', message: 'A place is available; continue to checkout.' });
    }
    const now = new Date().toISOString();
    state.waitlist.status = 'waiting';
    state.waitlist.position = 3;
    state.waitlist.offerExpiresAt = undefined;
    state.waitlist.joinedAt ??= now;
    state.waitlist.updatedAt = now;
    state.entry.status = 'waitlisted';
    state.entry.updatedAt = now;
    await this.persist();
    return this.waitlistResponse(state.waitlist, state.entry, state.quota, state.order);
  }

  async releaseWaitlistOffer(input: WaitlistActionRequest): Promise<WaitlistActionResponse> {
    await delay(MUTATION_DELAY_MS);
    await this.ensureHydrated();
    const state = this.waitlistState(input);
    if (state.waitlist.status === 'offered') {
      return this.waitlistResponse(state.waitlist, state.entry, state.quota, state.order);
    }
    if (state.waitlist.status !== 'waiting' && state.waitlist.status !== 'expired') {
      throw new RepositoryError({ code: 'NOT_WAITLISTED', message: 'Join the waitlist before an offer is released.' });
    }
    const now = new Date();
    state.quota.confirmed = Math.max(0, state.quota.capacity - 1);
    state.quota.reserved = 1;
    state.quota.status = 'reserved';
    state.quota.updatedAt = now.toISOString();
    state.waitlist.status = 'offered';
    state.waitlist.offerExpiresAt = new Date(now.getTime() + 20_000).toISOString();
    state.waitlist.updatedAt = now.toISOString();
    await this.persist();
    return this.waitlistResponse(state.waitlist, state.entry, state.quota, state.order);
  }

  async expireWaitlistOffer(input: WaitlistActionRequest): Promise<WaitlistActionResponse> {
    await delay(120);
    await this.ensureHydrated();
    const state = this.waitlistState(input);
    const now = new Date().toISOString();
    state.waitlist.status = 'expired';
    state.waitlist.offerExpiresAt = undefined;
    state.waitlist.updatedAt = now;
    state.entry.status = 'waitlisted';
    state.entry.updatedAt = now;
    await this.persist();
    return this.waitlistResponse(state.waitlist, state.entry, state.quota, state.order);
  }

  async claimWaitlistOffer(input: WaitlistActionRequest): Promise<WaitlistActionResponse> {
    await delay(MUTATION_DELAY_MS);
    await this.ensureHydrated();
    const state = this.waitlistState(input);
    if (state.waitlist.status === 'claimed') {
      return this.waitlistResponse(state.waitlist, state.entry, state.quota, state.order);
    }
    if (state.waitlist.status !== 'offered') {
      throw new RepositoryError({ code: 'OFFER_NOT_ACTIVE', message: 'This waitlist offer is not active.' });
    }
    if (!state.waitlist.offerExpiresAt || Date.parse(state.waitlist.offerExpiresAt) <= Date.now()) {
      throw new RepositoryError({ code: 'OFFER_EXPIRED', message: 'This offer has expired.' });
    }
    const now = new Date().toISOString();
    state.waitlist.status = 'claimed';
    state.waitlist.offerExpiresAt = undefined;
    state.waitlist.updatedAt = now;
    state.quota.confirmed = Math.min(state.quota.capacity, state.quota.confirmed + 1);
    state.quota.reserved = Math.max(0, state.quota.reserved - 1);
    state.quota.status = state.quota.confirmed >= state.quota.capacity ? 'full' : 'available';
    state.quota.updatedAt = now;
    state.entry.status = 'pending_payment';
    state.entry.updatedAt = now;
    if (state.order) {
      state.order.status = 'pending_payment';
      state.order.updatedAt = now;
    }
    await this.persist();
    return this.waitlistResponse(state.waitlist, state.entry, state.quota, state.order);
  }

  async payOrder(input: PayOrderRequest): Promise<PayOrderResponse> {
    await this.ensureHydrated();
    const order = this.orders.find((item) => item.id === input.orderId);
    if (!order) throw notFound('Order');
    const entry = this.entries.find((item) => item.id === order.registrationEntryId);
    const payment = this.payments.find((item) => item.orderId === order.id);
    if (!entry) throw notFound('Registration entry');
    if (!payment) throw notFound('Payment');
    if (!input.idempotencyKey) {
      throw new RepositoryError({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'An idempotency key is required.' });
    }

    if (payment.status === 'captured') {
      return {
        payment: clone(payment),
        order: clone(order),
        entry: clone(entry),
        duplicateChargePrevented: true,
      };
    }

    payment.status = 'processing';
    payment.idempotencyKey = input.idempotencyKey;
    payment.updatedAt = new Date().toISOString();
    await delay(PAYMENT_DELAY_MS);

    const now = new Date().toISOString();
    payment.status = 'captured';
    payment.attemptCount = input.simulateFirstAttemptTimeout ? 2 : 1;
    payment.chargeCount = 1;
    payment.providerReference = 'mock_psp_2027_0004417';
    payment.updatedAt = now;
    order.status = 'paid';
    order.paymentId = payment.id;
    order.updatedAt = now;
    entry.status = 'confirmed';
    entry.updatedAt = now;

    await this.persist();
    return {
      payment: clone(payment),
      order: clone(order),
      entry: clone(entry),
      duplicateChargePrevented: input.simulateFirstAttemptTimeout,
    };
  }

  // --- REG-11 status lifecycle -------------------------------------------------
  async getEntry(registrationEntryId: string): Promise<RegistrationEntry | null> {
    await delay(QUERY_DELAY_MS);
    await this.ensureHydrated();
    const entry = this.entries.find((item) => item.id === registrationEntryId);
    return entry ? clone(entry) : null;
  }

  async transitionEntryStatus(input: TransitionEntryStatusRequest): Promise<RegistrationEntry> {
    await delay(MUTATION_DELAY_MS);
    await this.ensureHydrated();
    if (!input.idempotencyKey) {
      throw new RepositoryError({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'An idempotency key is required.' });
    }
    const entry = this.entries.find((item) => item.id === input.registrationEntryId);
    if (!entry) throw notFound('Registration entry');
    // Idempotent: already in the target state → no-op replay.
    if (entry.status === input.toStatus) return clone(entry);
    const transition = transitionFor(entry.status, input.toStatus);
    if (!transition) {
      throw new RepositoryError({
        code: 'ILLEGAL_STATUS_TRANSITION',
        message: `Cannot move a ${entry.status} entry to ${input.toStatus}.`,
      });
    }
    if (transition.actor !== input.actor) {
      throw new RepositoryError({
        code: 'ACTOR_NOT_PERMITTED',
        message: `A ${input.actor} may not ${transition.action} this entry.`,
      });
    }
    const now = new Date().toISOString();
    entry.status = input.toStatus;
    entry.updatedAt = now;
    entry.statusHistory = [
      ...(entry.statusHistory ?? []),
      { status: input.toStatus, actor: input.actor, reason: input.reason, occurredAt: now },
    ];
    // Cancelling/withdrawing an unpaid entry voids its open order too (keeps finance honest).
    if (input.toStatus === 'cancelled' || input.toStatus === 'withdrawn') {
      const order = this.orders.find((item) => item.registrationEntryId === entry.id);
      if (order && order.status !== 'paid') {
        order.status = 'cancelled';
        order.updatedAt = now;
      }
    }
    await this.persist();
    return clone(entry);
  }

  // --- Cross-portal read accessors ---------------------------------------------
  // A05 Finance reads the SAME live orders/payments/entries this repository mutates,
  // so a participant payment made in the participant portal reconciles in the admin
  // portal against one governed record (the mock analogue of "both services, one DB").
  listLiveOrders(): RegistrationOrder[] {
    return clone(this.orders);
  }

  listLivePayments(): JourneyPayment[] {
    return clone(this.payments);
  }

  listLiveEntries(): RegistrationEntry[] {
    return clone(this.entries);
  }

  private waitlistState(input: WaitlistActionRequest) {
    if (!input.idempotencyKey) {
      throw new RepositoryError({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'An idempotency key is required.' });
    }
    const waitlist = this.waitlists.find((item) => item.id === input.waitlistId);
    if (!waitlist) throw notFound('Waitlist entry');
    const entry = this.entries.find((item) => item.id === waitlist.registrationEntryId);
    const quota = this.quotas.find((item) => item.id === waitlist.quotaId);
    if (!entry) throw notFound('Registration entry');
    if (!quota) throw notFound('Quota');
    const order = this.orders.find((item) => item.registrationEntryId === entry.id) ?? null;
    return { waitlist, entry, quota, order };
  }

  private waitlistResponse(
    waitlist: WaitlistEntry,
    entry: RegistrationEntry,
    quota: EntryQuota,
    order: RegistrationOrder | null,
  ): WaitlistActionResponse {
    return {
      waitlist: clone(waitlist),
      entry: clone(entry),
      quota: clone(quota),
      order: order ? clone(order) : null,
    };
  }
}
