import { backendRequest } from '../auth/backendRequest';
import type {
  AdminPublishRuleChangeInput,
  PublishRuleChangeResponse,
  RulesOverview,
} from '../domain/rule';
import type { RulesRepository } from './RulesRepository';

function strategyToAggregation(
  strategy: AdminPublishRuleChangeInput['toStrategy'],
): 'self' | 'min' | 'mean' | 'sum' {
  if (strategy === 'youngest-member') return 'min';
  if (strategy === 'crew-average') return 'mean';
  if (strategy === 'relay-aggregate') return 'sum';
  return 'self';
}

export class ApiRulesRepository implements RulesRepository {
  async getOverview(): Promise<RulesOverview> {
    return backendRequest<RulesOverview>(
      `/v1/admin/rules/overview?sport=${encodeURIComponent('Tennis')}&event=${encodeURIComponent("Men's Doubles")}`,
    );
  }

  async publishRuleChange(input: AdminPublishRuleChangeInput): Promise<PublishRuleChangeResponse> {
    const draft = await backendRequest<{ versionId: string }>(
      `/v1/admin/rule-sets/${encodeURIComponent(input.ruleSetId)}/versions`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': `${input.fromVersionId}:${input.toVersion}:draft` },
        body: JSON.stringify({
          fromVersionId: input.fromVersionId,
          aggregation: strategyToAggregation(input.toStrategy),
          versionLabel: input.toVersion,
          bands: input.bands.map((band) => ({
            id: band.id,
            name: band.name,
            min: band.minAge,
            max: band.maxAge,
          })),
        }),
      },
    );
    await backendRequest(`/v1/admin/rule-versions/${encodeURIComponent(draft.versionId)}/impact-analysis`, {
      method: 'POST',
      headers: { 'Idempotency-Key': `${input.fromVersionId}:${input.toVersion}:impact` },
      body: JSON.stringify({}),
    });
    return backendRequest<PublishRuleChangeResponse>(
      `/v1/admin/rule-versions/${encodeURIComponent(draft.versionId)}/publish`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': `${input.fromVersionId}:${input.toVersion}:publish` },
        body: JSON.stringify({}),
      },
    );
  }
}
