import type {
  Match,
  MatchScoreEvent,
  MatchTeamStats,
  Pool,
  PoolStanding,
  ScoreEventKind,
} from "./types";

export const SCORE_POINTS: Record<ScoreEventKind, number> = {
  try: 5,
  conversion: 2,
  penalty: 3,
  "drop-goal": 3,
  "penalty-try": 7,
};

export const SCORE_LABELS: Record<ScoreEventKind, string> = {
  try: "Try",
  conversion: "Conversion",
  penalty: "Penalty",
  "drop-goal": "Drop goal",
  "penalty-try": "Penalty try",
};

export function emptyTeamStats(): MatchTeamStats {
  return {
    possession: 50,
    territory: 50,
    metres: 0,
    carries: 0,
    tackles: 0,
    missedTackles: 0,
    scrumsWon: 0,
    scrumsTotal: 0,
    lineoutsWon: 0,
    lineoutsTotal: 0,
    turnovers: 0,
    penaltiesConceded: 0,
    yellowCards: 0,
    redCards: 0,
  };
}

export function scoresFromEvents(events: MatchScoreEvent[]) {
  return events.reduce(
    (acc, event) => {
      if (event.team === "home") acc.home += event.points;
      else acc.away += event.points;
      return acc;
    },
    { home: 0, away: 0 }
  );
}

export function triesFromEvents(events: MatchScoreEvent[], side: "home" | "away") {
  return events.filter((event) => event.team === side && (event.kind === "try" || event.kind === "penalty-try"))
    .length;
}

export function scoringTally(events: MatchScoreEvent[], side: "home" | "away") {
  const of = events.filter((event) => event.team === side);
  return {
    tries: of.filter((event) => event.kind === "try" || event.kind === "penalty-try").length,
    conversions: of.filter((event) => event.kind === "conversion").length,
    penalties: of.filter((event) => event.kind === "penalty").length,
    dropGoals: of.filter((event) => event.kind === "drop-goal").length,
  };
}

export function halfTimeScore(events: MatchScoreEvent[], breakMinute = 40) {
  return scoresFromEvents(events.filter((event) => event.minute <= breakMinute));
}

export function matchWinner(match: Match) {
  if (match.homeScore == null || match.awayScore == null) return null;
  if (match.homeScore === match.awayScore) return "draw" as const;
  return match.homeScore > match.awayScore ? ("home" as const) : ("away" as const);
}

export function winnerLabel(match: Match) {
  const result = matchWinner(match);
  if (!result) return "No score yet";
  if (result === "draw") return "Draw";
  return result === "home" ? `${match.homeTeam} win` : `${match.awayTeam} win`;
}

export function playerScoringStats(
  player: { id: string; name: string; teamId: string },
  matches: Match[]
) {
  const teamMatches = matches.filter(
    (match) => match.homeTeamId === player.teamId || match.awayTeamId === player.teamId
  );
  const appearances = teamMatches.filter((match) => match.status === "live" || match.status === "final").length;
  const plays = teamMatches.flatMap((match) =>
    (match.events ?? [])
      .filter((event) => event.playerId === player.id || event.playerName === player.name)
      .map((event) => ({
        matchId: match.id,
        label: `${match.homeTeam} v ${match.awayTeam}`,
        round: match.round,
        minute: event.minute,
        kind: event.kind,
        points: event.points,
      }))
  );
  plays.sort((a, b) => a.minute - b.minute);
  return {
    appearances,
    tries: plays.filter((play) => play.kind === "try" || play.kind === "penalty-try").length,
    conversions: plays.filter((play) => play.kind === "conversion").length,
    penalties: plays.filter((play) => play.kind === "penalty").length,
    dropGoals: plays.filter((play) => play.kind === "drop-goal").length,
    points: plays.reduce((sum, play) => sum + play.points, 0),
    plays,
  };
}

function blankStanding(row: PoolStanding): PoolStanding {
  return {
    ...row,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    bp: 0,
    pts: 0,
  };
}

function applyToRow(
  row: PoolStanding,
  scored: number,
  conceded: number,
  triesFor: number,
  won: boolean,
  drawn: boolean
): PoolStanding {
  const lost = !won && !drawn;
  const tryBp = triesFor >= 4 ? 1 : 0;
  const loseBp = lost && scored + 7 >= conceded ? 1 : 0;
  const bp = tryBp + loseBp;
  return {
    ...row,
    played: row.played + 1,
    won: row.won + (won ? 1 : 0),
    drawn: row.drawn + (drawn ? 1 : 0),
    lost: row.lost + (lost ? 1 : 0),
    pointsFor: row.pointsFor + scored,
    pointsAgainst: row.pointsAgainst + conceded,
    bp: row.bp + bp,
    pts: row.pts + (won ? 4 : drawn ? 2 : 0) + bp,
  };
}

export function recomputePoolStandings(pools: Pool[] | undefined, matches: Match[]): Pool[] | undefined {
  if (!pools?.length) return pools;
  const finals = matches.filter(
    (match) =>
      match.status === "final" &&
      match.homeScore != null &&
      match.awayScore != null &&
      match.round !== "Scoring desk"
  );
  return pools.map((pool) => {
    let standings = pool.standings.map(blankStanding);
    for (const match of finals) {
      const events = match.events ?? [];
      const homeTries = triesFromEvents(events, "home");
      const awayTries = triesFromEvents(events, "away");
      const homeScore = match.homeScore as number;
      const awayScore = match.awayScore as number;
      const drawn = homeScore === awayScore;
      standings = standings.map((row) => {
        if (row.team === match.homeTeam) {
          return applyToRow(row, homeScore, awayScore, homeTries, homeScore > awayScore, drawn);
        }
        if (row.team === match.awayTeam) {
          return applyToRow(row, awayScore, homeScore, awayTries, awayScore > homeScore, drawn);
        }
        return row;
      });
    }
    return {
      ...pool,
      standings: [...standings].sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        const aDiff = a.pointsFor - a.pointsAgainst;
        const bDiff = b.pointsFor - b.pointsAgainst;
        if (bDiff !== aDiff) return bDiff - aDiff;
        return b.pointsFor - a.pointsFor;
      }),
    };
  });
}

export function event(
  id: string,
  minute: number,
  kind: ScoreEventKind,
  team: "home" | "away",
  playerName: string,
  playerId?: string
): MatchScoreEvent {
  return { id, minute, kind, team, playerName, playerId, points: SCORE_POINTS[kind] };
}
