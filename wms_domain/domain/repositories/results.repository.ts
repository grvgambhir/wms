import type { MatchResult } from '../models/match';

export interface ResultsRepository {
  getMatch(matchId: string): Promise<MatchResult | null>;
  subscribeToMatch(matchId: string, onUpdate: (result: MatchResult) => void): () => void;
}
