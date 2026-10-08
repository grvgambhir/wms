/// <reference types="jest" />
import { RepositoryError } from '@/data/errors/repositoryError';
import { ApiRegistrationJourneyRepository } from '@/data/api/apiRegistrationJourneyRepository';
import { ApiRulesRepository } from '@/data/api/apiRulesRepository';
import { ApiConsentRepository } from '@/data/api/apiConsentRepository';
import { ApiEvidenceRepository } from '@/data/api/apiEvidenceRepository';
import { ApiPreRegistrationRepository } from '@/data/api/apiPreRegistrationRepository';
import { ApiRestrictedEvidenceRepository } from '@/data/api/apiRestrictedEvidenceRepository';
import { ApiTeamRosterRepository } from '@/data/api/apiTeamRosterRepository';
import { ApiPartnerRepository } from '@/data/api/apiPartnerRepository';
import { ApiAccreditationRepository } from '@/data/api/apiAccreditationRepository';
import { ApiParticipantInboxRepository } from '@/data/api/apiParticipantInboxRepository';
import { backendRequest } from '@/data/api/wmsBackend';

const ENTRY_ID = '74bd5dc5-37cb-49be-8ef6-202700000001';

afterEach(() => {
  jest.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('backendRequest', () => {
  it('maps a non-2xx RFC 9457 body onto RepositoryError { code, message, fields }', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        { code: 'PARTNER_REQUIRED', detail: 'A partner is required.', errors: { partnerAthleteId: 'Choose a partner.' } },
        400,
      ),
    );

    await expect(backendRequest('/v1/registration-entries/x')).rejects.toMatchObject({
      name: 'RepositoryError',
      code: 'PARTNER_REQUIRED',
      message: 'A partner is required.',
      fields: { partnerAthleteId: 'Choose a partner.' },
    });
    await expect(backendRequest('/v1/registration-entries/x')).rejects.toBeInstanceOf(RepositoryError);
  });
});

describe('ApiRegistrationJourneyRepository', () => {
  // The athlete comes from the token. Sending an athlete id made the request look like it could
  // choose whose journey to read, so it is no longer sent even when a caller passes one.
  it('GETs a journey with eventId only — never an athleteId', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ entry: { id: ENTRY_ID } }));
    const repo = new ApiRegistrationJourneyRepository();
    await repo.getJourney({
      registrationEntryId: ENTRY_ID,
      eventId: 'event-1',
      athleteId: 'athlete-1',
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `http://localhost:3050/v1/registration-journeys/${ENTRY_ID}?eventId=event-1`,
    );
  });

  it('maps GET entry 404 to null and POSTs withdraw to /status/withdraw', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(`/v1/registration-entries/${ENTRY_ID}`) && !init?.method) {
        return jsonResponse({ code: 'NOT_FOUND', detail: 'missing' }, 404);
      }
      if (url.endsWith(`/v1/registration-entries/${ENTRY_ID}/status/withdraw`) && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { toStatus: string; actor: string };
        expect(body.toStatus).toBe('withdrawn');
        expect(body.actor).toBe('participant');
        return jsonResponse({ id: ENTRY_ID, status: 'withdrawn' });
      }
      return jsonResponse({ code: 'NOT_FOUND', message: 'unexpected' }, 404);
    });

    const repo = new ApiRegistrationJourneyRepository();
    expect(await repo.getEntry(ENTRY_ID)).toBeNull();
    const updated = await repo.transitionEntryStatus({
      registrationEntryId: ENTRY_ID,
      toStatus: 'withdrawn',
      actor: 'participant',
      idempotencyKey: 'withdraw-1',
    });
    expect(updated.status).toBe('withdrawn');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('hydrates live finance slices from GET /live/* envelopes', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/live/orders')) return jsonResponse({ items: [{ id: 'order-1' }], total: 1 });
      if (url.endsWith('/v1/live/payments')) return jsonResponse({ items: [{ id: 'pay-1' }], total: 1 });
      if (url.endsWith('/v1/live/entries')) return jsonResponse({ items: [{ id: ENTRY_ID }], total: 1 });
      return jsonResponse({ code: 'NOT_FOUND', message: url }, 404);
    });

    const repo = new ApiRegistrationJourneyRepository();
    await repo.ensureHydrated();
    expect(repo.listLiveOrders()).toEqual([{ id: 'order-1' }]);
    expect(repo.listLivePayments()).toEqual([{ id: 'pay-1' }]);
    expect(repo.listLiveEntries()).toEqual([{ id: ENTRY_ID }]);
  });
});

