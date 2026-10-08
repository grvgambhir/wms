import registrationsJson from '../data/rule-impact-registrations.json';
import type {
  AdminPublishRuleChangeInput,
  PublishRuleChangeResponse,
  RuleChangeNotice,
  RuleImpactRegistration,
  RulesOverview,
  SportRule,
} from '../domain/rule';
import type { RulesRepository } from './RulesRepository';

const REQUEST_DELAY_MS = 120;
const RULE_SET_ID = 'rule-set-tennis-doubles';

const TENNIS_DOUBLES: SportRule = {
  id: 'eb754330-18ac-4a72-83f1-202700000001',
  sport: 'Tennis',
  event: "Men's Doubles",
  strategy: 'youngest-member',
  referenceDate: '2027-12-31',
  version: 'v2.1',
  effectiveDate: '2026-09-01T00:00:00.000Z',
  status: 'active',
  bands: [
    { id: 'eb754330-18ac-4a72-83f1-202700000011', name: "Men's Doubles 30–34", minAge: 30, maxAge: 34 },
    { id: 'eb754330-18ac-4a72-83f1-202700000012', name: "Men's Doubles 35–39", minAge: 35, maxAge: 39 },
    { id: 'eb754330-18ac-4a72-83f1-202700000013', name: "Men's Doubles 40–44", minAge: 40, maxAge: 44 },
    { id: 'eb754330-18ac-4a72-83f1-202700000014', name: "Men's Doubles 45+", minAge: 45, maxAge: null },
  ],
};

const registrationsSeed = registrationsJson as unknown as { items: RuleImpactRegistration[] };
function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MockRulesRepository implements RulesRepository {
  private rule = clone(TENNIS_DOUBLES);
  private readonly registrations = clone(registrationsSeed.items);
  private latestNotice: RuleChangeNotice | null = null;
  private noticeCounter = 0;

  async getOverview(): Promise<RulesOverview> {
    await this.delay();
    return clone({
      rule: this.rule,
      ruleSetId: RULE_SET_ID,
      versionId: this.rule.id,
      registrations: this.registrations,
      latestNotice: this.latestNotice,
    });
  }

  async publishRuleChange(input: AdminPublishRuleChangeInput): Promise<PublishRuleChangeResponse> {
    await this.delay();
    if (this.rule.version !== input.fromVersion || this.rule.strategy !== input.fromStrategy) {
      throw new Error('The published rule changed while this draft was open.');
    }
    if (input.fromStrategy === input.toStrategy && bandsEqual(this.rule.bands, input.bands)) {
      throw new Error('Publishing requires a real rule change.');
    }
    if (input.toVersion !== bumpVersion(this.rule.version)) throw new Error('The next rule version is invalid.');

    const rule: SportRule = {
      ...this.rule,
      strategy: input.toStrategy,
      bands: clone(input.bands),
      version: input.toVersion,
      effectiveDate: new Date().toISOString(),
    };
    this.rule = rule;
    this.noticeCounter += 1;
    const notice: RuleChangeNotice = {
      id: `rule-change-${String(this.noticeCounter).padStart(4, '0')}`,
      sport: input.sport,
      event: input.event,
      fromVersion: input.fromVersion,
      toVersion: input.toVersion,
      fromStrategy: input.fromStrategy,
      toStrategy: input.toStrategy,
      affectedCount: input.affectedCount,
      totalCount: input.totalCount,
      occurredAt: new Date().toISOString(),
      status: 'published',
    };
    this.latestNotice = notice;
    return clone({ rule, notice });
  }

  private delay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
  }
}

function bumpVersion(version: string): string {
  const match = version.match(/^v(\d+)\.(\d+)$/);
  return match ? `v${match[1]}.${Number(match[2]) + 1}` : `${version}.1`;
}

function bandsEqual(left: SportRule['bands'], right: SportRule['bands']): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function overlayPublishedNotice(rule: SportRule, notice: RuleChangeNotice | null): SportRule {
  if (!notice) return rule;
  if (notice.toVersion === rule.version && notice.toStrategy === rule.strategy) return rule;
  return { ...rule, version: notice.toVersion, strategy: notice.toStrategy, effectiveDate: notice.occurredAt };
}
