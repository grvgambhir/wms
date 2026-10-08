import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CommunicationRecord, CommunicationsOverview, SendBroadcastResponse } from '../domain/communications';
import { MockCommunicationsRepository } from './MockCommunicationsRepository';

const remoteRecord: CommunicationRecord = {
  id: 'bcast-0009',
  subject: 'Live payment reminder',
  audienceId: 'pending-payment',
  channel: 'email',
  recipientCount: 213,
  status: 'sent',
  sentAt: '2026-09-04T12:00:00.000Z',
  templateId: 'tpl-payment-reminder',
};

const remoteOverview: CommunicationsOverview = {
  summary: { sentCount: 1, totalRecipients: 213, templateCount: 4 },
  segments: [{ id: 'pending-payment', recipientCount: 213 }],
  templates: [],
  history: { items: [remoteRecord], total: 1 },
};

const remoteSend: SendBroadcastResponse = {
  record: remoteRecord,
  summary: { sentCount: 4, totalRecipients: 1847, templateCount: 4 },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MockCommunicationsRepository', () => {
  it('replays an idempotency key without appending or changing its immutable record', async () => {
    const repository = new MockCommunicationsRepository();
    const before = await repository.getOverview();
    const first = await repository.sendBroadcast({
      subject: 'Payment reminder',
      audienceId: 'pending-payment',
      channel: 'email',
      idempotencyKey: 'same-send',
    });
    const replay = await repository.sendBroadcast({
      subject: 'This must not replace the first subject',
      audienceId: 'all-participants',
      channel: 'both',
      idempotencyKey: 'same-send',
    });

    expect(replay.record).toEqual(first.record);
    expect(replay.summary.sentCount).toBe(before.summary.sentCount + 1);
    expect((await repository.getOverview()).history.items.filter((item) => item.id === first.record.id)).toHaveLength(1);
  });
});

describe('MockCommunicationsRepository live hydrate', () => {
  it('uses the API segments, templates and history when wms_api is reachable', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/communications')) return jsonResponse(remoteOverview);
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const overview = await new MockCommunicationsRepository(true).getOverview();
    expect(overview.history.items).toEqual([remoteRecord]);
    expect(overview.history.total).toBe(1);
    expect(overview.segments).toEqual([{ id: 'pending-payment', recipientCount: 213 }]);
    expect(overview.summary).toEqual({ sentCount: 1, totalRecipients: 213, templateCount: 0 });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('falls back to the local seed when wms_api is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    const overview = await new MockCommunicationsRepository(true).getOverview();
    expect(overview.history.items[0]?.id).toBe('bcast-0003');
    expect(overview.summary.sentCount).toBe(overview.history.total);
    expect(overview.summary.templateCount).toBe(4);
    expect(overview.history.total).toBe(overview.history.items.length);
  });

  it('skips the network in tests by default so the page flow stays on the seed', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const overview = await new MockCommunicationsRepository().getOverview();
    expect(overview.history.items[0]?.id).toBe('bcast-0003');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('MockCommunicationsRepository live mutations', () => {
  it('returns the API record when send succeeds', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/communications/broadcasts') && init?.method === 'POST') {
        return jsonResponse(remoteSend);
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await new MockCommunicationsRepository(true).sendBroadcast({
      subject: 'Complete your Como Lake 2027 entry payment',
      audienceId: 'pending-payment',
      channel: 'email',
      templateId: 'tpl-payment-reminder',
      idempotencyKey: 'send-live',
    });
    expect(response.record).toEqual(remoteRecord);
    expect(response.summary.sentCount).toBe(4);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      subject: 'Complete your Como Lake 2027 entry payment',
      audienceId: 'pending-payment',
      channel: 'email',
      templateId: 'tpl-payment-reminder',
      idempotencyKey: 'send-live',
    });
  });

  it('falls back to the local mutation when the send write fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    const repository = new MockCommunicationsRepository(true);
    const before = await repository.getOverview();
    const response = await repository.sendBroadcast({
      subject: 'Offline payment reminder',
      audienceId: 'pending-payment',
      channel: 'email',
      idempotencyKey: 'send-offline',
    });
    expect(response.record.id).toMatch(/^bcast-\d{4}$/);
    expect(response.record.subject).toBe('Offline payment reminder');
    expect(response.summary.sentCount).toBe(before.summary.sentCount + 1);
  });

  it('blocks an empty subject locally before any API call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(new MockCommunicationsRepository(true).sendBroadcast({
      subject: '   ',
      audienceId: 'pending-payment',
      channel: 'email',
      idempotencyKey: 'send-blank',
    })).rejects.toThrow('A subject is required to send a broadcast.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks an unknown audience locally before any API call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(new MockCommunicationsRepository(true).sendBroadcast({
      subject: 'Hello',
      audienceId: 'missing-audience' as never,
      channel: 'email',
      idempotencyKey: 'send-missing',
    })).rejects.toThrow('The selected audience was not found.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires an idempotency key before any API call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(new MockCommunicationsRepository(true).sendBroadcast({
      subject: 'Hello',
      audienceId: 'pending-payment',
      channel: 'email',
      idempotencyKey: '  ',
    })).rejects.toThrow('An idempotency key is required.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
