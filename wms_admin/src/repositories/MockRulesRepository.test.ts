import { afterEach, describe, expect, it, vi } from 'vitest';

import { MockRulesRepository, overlayPublishedNotice } from './MockRulesRepository';
import type { RuleChangeNotice, SportRule } from '../domain/rule';

const remoteRule: SportRule = {
  id: 'eb754330-18ac-4a72-83f1-202700000001',
  sport: 'Tennis',
  event: "Men's Doubles",
  strategy: 'youngest-member',
  referenceDate: '2027-12-31',
  bands: [
    { id: 'td3034', name: "Men's Doubles 30–34", minAge: 30, maxAge: 34 },
    { id: 'td3539', name: "Men's Doubles 35–39", minAge: 35, maxAge: 39 },
  ],
  version: 'v2.1',
  effectiveDate: '2026-09-01',
  status: 'active',
};

const remoteNotice: RuleChangeNotice = {
  id: 'rule-change-live',
  sport: 'Tennis',
  event: "Men's Doubles",
  fromVersion: 'v2.1',
  toVersion: 'v2.2',
  fromStrategy: 'youngest-member',
  toStrategy: 'crew-average',
  affectedCount: 3,
  totalCount: 5,
  occurredAt: '2026-09-04T12:00:00.000Z',
  status: 'published',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('overlayPublishedNotice', () => {
  it('keeps the register when the notice already matches', () => {
    const matching = { ...remoteRule, version: 'v2.2', strategy: 'crew-average' as const };
    expect(overlayPublishedNotice(matching, remoteNotice)).toBe(matching);
    expect(overlayPublishedNotice(remoteRule, null)).toBe(remoteRule);
  });

  it('applies the persisted notice when GET /rules is still the seed', () => {
    expect(overlayPublishedNotice(remoteRule, remoteNotice)).toMatchObject({
      id: 'eb754330-18ac-4a72-83f1-202700000001',
      version: 'v2.2',
      strategy: 'crew-average',
      effectiveDate: remoteNotice.occurredAt,
    });
  });
});

describe('MockRulesRepository', () => {
  it('publishes a strategy change in memory without a JSON register', async () => {
    const repo = new MockRulesRepository();
    const overview = await repo.getOverview();
    expect(overview.rule.version).toBe('v2.1');
    expect(overview.registrations).toHaveLength(5);
    expect(overview.ruleSetId).toBeTruthy();

    const published = await repo.publishRuleChange({
      sport: 'Tennis',
      event: "Men's Doubles",
      fromVersion: 'v2.1',
      toVersion: 'v2.2',
      fromStrategy: 'youngest-member',
      toStrategy: 'crew-average',
      affectedCount: 3,
      totalCount: 5,
      bands: overview.rule.bands,
      ruleSetId: overview.ruleSetId,
      fromVersionId: overview.versionId,
    });
    expect(published.rule.version).toBe('v2.2');
    expect(published.rule.strategy).toBe('crew-average');
    expect((await repo.getOverview()).latestNotice?.id).toBe(published.notice.id);
  });
});
