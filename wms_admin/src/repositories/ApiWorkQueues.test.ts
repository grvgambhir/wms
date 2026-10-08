import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiCommunicationsRepository } from './ApiCommunicationsRepository';
import { ApiAssistedRegistrationRepository } from './ApiAssistedRegistrationRepository';
import { ApiExceptionsRepository } from './ApiExceptionsRepository';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('work-queue API repositories talk to wms_backend', () => {
  it('communications GET/POST use :3050', async () => {
    const overview = {
      summary: { sentCount: 0, totalRecipients: 0, templateCount: 1 },
      segments: [{ id: 'tennis', recipientCount: 1 }],
      templates: [],
      history: { items: [], total: 0 },
    };
    const record = {
      id: 'bcast-1',
      subject: 'Hello',
      audienceId: 'tennis',
      channel: 'email' as const,
      recipientCount: 1,
      status: 'sent' as const,
      sentAt: '2026-09-13T00:00:00.000Z',
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/communications') && !init?.method) return jsonResponse(overview);
      if (url.endsWith('/v1/communications/broadcasts')) {
        return jsonResponse({ record, summary: overview.summary });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const repo = new ApiCommunicationsRepository();
    expect((await repo.getOverview()).segments[0]?.id).toBe('tennis');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('http://localhost:3050/v1/communications');
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain(':3040');

    await repo.sendBroadcast({
      subject: 'Hello',
      audienceId: 'tennis',
      channel: 'email',
      idempotencyKey: 'k1',
    });
    const headers = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(headers.get('Idempotency-Key')).toBe('k1');
  });

  it('assisted and exceptions POST with the idempotency key', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/assisted-registration/consents')) {
        return jsonResponse({
          session: { id: 's1', participantId: 'p1', registrationStatus: 'not_started', updatedAt: new Date().toISOString() },
          auditEntry: {
            id: 'a1',
            action: 'consent_recorded',
            operatorId: 'o1',
            operatorName: 'Oc',
            participantId: 'p1',
            participantName: 'P',
            consentReference: 'CONSENT-COMO27-0001',
            occurredAt: new Date().toISOString(),
          },
        });
      }
      if (url.includes('/v1/exceptions/') && url.endsWith('/approve')) {
        return jsonResponse({
          id: 'e1',
          participant: 'Tia',
          sport: 'Tennis',
          event: 'Singles',
          impact: 'high',
          reason: 'waiver',
          approvers: ['Helen Ward'],
          decision: 'pending',
        });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await new ApiAssistedRegistrationRepository().recordConsent({
      participantId: 'p1',
      operatorId: 'o1',
      method: 'phone',
      idempotencyKey: 'consent-1',
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('http://localhost:3050/v1/assisted-registration/consents');

    await new ApiExceptionsRepository().approveException({
      exceptionId: 'e1',
      reviewerId: 'Reviewer A · Sport Admin',
    });
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('http://localhost:3050/v1/exceptions/e1/approve');
    expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain(':3040');
  });
});
