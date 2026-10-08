// Mock rules repository (WS-B) — serves the seeded, versioned rule register from
// fixtures. Swap for an ApiRulesRepository later with no engine/UI change.
// Also holds the latest published rule-change notice in memory so A04 (admin publish)
// and P19 (participant review) share one governed change across the two portals.
import type {
  PublishRuleChangeInput,
  RuleChangeNotice,
  SportRule,
} from '@/domain/models/rule';
import type { RulesRepository } from '@/domain/repositories/rules.repository';
import { RepositoryError } from '@/data/errors/repositoryError';
import { fixtures } from '@/data/mock/fixtures';
import { getJson, setJson } from '@/data/storage/asyncStorage';
import { storageKeys } from '@/data/storage/keys';

export class MockRulesRepository implements RulesRepository {
  // Last change published from A04; read by P19. Persisted to storage so it survives a
  // reload (a published change is real state, not a per-page-load flash) — the mock
  // analogue of a backend record shared across the admin ↔ participant portals.
  private latestNotice: RuleChangeNotice | null = null;
  private hydrated = false;

  private async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.latestNotice = await getJson<RuleChangeNotice>(storageKeys.ruleChangeNotice);
    this.hydrated = true;
  }

  async listRules(): Promise<SportRule[]> {
    return fixtures.sportRules;
  }

  async getRule(id: string): Promise<SportRule | null> {
    return fixtures.sportRules.find((r) => r.id === id) ?? null;
  }

  async getRuleForEvent(sport: string, event?: string): Promise<SportRule | null> {
    const matches = fixtures.sportRules.filter(
      (r) =>
        r.status === 'active' &&
        r.sport.toLowerCase() === sport.toLowerCase() &&
        (event ? r.event?.toLowerCase() === event.toLowerCase() : true),
    );
    // Latest effective rule wins.
    return (
      matches.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0] ?? null
    );
  }

  async publishRuleChange(input: PublishRuleChangeInput): Promise<RuleChangeNotice> {
    const notice: RuleChangeNotice = {
      id: `rule-change-${Date.now().toString(36)}`,
      ...input,
      occurredAt: new Date().toISOString(),
      status: 'published',
    };
    this.latestNotice = notice;
    this.hydrated = true;
    await setJson(storageKeys.ruleChangeNotice, notice);
    return { ...notice };
  }

  async getLatestRuleChange(sport?: string, event?: string): Promise<RuleChangeNotice | null> {
    await this.hydrate();
    const notice = this.latestNotice;
    if (!notice) return null;
    if (sport && notice.sport.toLowerCase() !== sport.toLowerCase()) return null;
    if (event && (notice.event?.toLowerCase() ?? '') !== event.toLowerCase()) return null;
    return { ...notice };
  }

  async acknowledgeRuleChange(noticeId: string): Promise<RuleChangeNotice> {
    await this.hydrate();
    if (!this.latestNotice || this.latestNotice.id !== noticeId) {
      throw new RepositoryError({ code: 'NOT_FOUND', message: 'Rule-change notice was not found.' });
    }
    this.latestNotice = {
      ...this.latestNotice,
      status: 'acknowledged',
      acknowledgedAt: new Date().toISOString(),
    };
    await setJson(storageKeys.ruleChangeNotice, this.latestNotice);
    return { ...this.latestNotice };
  }
}
