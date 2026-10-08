import type { Match } from "./types";

const STAGES: { pattern: RegExp; order: number; label: string }[] = [
  { pattern: /round of 16|last 16|r16/i, order: 0, label: "Round of 16" },
  { pattern: /quarter/i, order: 1, label: "Quarter-finals" },
  { pattern: /semi|cup sf|\bsf\b/i, order: 2, label: "Semi-finals" },
  { pattern: /bronze/i, order: 3, label: "Bronze final" },
  { pattern: /cup final|final/i, order: 4, label: "Final" },
  { pattern: /knock[- ]?out|play[- ]?off/i, order: 1, label: "Knockouts" },
];

export function isKnockoutMatch(match: Match) {
  const round = match.round;
  if (/pool|matchday|round robin|round \d/i.test(round) && !/final|semi|quarter|cup|knock/i.test(round)) {
    return false;
  }
  return STAGES.some((stage) => stage.pattern.test(round));
}

export function knockoutRoundMeta(round: string) {
  const stage = STAGES.find((row) => row.pattern.test(round));
  return stage ?? { order: 50, label: round };
}

export function groupKnockoutRounds(matches: Match[]) {
  const knockouts = matches.filter(isKnockoutMatch);
  const buckets = new Map<number, { label: string; matches: Match[] }>();
  for (const match of knockouts) {
    const meta = knockoutRoundMeta(match.round);
    const current = buckets.get(meta.order) ?? { label: meta.label, matches: [] };
    current.matches.push(match);
    buckets.set(meta.order, current);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, value]) => ({
      ...value,
      matches: [...value.matches].sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.round.localeCompare(b.round)),
    }));
}

export function splitKnockoutBracket(matches: Match[]) {
  const rounds = groupKnockoutRounds(matches);
  return {
    main: rounds.filter((round) => !/bronze/i.test(round.label)),
    playoff: rounds.filter((round) => /bronze/i.test(round.label)),
  };
}

export type KnockoutSlot = {
  round: string;
  homeTeam: string;
  awayTeam: string;
  homeFlag: string;
  awayFlag: string;
  homeTeamId?: string;
  awayTeamId?: string;
};

type NamedSide = { name: string; flag: string; id?: string };

function slot(round: string, home: NamedSide, away: NamedSide): KnockoutSlot {
  return {
    round,
    homeTeam: home.name,
    homeFlag: home.flag,
    awayTeam: away.name,
    awayFlag: away.flag,
    homeTeamId: home.id,
    awayTeamId: away.id,
  };
}

function placeholder(label: string): NamedSide {
  return { name: label, flag: "🏉" };
}

function nextPow2(n: number) {
  let size = 2;
  while (size < n) size *= 2;
  return size;
}

