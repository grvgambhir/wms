import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiAccreditationDeskRepository } from './ApiAccreditationDeskRepository';

const record = {
  id: 'acc-1',
  participantName: 'Dana Athlete',
  nationalityCountryCode: 'GB',
  sportName: 'Tennis',
  role: 'Athlete',
  photoStatus: 'approved' as const,
  eligibilityStatus: 'approved' as const,
  status: 'issued' as const,
  accessZones: ['field-of-play'] as const,
  badgeNumber: 'COMO27-000001',
  validFrom: '2027-09-17',
  validUntil: '2027-09-26',
  updatedAt: '2026-09-10T12:00:00.000Z',
};

const overview = {
  summary: { pendingCount: 0, issuedCount: 1, revokedCount: 0 },
  records: { items: [record], total: 1 },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ApiAccreditationDeskRepository', () => {
  it('GETs the desk queue from wms_backend, not wms_api', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/v1/accreditation-desk')) return jsonResponse(overview);
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const got = await new ApiAccreditationDeskRepository().getOverview();
    expect(got.records.items[0]?.badgeNumber).toBe('COMO27-000001');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('http://localhost:3050/v1/accreditation-desk');
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain(':3040');
  });

  it('POSTs issue with the idempotency key', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/v1/accreditations/acc-1/issue') && init?.method === 'POST') {
        return jsonResponse({ record, summary: overview.summary });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const got = await new ApiAccreditationDeskRepository().issueCredential({
      recordId: 'acc-1',
      idempotencyKey: 'issue-1',
    });
    expect(got.record.badgeNumber).toBe('COMO27-000001');
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get('Idempotency-Key')).toBe('issue-1');
  });
});
