import assistedSessionsJson from '../data/assisted-sessions.json';
import athletesJson from '../data/athletes.json';
import preRegistrationsJson from '../data/pre-registrations.json';
import { backendRequest } from '../auth/backendRequest';
import type {
  AssistedMutationResponse,
  AssistedOperator,
  AssistedParticipant,
  AssistedRegistrationOverview,
  AssistedRegistrationSession,
  PerformProxyActionInput,
  ProxyAuditEntry,
  RecordProxyConsentInput,
} from '../domain/assistedRegistration';
import type { AssistedRegistrationRepository } from './AssistedRegistrationRepository';

const REQUEST_DELAY_MS = 120;
type AssistedSeed = Pick<AssistedRegistrationOverview, 'operator' | 'sessions' | 'auditTrail'>;
type AthleteSeed = { items: Array<Pick<AssistedParticipant, 'id' | 'firstName' | 'lastName' | 'email' | 'nationalityCountryCode'>> };
type PreRegistrationSeed = { items: Array<{ email: string }> };
const seed = assistedSessionsJson as unknown as AssistedSeed;
const athleteSeed = athletesJson as unknown as AthleteSeed;
const preRegistrationSeed = preRegistrationsJson as unknown as PreRegistrationSeed;

function clone<T>(value: T): T { return structuredClone(value); }
function uuidFromCounter(counter: number): string {
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
}

/** Next CONSENT-COMO27-NNNN after the highest reference already on a session. */
function nextConsentCounter(sessions: readonly AssistedRegistrationSession[]): number {
  return sessions.reduce((maximum, session) => {
    const reference = session.consent?.reference;
    const value = reference ? Number(reference.replace('CONSENT-COMO27-', '')) : 0;
    return Number.isFinite(value) ? Math.max(maximum, value) : maximum;
  }, 0);
}

