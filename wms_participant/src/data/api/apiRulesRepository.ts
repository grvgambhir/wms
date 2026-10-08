/**
 * HTTP client for RulesRepository against wms_backend (:3050).
 * Live eligibility has no JSON fallback — a missing register is null, not a second file.
 */
import { backendRequest, queryString } from '@/data/api/wmsBackend';
import type { PublishRuleChangeInput, RuleChangeNotice, SportRule } from '@/domain/models/rule';
import type { RulesRepository } from '@/domain/repositories/rules.repository';

export class ApiRulesRepository implements RulesRepository {
  async listRules(): Promise<SportRule[]> {
    return backendRequest<SportRule[]>('/v1/rules');
  }

  async getRule(id: string): Promise<SportRule | null> {
    return backendRequest<SportRule | null>(`/v1/rules/${encodeURIComponent(id)}`, { nullOn404: true });
  }

  async getRuleForEvent(sport: string, event?: string): Promise<SportRule | null> {
    const items = await backendRequest<SportRule[]>(`/v1/rules${queryString({ sport, event })}`);
    return items[0] ?? null;
  }

  async publishRuleChange(input: PublishRuleChangeInput): Promise<RuleChangeNotice> {
    return backendRequest<RuleChangeNotice>('/v1/rules/changes', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async getLatestRuleChange(sport?: string, event?: string): Promise<RuleChangeNotice | null> {
    return backendRequest<RuleChangeNotice | null>(
      `/v1/rules/changes/latest${queryString({ sport, event })}`,
      { nullOn404: true },
    );
  }

  async acknowledgeRuleChange(noticeId: string): Promise<RuleChangeNotice> {
    return backendRequest<RuleChangeNotice>(`/v1/rules/changes/${encodeURIComponent(noticeId)}/acknowledge`, {
      method: 'POST',
    });
  }
}
