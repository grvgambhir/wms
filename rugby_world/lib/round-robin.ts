import type { Match, Pool, Team } from "./types";

export type GridTeam = { name: string; flag: string };

export type RoundRobinGridGroup = {
  name: string;
  teams: GridTeam[];
  matches: Match[];
};

export function roundRobinPairings(teamIds: string[]): { round: number; homeId: string; awayId: string }[] {
  const ids = teamIds.filter(Boolean);
  if (ids.length < 2) return [];
  const circle = [...ids];
  if (circle.length % 2 === 1) circle.push("__bye__");
  const n = circle.length;
  const rounds = n - 1;
  const half = n / 2;
  const fixtures: { round: number; homeId: string; awayId: string }[] = [];
  const arr = [...circle];

  for (let round = 0; round < rounds; round += 1) {
    for (let i = 0; i < half; i += 1) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (!a || !b || a === "__bye__" || b === "__bye__") continue;
      const swap = round % 2 === 1;
      fixtures.push({
        round: round + 1,
        homeId: swap ? b : a,
        awayId: swap ? a : b,
      });
    }
    const last = arr.pop();
    if (last) arr.splice(1, 0, last);
  }

  return fixtures;
}

export function pairKey(a: string, b: string) {
  return [a, b].sort().join("::");
}

export function teamsInPool(teams: Team[], poolName: string, competitionId: string) {
  return teams.filter(
    (t) => t.competitionIds.includes(competitionId) && t.pool === poolName
  );
}

function teamNames(pool: Pool) {
  return new Set(pool.standings.map((row) => row.team));
}

function matchTouchesPool(match: Match, pool: Pool) {
  const names = teamNames(pool);
  if (pool.name && match.round.toLowerCase().includes(pool.name.toLowerCase())) return true;
  return names.has(match.homeTeam) || names.has(match.awayTeam);
}

export function buildRoundRobinGrids(
  pools: Pool[] | undefined,
  leagueMatches: Match[]
): RoundRobinGridGroup[] {
  const assigned = new Set<string>();
  const groups: RoundRobinGridGroup[] = [];

  for (const pool of pools ?? []) {
    const poolMatches = leagueMatches.filter((match) => matchTouchesPool(match, pool));
    const byName = new Map<string, GridTeam>();
    for (const row of pool.standings) {
      byName.set(row.team, { name: row.team, flag: row.flag });
    }
    for (const match of poolMatches) {
      byName.set(match.homeTeam, { name: match.homeTeam, flag: match.homeFlag });
      byName.set(match.awayTeam, { name: match.awayTeam, flag: match.awayFlag });
      assigned.add(match.id);
    }
    if (byName.size < 2) continue;
    groups.push({
      name: pool.name,
      teams: [...byName.values()],
      matches: poolMatches,
    });
  }

  const leftover = leagueMatches.filter((match) => !assigned.has(match.id));
  if (leftover.length === 0) return groups;

  if (groups.length === 1) {
    const only = groups[0];
    if (!only) return groups;
    const byName = new Map(only.teams.map((team) => [team.name, team]));
    for (const match of leftover) {
      byName.set(match.homeTeam, { name: match.homeTeam, flag: match.homeFlag });
      byName.set(match.awayTeam, { name: match.awayTeam, flag: match.awayFlag });
    }
    only.teams = [...byName.values()];
    only.matches = [...only.matches, ...leftover];
    return groups;
  }

  const byName = new Map<string, GridTeam>();
  for (const match of leftover) {
    byName.set(match.homeTeam, { name: match.homeTeam, flag: match.homeFlag });
    byName.set(match.awayTeam, { name: match.awayTeam, flag: match.awayFlag });
  }
  if (byName.size >= 2) {
    groups.push({ name: "Round robin", teams: [...byName.values()], matches: leftover });
  }
  return groups;
}

export function cellMatch(matches: Match[], rowTeam: string, colTeam: string) {
  return (
    matches.find((match) => match.homeTeam === rowTeam && match.awayTeam === colTeam) ??
    matches.find(
      (match) =>
        (match.homeTeam === rowTeam && match.awayTeam === colTeam) ||
        (match.homeTeam === colTeam && match.awayTeam === rowTeam)
    )
  );
}

export function scoreFromRow(match: Match, rowTeam: string) {
  if (match.homeTeam === rowTeam) {
    return { for: match.homeScore, against: match.awayScore };
  }
  return { for: match.awayScore, against: match.homeScore };
}
