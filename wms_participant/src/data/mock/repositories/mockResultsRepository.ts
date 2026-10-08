import type { MatchResult } from '@/domain/models/match';
import type { ResultsRepository } from '@/domain/repositories/results.repository';
import { fixtures } from '@/data/mock/fixtures';

export class MockResultsRepository implements ResultsRepository {
  async getMatch(matchId: string): Promise<MatchResult | null> {
    const base = fixtures.matches.find((match) => match.id === matchId);
    return base ? { ...base } : null;
  }

  subscribeToMatch(matchId: string, onUpdate: (result: MatchResult) => void): () => void {
    const base = fixtures.matches.find((match) => match.id === matchId);
    if (!base) return () => undefined;

    const sequence = fixtures.matchSequences[matchId] ?? [];
    let step = 0;

    onUpdate({ ...base });

    const interval = setInterval(() => {
      if (step >= sequence.length) {
        clearInterval(interval);
        return;
      }

      const update = sequence[step];
      step += 1;
      onUpdate({
        ...base,
        ...update,
      });
    }, 3500);

    return () => clearInterval(interval);
  }
}