export function knockoutSlotsFromTeams(teams: NamedSide[]): KnockoutSlot[] {
  const list = teams.filter((row) => row.name);
  if (list.length < 2) return knockoutSlotsFromPools([]);
  const size = nextPow2(Math.min(list.length, 16));
  const padded: (NamedSide | null)[] = [...list.slice(0, size)];
  while (padded.length < size) padded.push(null);

  const firstLabel = size === 2 ? "Final" : size === 4 ? "Semi-final" : size === 8 ? "Quarter-final" : "Round of 16";
  const first: KnockoutSlot[] = [];
  for (let i = 0; i < size; i += 2) {
    const home = padded[i] ?? placeholder("Bye");
    const away = padded[i + 1] ?? placeholder("Bye");
    const round = size === 2 ? "Final" : `${firstLabel} ${i / 2 + 1}`;
    first.push(slot(round, home, away));
  }
  if (size === 2) return first;
  if (size === 4) {
    return [...first, slot("Final", placeholder("Winner SF 1"), placeholder("Winner SF 2"))];
  }
  if (size === 8) {
    return [
      ...first,
      slot("Semi-final 1", placeholder("Winner QF 1"), placeholder("Winner QF 2")),
      slot("Semi-final 2", placeholder("Winner QF 3"), placeholder("Winner QF 4")),
      slot("Bronze final", placeholder("Loser SF 1"), placeholder("Loser SF 2")),
      slot("Final", placeholder("Winner SF 1"), placeholder("Winner SF 2")),
    ];
  }
  return [
    ...first,
    slot("Quarter-final 1", placeholder("Winner R16 1"), placeholder("Winner R16 2")),
    slot("Quarter-final 2", placeholder("Winner R16 3"), placeholder("Winner R16 4")),
    slot("Quarter-final 3", placeholder("Winner R16 5"), placeholder("Winner R16 6")),
    slot("Quarter-final 4", placeholder("Winner R16 7"), placeholder("Winner R16 8")),
    slot("Semi-final 1", placeholder("Winner QF 1"), placeholder("Winner QF 2")),
    slot("Semi-final 2", placeholder("Winner QF 3"), placeholder("Winner QF 4")),
    slot("Bronze final", placeholder("Loser SF 1"), placeholder("Loser SF 2")),
    slot("Final", placeholder("Winner SF 1"), placeholder("Winner SF 2")),
  ];
}

export function knockoutSlotsFromPools(poolNames: string[]): KnockoutSlot[] {
  const names = poolNames.filter(Boolean);
  if (names.length >= 4) {
    const [a, b, c, d] = names;
    return [
      slot("Quarter-final 1", placeholder(`Winner ${a}`), placeholder(`Runner-up ${b}`)),
      slot("Quarter-final 2", placeholder(`Winner ${b}`), placeholder(`Runner-up ${a}`)),
      slot("Quarter-final 3", placeholder(`Winner ${c}`), placeholder(`Runner-up ${d}`)),
      slot("Quarter-final 4", placeholder(`Winner ${d}`), placeholder(`Runner-up ${c}`)),
      slot("Semi-final 1", placeholder("Winner QF 1"), placeholder("Winner QF 2")),
      slot("Semi-final 2", placeholder("Winner QF 3"), placeholder("Winner QF 4")),
      slot("Bronze final", placeholder("Loser SF 1"), placeholder("Loser SF 2")),
      slot("Final", placeholder("Winner SF 1"), placeholder("Winner SF 2")),
    ];
  }
  if (names.length === 3) {
    return [
      slot("Semi-final 1", placeholder(`Winner ${names[0]}`), placeholder(`Winner ${names[1]}`)),
      slot("Semi-final 2", placeholder(`Winner ${names[2]}`), placeholder("Best runner-up")),
      slot("Final", placeholder("Winner SF 1"), placeholder("Winner SF 2")),
    ];
  }
  if (names.length === 2) {
    return [
      slot("Semi-final 1", placeholder(`Winner ${names[0]}`), placeholder(`Runner-up ${names[1]}`)),
      slot("Semi-final 2", placeholder(`Winner ${names[1]}`), placeholder(`Runner-up ${names[0]}`)),
      slot("Final", placeholder("Winner SF 1"), placeholder("Winner SF 2")),
    ];
  }
  return [
    slot("Semi-final 1", placeholder("1st"), placeholder("4th")),
    slot("Semi-final 2", placeholder("2nd"), placeholder("3rd")),
    slot("Final", placeholder("Winner SF 1"), placeholder("Winner SF 2")),
  ];
}

export function buildKnockoutSlots(input: {
  knockoutOnly: boolean;
  poolNames: string[];
  teams: NamedSide[];
}): KnockoutSlot[] {
  if (input.knockoutOnly) return knockoutSlotsFromTeams(input.teams);
  if (input.poolNames.length > 0) return knockoutSlotsFromPools(input.poolNames);
  if (input.teams.length >= 2) return knockoutSlotsFromTeams(input.teams);
  return knockoutSlotsFromPools([]);
}