describe('ApiRulesRepository', () => {
  it('reads the live register from wms_backend and POSTs a rule-change notice', async () => {
    const tennis = { id: 'rule-1', sport: 'Tennis', event: "Men's Doubles" };
    const notice = { id: 'rule-change-1', status: 'published' };
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/v1/rules?sport=Tennis') && (!init?.method || init.method === 'GET')) {
        return jsonResponse([tennis]);
      }
      if (url.endsWith('/v1/rules/changes') && init?.method === 'POST') return jsonResponse(notice);
      if (url.includes('/v1/rules/changes/latest')) return jsonResponse(notice);
      return jsonResponse({ code: 'NOT_FOUND', message: url }, 404);
    });

    const repo = new ApiRulesRepository();
    expect(await repo.getRuleForEvent('Tennis', "Men's Doubles")).toMatchObject({ id: 'rule-1' });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('http://localhost:3050/v1/rules?sport=Tennis');
    expect(
      await repo.publishRuleChange({
        sport: 'Tennis',
        fromVersion: 'v2.1',
        toVersion: 'v2.2',
        fromStrategy: 'youngest-member',
        toStrategy: 'crew-average',
        affectedCount: 3,
        totalCount: 5,
      }),
    ).toMatchObject({ id: 'rule-change-1' });
    expect(await repo.getLatestRuleChange('Tennis')).toMatchObject({ id: 'rule-change-1' });
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain('http://localhost:3050/v1/rules/changes/latest?sport=Tennis');
  });
});

describe('ApiConsentRepository', () => {
  it('GETs /v1/me/consents and POSTs grant with kind from the record id', async () => {
    const items = [
      {
        id: 'terms_and_conditions',
        participantId: 'person-1',
        kind: 'terms_and_conditions',
        required: true,
        sensitive: false,
        status: 'withdrawn',
        policyVersion: 'T&C v1.2',
        updatedAt: '1970-01-01T00:00:00.000Z',
      },
    ];
    const granted = { ...items[0], status: 'granted', grantedAt: '2026-09-10T08:00:00.000Z' };
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/v1/me/consents') && (!init?.method || init.method === 'GET')) {
        return jsonResponse({ items, total: 1 });
      }
      if (url.endsWith('/v1/me/consents') && init?.method === 'POST') {
        return jsonResponse(granted);
      }
      return jsonResponse({ code: 'NOT_FOUND', message: url }, 404);
    });

    const fallback = {
      getConsents: jest.fn(),
      grantConsent: jest.fn(),
      withdrawConsent: jest.fn(),
    };
    const repo = new ApiConsentRepository(fallback);
    const list = await repo.getConsents('person-1');
    expect(list.items[0]?.kind).toBe('terms_and_conditions');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://localhost:3050/v1/me/consents');

    await repo.grantConsent({ consentId: 'terms_and_conditions', idempotencyKey: 'k1' });
    const posted = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(posted).toEqual({
      kind: 'terms_and_conditions',
      granted: true,
      version: 'T&C v1.2',
    });
    expect(fallback.getConsents).not.toHaveBeenCalled();
  });
});

