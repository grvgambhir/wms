import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  AssistedMutationResponse,
  AssistedRegistrationOverview,
  AssistedRegistrationSession,
} from '../domain/assistedRegistration';
import { MockAssistedRegistrationRepository } from './MockAssistedRegistrationRepository';

const OPERATOR_ID = '2c2d4108-bc1d-4f75-9eb8-0d4d485b35c7';
const LUCA_ID = '693edf31-739e-4f28-96c4-202700000003';
const DANIEL_ID = '693edf31-739e-4f28-96c4-202700000001';

const lucaConsented: AssistedRegistrationSession = {
  id: '7dc3437b-2d2b-4ba9-ae2f-fd031f955291',
  participantId: LUCA_ID,
  registrationStatus: 'draft',
  consent: {
    id: '00000000-0000-4000-8000-000000001101',
    reference: 'CONSENT-COMO27-0109',
    participantId: LUCA_ID,
    participantName: 'Luca Bianchi',
    method: 'in_person',
    capturedByOperatorId: OPERATOR_ID,
    capturedByOperatorName: 'Helen Ward',
    capturedAt: '2026-09-04T12:00:00.000Z',
  },
  updatedAt: '2026-09-04T12:01:00.000Z',
};

const remoteOverview: AssistedRegistrationOverview = {
  operator: { id: OPERATOR_ID, name: 'Helen Ward' },
  participants: {
    items: [{
      id: LUCA_ID,
      firstName: 'Luca',
      lastName: 'Bianchi',
      email: 'luca.bianchi@example.com',
      nationalityCountryCode: 'IT',
      source: 'athlete',
    }],
    total: 1,
  },
  sessions: { items: [lucaConsented], total: 1 },
  auditTrail: { items: [], total: 0 },
};

const remoteConsent: AssistedMutationResponse = {
  session: {
    ...lucaConsented,
    registrationStatus: 'not_started',
    updatedAt: '2026-09-04T12:00:00.000Z',
  },
  auditEntry: {
    id: '00000000-0000-4000-8000-000000001102',
    action: 'consent_recorded',
    operatorId: OPERATOR_ID,
    operatorName: 'Helen Ward',
    participantId: LUCA_ID,
    participantName: 'Luca Bianchi',
    consentReference: 'CONSENT-COMO27-0109',
    occurredAt: '2026-09-04T12:00:00.000Z',
  },
};

