export type MatchResult = "home" | "draw" | "away";

export function projectExchange(
  homeRating: number,
  awayRating: number,
  result: MatchResult,
  options?: { homeAdvantage?: boolean; worldCup?: boolean; margin16?: boolean }
) {
  const homeAdv = options?.homeAdvantage === false ? 0 : 3;
  let diff = homeRating + homeAdv - awayRating;
  diff = Math.max(-10, Math.min(10, diff));
  const expectedHome = 1 / (1 + 10 ** (-diff / 10));
  let k = options?.worldCup ? 3 : 2;
  if (options?.margin16) k *= 1.5;
  const actual = result === "home" ? 1 : result === "draw" ? 0.5 : 0;
  const raw = k * (actual - expectedHome);
  const homeDelta = Math.round(raw * 100) / 100;
  const awayDelta = Math.round(-raw * 100) / 100;
  return { homeDelta, awayDelta, expectedHome };
}

export function applyRankingDeltas<
  T extends { team: string; points: number; rank: number; previousRank: number; previousPoints: number; history: number[] },
>(
  table: T[],
  homeTeam: string,
  awayTeam: string,
  homeDelta: number,
  awayDelta: number
) {
  const next = table.map((row) => {
    if (row.team === homeTeam || row.team === awayTeam) {
      const delta = row.team === homeTeam ? homeDelta : awayDelta;
      return {
        ...row,
        previousPoints: row.points,
        previousRank: row.rank,
        points: Math.round((row.points + delta) * 100) / 100,
        history: [...row.history.slice(-4), Math.round((row.points + delta) * 100) / 100],
      };
    }
    return row;
  });
  next.sort((a, b) => b.points - a.points);
  return next.map((row, index) => ({ ...row, rank: index + 1 }));
}
