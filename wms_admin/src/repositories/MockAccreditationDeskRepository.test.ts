import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AccreditationOverview, AccreditationRecord, CredentialActionResponse } from '../domain/accreditationDesk';
import { MockAccreditationDeskRepository } from './MockAccreditationDeskRepository';

const DANIEL_ID = 'acc-0001-4a10-9c01-202700000401';
const LUCAS_ID = 'acc-0003-4a10-9c03-202700000403';

const issuedDaniel: AccreditationRecord = {
  id: DANIEL_ID,
  participantName: 'Daniel Harper',
  nationalityCountryCode: 'GB',
  sportName: 'Tennis',
  role: 'Athlete',
  photoStatus: 'approved',
  eligibilityStatus: 'approved',
  status: 'issued',
  accessZones: ['field-of-play', 'athlete-lounge'],
  badgeNumber: 'COMO27-000501',
  validFrom: '2027-09-17',
  validUntil: '2027-09-26',
  issuedAt: '2026-09-04T12:00:00.000Z',
  updatedAt: '2026-09-04T12:00:00.000Z',
};

const remoteOverview: AccreditationOverview = {
  summary: { pendingCount: 3, issuedCount: 3, revokedCount: 1 },
  records: { items: [issuedDaniel], total: 1 },
};

const remoteIssue: CredentialActionResponse = {
  record: issuedDaniel,
  summary: { pendingCount: 3, issuedCount: 3, revokedCount: 1 },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MockAccreditationDeskRepository live hydrate', () => {
  it('uses the API records and summary when wms_api is reachable', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/accreditation-desk')) return jsonResponse(remoteOverview);
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const overview = await new MockAccreditationDeskRepository(true).getOverview();
    expect(overview.records.items).toEqual([issuedDaniel]);
    expect(overview.records.total).toBe(1);
    expect(overview.summary).toEqual({ pendingCount: 0, issuedCount: 1, revokedCount: 0 });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('falls back to the local seed when wms_api is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    const overview = await new MockAccreditationDeskRepository(true).getOverview();
    const daniel = overview.records.items.find((record) => record.id === DANIEL_ID);
    expect(overview.records.items[0].id).toBe(DANIEL_ID);
    expect(daniel?.status).toBe('pending_review');
    expect(daniel?.participantName).toBe('Daniel Harper');
    expect(overview.records.total).toBe(overview.records.items.length);
    expect(overview.summary.pendingCount + overview.summary.issuedCount + overview.summary.revokedCount)
      .toBe(overview.records.total);
  });

  it('skips the network in tests by default so the page flow stays on the seed', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const overview = await new MockAccreditationDeskRepository().getOverview();
    expect(overview.records.items.find((record) => record.id === DANIEL_ID)?.status).toBe('pending_review');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('MockAccreditationDeskRepository live mutations', () => {
  it('returns the API credential when issue succeeds', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes(`/accreditation-desk/${DANIEL_ID}/issue`) && init?.method === 'POST') {
        return jsonResponse(remoteIssue);
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await new MockAccreditationDeskRepository(true).issueCredential({
      recordId: DANIEL_ID,
      idempotencyKey: 'issue-daniel-live',
    });
    expect(response.record.badgeNumber).toBe('COMO27-000501');
    expect(response.record.status).toBe('issued');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      idempotencyKey: 'issue-daniel-live',
    });
  });

  it('falls back to the local mutation when the issue write fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    const repository = new MockAccreditationDeskRepository(true);
    const before = await repository.getOverview();
    const response = await repository.issueCredential({
      recordId: DANIEL_ID,
      idempotencyKey: 'issue-daniel-offline',
    });
    expect(response.record.status).toBe('issued');
    expect(response.record.badgeNumber).toMatch(/^COMO27-\d{6}$/);
    expect(response.summary.issuedCount).toBe(before.summary.issuedCount + 1);
    expect(response.summary.pendingCount).toBe(before.summary.pendingCount - 1);
  });

  it('blocks ineligible issue locally before any API call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(new MockAccreditationDeskRepository(true).issueCredential({
      recordId: LUCAS_ID,
      idempotencyKey: 'issue-lucas',
    })).rejects.toThrow('Photo and eligibility must both be approved before a credential can be issued.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires an idempotency key before any API call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(new MockAccreditationDeskRepository(true).issueCredential({
      recordId: DANIEL_ID,
      idempotencyKey: '  ',
    })).rejects.toThrow('An idempotency key is required.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('adopts live records so later mutations follow API state after a reload-shaped hydrate', async () => {
    const reissued = { ...issuedDaniel, badgeNumber: 'COMO27-000502', updatedAt: '2026-09-04T12:05:00.000Z' };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/accreditation-desk') && init?.method !== 'POST') return jsonResponse(remoteOverview);
      if (url.includes(`/accreditation-desk/${DANIEL_ID}/reissue`) && init?.method === 'POST') {
        return jsonResponse({
          record: reissued,
          summary: { pendingCount: 3, issuedCount: 3, revokedCount: 1 },
        });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const repository = new MockAccreditationDeskRepository(true);
    await repository.getOverview();
    const response = await repository.reissueCredential({
      recordId: DANIEL_ID,
      idempotencyKey: 'reissue-daniel-live',
    });
    expect(response.record.badgeNumber).toBe('COMO27-000502');
  });
});