const remoteStart: AssistedMutationResponse = {
  session: lucaConsented,
  auditEntry: {
    id: '00000000-0000-4000-8000-000000001103',
    action: 'registration_started',
    operatorId: OPERATOR_ID,
    operatorName: 'Helen Ward',
    participantId: LUCA_ID,
    participantName: 'Luca Bianchi',
    consentReference: 'CONSENT-COMO27-0109',
    occurredAt: '2026-09-04T12:01:00.000Z',
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MockAssistedRegistrationRepository live hydrate', () => {
  it('uses the API operator, participants, sessions and audit trail when wms_api is reachable', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/assisted-registration')) return jsonResponse(remoteOverview);
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const overview = await new MockAssistedRegistrationRepository(true).getOverview();
    expect(overview.participants.items).toHaveLength(1);
    expect(overview.sessions.items[0]?.consent?.reference).toBe('CONSENT-COMO27-0109');
    expect(overview.sessions.total).toBe(1);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('falls back to the local seed when wms_api is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    const overview = await new MockAssistedRegistrationRepository(true).getOverview();
    expect(overview.operator.name).toBe('Helen Ward');
    expect(overview.participants.total).toBe(3);
    expect(overview.participants.items.map((item) => `${item.firstName} ${item.lastName}`)).toEqual([
      'Daniel Harper',
      'Marco Rossi',
      'Luca Bianchi',
    ]);
    expect(overview.sessions.items[0]?.participantId).toBe(DANIEL_ID);
    expect(overview.sessions.items.find((session) => session.participantId === LUCA_ID)?.consent).toBeUndefined();
    expect(overview.sessions.total).toBe(overview.sessions.items.length);
    expect(overview.auditTrail.total).toBe(overview.auditTrail.items.length);
  });

  it('skips the network in tests by default so the page flow stays on the seed', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const overview = await new MockAssistedRegistrationRepository().getOverview();
    expect(overview.participants.total).toBe(3);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('MockAssistedRegistrationRepository live mutations', () => {
  it('returns the API session when recordConsent succeeds', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/assisted-registration/consents') && init?.method === 'POST') {
        return jsonResponse(remoteConsent);
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await new MockAssistedRegistrationRepository(true).recordConsent({
      participantId: LUCA_ID,
      operatorId: OPERATOR_ID,
      method: 'in_person',
      idempotencyKey: 'consent-luca-live',
    });
    expect(response.session.consent?.reference).toBe('CONSENT-COMO27-0109');
    expect(response.auditEntry.action).toBe('consent_recorded');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      participantId: LUCA_ID,
      operatorId: OPERATOR_ID,
      method: 'in_person',
      idempotencyKey: 'consent-luca-live',
    });
  });

  it('falls back to the local mutation when the consent write fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    const response = await new MockAssistedRegistrationRepository(true).recordConsent({
      participantId: LUCA_ID,
      operatorId: OPERATOR_ID,
      method: 'phone',
      idempotencyKey: 'consent-luca-offline',
    });
    expect(response.session.consent?.reference).toMatch(/^CONSENT-COMO27-\d{4}$/);
    expect(response.session.consent?.method).toBe('phone');
  });

  it('returns the API session when performProxyAction succeeds', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/assisted-registration/consents') && init?.method === 'POST') {
        return jsonResponse(remoteConsent);
      }
      if (String(input).endsWith('/assisted-registration/actions') && init?.method === 'POST') {
        return jsonResponse(remoteStart);
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const repository = new MockAssistedRegistrationRepository(true);
    await repository.recordConsent({
      participantId: LUCA_ID,
      operatorId: OPERATOR_ID,
      method: 'in_person',
      idempotencyKey: 'consent-then-start',
    });
    const response = await repository.performProxyAction({
      participantId: LUCA_ID,
      operatorId: OPERATOR_ID,
      action: 'registration_started',
      idempotencyKey: 'start-luca-live',
    });
    expect(response.session.registrationStatus).toBe('draft');
    expect(response.auditEntry.action).toBe('registration_started');
    expect(response.auditEntry.id).toBe(remoteStart.auditEntry.id);
    const actionCall = fetchMock.mock.calls.find(([url, init]) => (
      String(url).endsWith('/assisted-registration/actions') && init?.method === 'POST'
    ));
    expect(JSON.parse(String(actionCall?.[1]?.body))).toEqual({
      participantId: LUCA_ID,
      operatorId: OPERATOR_ID,
      action: 'registration_started',
      idempotencyKey: 'start-luca-live',
    });
  });

  it('blocks a proxy action without consent locally before any API call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(new MockAssistedRegistrationRepository(true).performProxyAction({
      participantId: LUCA_ID,
      operatorId: OPERATOR_ID,
      action: 'registration_started',
      idempotencyKey: 'start-blocked',
    })).rejects.toThrow('Participant consent must be recorded before a proxy action.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks an illegal start locally before any API call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(new MockAssistedRegistrationRepository(true).performProxyAction({
      participantId: DANIEL_ID,
      operatorId: OPERATOR_ID,
      action: 'registration_started',
      idempotencyKey: 'start-daniel',
    })).rejects.toThrow('Registration has already been started.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires an idempotency key before any API call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(new MockAssistedRegistrationRepository(true).recordConsent({
      participantId: LUCA_ID,
      operatorId: OPERATOR_ID,
      method: 'phone',
      idempotencyKey: '  ',
    })).rejects.toThrow('An idempotency key is required.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
