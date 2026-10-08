import type {
  AdminPublishRuleChangeInput,
  PublishRuleChangeResponse,
  RulesOverview,
} from '../domain/rule';

export interface RulesRepository {
  getOverview(): Promise<RulesOverview>;
  publishRuleChange(input: AdminPublishRuleChangeInput): Promise<PublishRuleChangeResponse>;
}
