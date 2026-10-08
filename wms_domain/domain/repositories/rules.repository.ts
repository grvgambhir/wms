// Rules repository contract (WS-B). Rule DATA comes through this seam; the pure
// engine (features/rules/engine.ts) applies it. Designed as a future REST
// surface: listRules -> GET /rules, getRule -> GET /rules/{id},
// getRuleForEvent -> GET /rules?sport=&event= (DELIVERY_PLAN §6.6).
import type {
  PublishRuleChangeInput,
  RuleChangeNotice,
  SportRule,
} from '../models/rule';

export interface RulesRepository {
  listRules(): Promise<SportRule[]>;
  getRule(id: string): Promise<SportRule | null>;
  /** Active rule for a sport (+ optional event), by effective date. */
  getRuleForEvent(sport: string, event?: string): Promise<SportRule | null>;

  /** POST /rules/changes — admin (A04) publishes a rule-register change. */
  publishRuleChange(input: PublishRuleChangeInput): Promise<RuleChangeNotice>;
  /** GET /rules/changes/latest — participant (P19) reads a change affecting their entry. */
  getLatestRuleChange(sport?: string, event?: string): Promise<RuleChangeNotice | null>;
  /** POST /rules/changes/{id}/acknowledge — participant reviews before commit. */
  acknowledgeRuleChange(noticeId: string): Promise<RuleChangeNotice>;
}