describe('ApiPreRegistrationRepository', () => {
  it('GETs a masked lookup and POSTs claim with the idempotency key', async () => {
    const preview = {
      id: '11111111-1111-4111-8111-111111111111',
      reference: 'COMO27-EOI-0001',
      maskedName: 'D••• H•••',
      maskedEmail: 'd••••@example.com',
      birthYear: 1985,
      nationalityCountryCode: 'GB',
      intendedSports: ['Tennis'],
      status: 'unclaimed',
    };
    const record = {
      id: preview.id,
      reference: preview.reference,
      firstName: 'Daniel',
      lastName: 'Harper',
      email: 'daniel.harper@example.com',
      dateOfBirth: '1985-03-14',
      nationalityCountryCode: 'GB',
      intendedSports: ['Tennis'],
      sourceList: 'Legacy EOI 2025',
      status: 'claimed',
      migratedAt: '2026-06-30T09:00:00.000Z',
      claimedAt: '2026-09-10T08:00:00.000Z',
    };
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/v1/me/pre-registrations?query=') && (!init?.method || init.method === 'GET')) {
        return jsonResponse({ outcome: 'found', preview });
      }
      if (url.endsWith(`/v1/me/pre-registrations/${preview.id}/claim`) && init?.method === 'POST') {
        return jsonResponse({ record, alreadyClaimed: false });
      }
      return jsonResponse({ code: 'NOT_FOUND', message: url }, 404);
    });

    const fallback = {
      lookup: jest.fn(),
      claim: jest.fn(),
    };
    const repo = new ApiPreRegistrationRepository(fallback);
    const found = await repo.lookup({ query: 'COMO27-EOI-0001' });
    expect(found.outcome).toBe('found');
    if (found.outcome === 'found') {
      expect(found.preview.maskedName).toBe('D••• H•••');
      expect(JSON.stringify(found.preview)).not.toContain('Daniel Harper');
    }
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'http://localhost:3050/v1/me/pre-registrations?query=COMO27-EOI-0001',
    );

    const claimed = await repo.claim({ recordId: preview.id, idempotencyKey: 'claim-1' });
    expect(claimed.alreadyClaimed).toBe(false);
    expect(claimed.record.firstName).toBe('Daniel');
    const claimHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(claimHeaders.get('Idempotency-Key')).toBe('claim-1');
    expect(fallback.lookup).not.toHaveBeenCalled();
    expect(fallback.claim).not.toHaveBeenCalled();
  });
});

describe('ApiEvidenceRepository', () => {
  it('GETs ordinary evidence for the entry and POSTs an upload with the idempotency key', async () => {
    const item = { id: 'ev-1', type: 'identity_document', status: 'required' };
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes(`/v1/registration-entries/${ENTRY_ID}/evidence`) && (!init?.method || init.method === 'GET')) {
        return jsonResponse({ items: [item], total: 1 });
      }
      if (url.endsWith('/v1/evidence/ev-1/uploads') && init?.method === 'POST') {
        return jsonResponse({ item: { ...item, status: 'uploaded' }, entryEvidenceStatus: 'pending_review' });
      }
      return jsonResponse({ code: 'NOT_FOUND', message: url }, 404);
    });

    const fallback = { list: jest.fn(), upload: jest.fn(), startReview: jest.fn(), decide: jest.fn() };
    const repo = new ApiEvidenceRepository(fallback);
    const list = await repo.list({ registrationEntryId: ENTRY_ID, sportEntryProductId: 'product-1' });
    expect(list.total).toBe(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `http://localhost:3050/v1/registration-entries/${ENTRY_ID}/evidence?sportEntryProductId=product-1`,
    );

    await repo.upload({
      evidenceId: 'ev-1',
      fileName: 'passport.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 12,
      idempotencyKey: 'up-1',
    });
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('Idempotency-Key')).toBe('up-1');
    expect(fallback.list).not.toHaveBeenCalled();
  });
});

describe('ApiRestrictedEvidenceRepository', () => {
  it('GETs restricted evidence with the entry query and never calls the ordinary route', async () => {
    const item = { id: 'rv-1', type: 'para_classification', status: 'required', accessClassification: 'restricted' };
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/v1/restricted-evidence?')) return jsonResponse({ items: [item], total: 1 });
      return jsonResponse({ code: 'NOT_FOUND', message: url }, 404);
    });

    const fallback = { list: jest.fn(), upload: jest.fn(), startReview: jest.fn(), decide: jest.fn() };
    const repo = new ApiRestrictedEvidenceRepository(fallback);
    const list = await repo.list({ registrationEntryId: ENTRY_ID, sportEntryProductId: 'product-1' });
    expect(list.items[0]?.accessClassification).toBe('restricted');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/restricted-evidence?');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`registrationEntryId=${ENTRY_ID}`);
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('/evidence?');
    expect(fallback.list).not.toHaveBeenCalled();
  });
});