export class MockAssistedRegistrationRepository implements AssistedRegistrationRepository {
  private operator: AssistedOperator = clone(seed.operator);
  private participants: AssistedParticipant[];
  private sessions: AssistedRegistrationSession[] = clone(seed.sessions.items);
  private auditTrail: ProxyAuditEntry[] = clone(seed.auditTrail.items).sort(
    (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
  );
  private readonly consentKeys = new Map<string, AssistedMutationResponse>();
  private readonly actionKeys = new Map<string, AssistedMutationResponse>();
  private entityCounter = 1000;
  private consentCounter = nextConsentCounter(this.sessions);

  // Browser talks to wms_api; vitest stays on the local seed so page tests stay deterministic.
  constructor(private readonly liveApi = import.meta.env.MODE !== 'test') {
    const preRegisteredEmails = new Set(preRegistrationSeed.items.map((record) => record.email.toLowerCase()));
    this.participants = athleteSeed.items.map((athlete) => ({
      ...athlete,
      source: preRegisteredEmails.has(athlete.email.toLowerCase()) ? 'pre_registration' : 'athlete',
    }));
  }

  async getOverview(): Promise<AssistedRegistrationOverview> {
    await this.delay();
    if (this.liveApi) await this.hydrateFromApi();
    return this.overview();
  }

  async recordConsent(input: RecordProxyConsentInput): Promise<AssistedMutationResponse> {
    await this.delay();
    this.requireIdempotencyKey(input.idempotencyKey);
    const replay = this.consentKeys.get(input.idempotencyKey);
    if (replay) return this.confirmLive('/assisted-registration/consents', input, replay, this.consentKeys);
    this.requireOperator(input.operatorId);
    const participant = this.requireParticipant(input.participantId);
    const session = this.requireSession(input.participantId);
    const participantName = `${participant.firstName} ${participant.lastName}`;
    const occurredAt = new Date().toISOString();
    this.consentCounter += 1;
    this.entityCounter += 1;
    const consentReference = `CONSENT-COMO27-${String(this.consentCounter).padStart(4, '0')}`;
    session.consent = {
      id: uuidFromCounter(this.entityCounter),
      reference: consentReference,
      participantId: participant.id,
      participantName,
      method: input.method,
      capturedByOperatorId: this.operator.id,
      capturedByOperatorName: this.operator.name,
      capturedAt: occurredAt,
    };
    session.updatedAt = occurredAt;
    const auditEntry = this.createAuditEntry('consent_recorded', participant.id, participantName, consentReference, occurredAt);
    const response = { session: clone(session), auditEntry: clone(auditEntry) };
    this.consentKeys.set(input.idempotencyKey, clone(response));
    return this.confirmLive('/assisted-registration/consents', input, response, this.consentKeys);
  }

  async performProxyAction(input: PerformProxyActionInput): Promise<AssistedMutationResponse> {
    await this.delay();
    this.requireIdempotencyKey(input.idempotencyKey);
    const replay = this.actionKeys.get(input.idempotencyKey);
    if (replay) return this.confirmLive('/assisted-registration/actions', input, replay, this.actionKeys);
    this.requireOperator(input.operatorId);
    const participant = this.requireParticipant(input.participantId);
    const session = this.requireSession(input.participantId);
    if (!session.consent) throw new Error('Participant consent must be recorded before a proxy action.');
    if (input.action === 'registration_started' && session.registrationStatus !== 'not_started') {
      throw new Error('Registration has already been started.');
    }
    if (input.action === 'registration_submitted' && session.registrationStatus !== 'draft') {
      throw new Error('Only a draft registration can be submitted.');
    }
    const participantName = `${participant.firstName} ${participant.lastName}`;
    const occurredAt = new Date().toISOString();
    session.registrationStatus = input.action === 'registration_started' ? 'draft' : 'submitted';
    session.updatedAt = occurredAt;
    const auditEntry = this.createAuditEntry(input.action, participant.id, participantName, session.consent.reference, occurredAt);
    const response = { session: clone(session), auditEntry: clone(auditEntry) };
    this.actionKeys.set(input.idempotencyKey, clone(response));
    return this.confirmLive('/assisted-registration/actions', input, response, this.actionKeys);
  }

  /**
   * Prefer wms_api as the live assisted desk. Failures (API down) leave the local seed in place.
   */
  private async hydrateFromApi(): Promise<void> {
    try {
      const remote = await backendRequest<AssistedRegistrationOverview>('/v1/assisted-registration');
      this.operator = clone(remote.operator);
      this.participants = clone(remote.participants.items);
      this.sessions = clone(remote.sessions.items);
      this.auditTrail = clone(remote.auditTrail.items);
      this.consentCounter = nextConsentCounter(this.sessions);
    } catch {
      // Local seed still renders if wms_api is unreachable.
    }
  }

  /**
   * After local gating/mutation succeeds, confirm against wms_api. The API session and
   * audit entry win when reachable; a failed write keeps the locally computed result.
   */
  private async confirmLive(
    path: '/assisted-registration/consents' | '/assisted-registration/actions',
    input: RecordProxyConsentInput | PerformProxyActionInput,
    local: AssistedMutationResponse,
    keys: Map<string, AssistedMutationResponse>,
  ): Promise<AssistedMutationResponse> {
    if (!this.liveApi) return clone(local);
    try {
      const remote = await backendRequest<AssistedMutationResponse>(`/v1${path}`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      this.replaceSession(local.session.id, remote.session);
      this.replaceAudit(local.auditEntry.id, remote.auditEntry);
      this.consentCounter = nextConsentCounter(this.sessions);
      keys.set(input.idempotencyKey, clone(remote));
      return clone(remote);
    } catch {
      return clone(local);
    }
  }

  private replaceSession(localId: string, remote: AssistedRegistrationSession): void {
    this.sessions = this.sessions.map((session) => (session.id === localId || session.id === remote.id ? remote : session));
  }

  private replaceAudit(localId: string, remote: ProxyAuditEntry): void {
    const replaced = this.auditTrail.some((entry) => entry.id === localId);
    this.auditTrail = replaced
      ? this.auditTrail.map((entry) => (entry.id === localId ? remote : entry))
      : [remote, ...this.auditTrail];
  }

  private overview(): AssistedRegistrationOverview {
    return clone({
      operator: this.operator,
      participants: { items: this.participants, total: this.participants.length },
      sessions: { items: this.sessions, total: this.sessions.length },
      auditTrail: { items: this.auditTrail, total: this.auditTrail.length },
    });
  }

  private createAuditEntry(action: ProxyAuditEntry['action'], participantId: string, participantName: string, consentReference: string, occurredAt: string): ProxyAuditEntry {
    this.entityCounter += 1;
    const entry = { id: uuidFromCounter(this.entityCounter), action, operatorId: this.operator.id, operatorName: this.operator.name, participantId, participantName, consentReference, occurredAt };
    this.auditTrail.unshift(entry);
    return entry;
  }
  private requireIdempotencyKey(key: string): void { if (!key.trim()) throw new Error('An idempotency key is required.'); }
  private requireOperator(id: string): void { if (id !== this.operator.id) throw new Error('The acting operator was not found.'); }
  private requireParticipant(id: string): AssistedParticipant {
    const participant = this.participants.find((item) => item.id === id);
    if (!participant) throw new Error('The participant was not found.');
    return participant;
  }
  private requireSession(participantId: string): AssistedRegistrationSession {
    const session = this.sessions.find((item) => item.participantId === participantId);
    if (!session) throw new Error('The assisted session was not found.');
    return session;
  }
  private delay(): Promise<void> { return new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS)); }
}