describe('ApiTeamRosterRepository', () => {
  it('GETs the caller\'s roster from wms_backend', async () => {
    const roster = { id: 'team-1', name: 'Lario Masters', members: [] };
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(roster));
    const fallback = {
      getTeamRoster: jest.fn(),
      createTeam: jest.fn(),
      invite: jest.fn(),
      cancelInvitation: jest.fn(),
      respondToInvitation: jest.fn(),
      proposeRosterChange: jest.fn(),
    };
    const repo = new ApiTeamRosterRepository(fallback);
    const got = await repo.getTeamRoster({
      registrationEntryId: ENTRY_ID,
      sportEntryProductId: 'product-1',
    });
    expect(got.id).toBe('team-1');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `http://localhost:3050/v1/registration-entries/${ENTRY_ID}/rosters/product-1`,
    );
    expect(fallback.getTeamRoster).not.toHaveBeenCalled();
  });
});

describe('ApiPartnerRepository', () => {
  it('POSTs partner requests with a fresh idempotency key per invite and lists by event', async () => {
    const request = { id: 'pr-1', status: 'pending', eventId: 'event-1', toAthleteId: 'a-2' };
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/v1/partner-requests') && init?.method === 'POST') return jsonResponse(request);
      if (url.includes('/v1/partner-requests?eventId=') && (!init?.method || init.method === 'GET')) {
        return jsonResponse([request]);
      }
      return jsonResponse({ code: 'NOT_FOUND', message: url }, 404);
    });

    const fallback = {
      searchPartners: jest.fn(),
      sendPartnerRequest: jest.fn(),
      respondToPartnerRequest: jest.fn(),
      listRequests: jest.fn(),
      cancelPendingOutgoing: jest.fn(),
      listIncomingInvitations: jest.fn(),
    };
    const repo = new ApiPartnerRepository(fallback);
    const sent = await repo.sendPartnerRequest({
      eventId: 'event-1',
      categoryId: 'cat-b',
      fromAthleteId: 'a-1',
      toAthleteId: 'a-2',
      entryId: ENTRY_ID,
    });
    await repo.sendPartnerRequest({
      eventId: 'event-1',
      categoryId: 'cat-b',
      fromAthleteId: 'a-1',
      toAthleteId: 'a-3',
      entryId: ENTRY_ID,
    });
    expect(sent.id).toBe('pr-1');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://localhost:3050/v1/partner-requests');
    const firstKey = new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Idempotency-Key');
    const secondKey = new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('Idempotency-Key');
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBeTruthy();
    expect(secondKey).not.toBe(firstKey);

    const listed = await repo.listRequests('event-1', 'a-1');
    expect(listed).toHaveLength(1);
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe(
      'http://localhost:3050/v1/partner-requests?eventId=event-1',
    );
    expect(fallback.sendPartnerRequest).not.toHaveBeenCalled();
  });
});

describe('ApiAccreditationRepository', () => {
  it('GETs the caller\'s pass from wms_backend, not wms_api', async () => {
    const pass = {
      id: 'acc-1',
      athleteId: 'person-1',
      participantName: 'Dana Athlete',
      status: 'issued',
      badgeNumber: 'COMO27-000001',
    };
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(pass));
    const fallback = {
      getPassForAthlete: jest.fn(),
      getAccreditation: jest.fn(),
      issueAccreditation: jest.fn(),
    };
    const repo = new ApiAccreditationRepository(fallback);
    const got = await repo.getPassForAthlete('person-1');
    expect(got?.badgeNumber).toBe('COMO27-000001');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://localhost:3050/v1/me/accreditation');
    expect(fallback.getPassForAthlete).not.toHaveBeenCalled();
  });
});

describe('ApiParticipantInboxRepository', () => {
  it('GETs /v1/me/inbox from wms_backend and never takes the athlete id in the path', async () => {
    const item = { id: 'msg-1', subject: 'Tennis notice', audienceId: 'tennis' };
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ items: [item], total: 1 }),
    );
    const repo = new ApiParticipantInboxRepository();
    const got = await repo.listInbox('someone-else');
    expect(got.items[0]?.id).toBe('msg-1');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://localhost:3050/v1/me/inbox');
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('someone-else');
  });
});
