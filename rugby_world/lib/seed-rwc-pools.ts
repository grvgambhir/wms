import type { Match } from "./types";
import { roundRobinPairings } from "./round-robin";

type Side = { id: string; name: string; flag: string };

const POOLS: { name: string; teams: Side[] }[] = [
  {
    name: "Pool A",
    teams: [
      { id: "nzl", name: "New Zealand", flag: "🇳🇿" },
      { id: "fra", name: "France", flag: "🇫🇷" },
      { id: "ita", name: "Italy", flag: "🇮🇹" },
      { id: "uru", name: "Uruguay", flag: "🇺🇾" },
      { id: "spa", name: "Spain", flag: "🇪🇸" },
    ],
  },
  {
    name: "Pool B",
    teams: [
      { id: "rsa", name: "South Africa", flag: "🇿🇦" },
      { id: "ire", name: "Ireland", flag: "🇮🇪" },
      { id: "sco", name: "Scotland", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
      { id: "jpn", name: "Japan", flag: "🇯🇵" },
      { id: "por", name: "Portugal", flag: "🇵🇹" },
    ],
  },
  {
    name: "Pool C",
    teams: [
      { id: "aus", name: "Australia", flag: "🇦🇺" },
      { id: "eng", name: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
      { id: "fij", name: "Fiji", flag: "🇫🇯" },
      { id: "geo", name: "Georgia", flag: "🇬🇪" },
      { id: "rou", name: "Romania", flag: "🇷🇴" },
    ],
  },
  {
    name: "Pool D",
    teams: [
      { id: "arg", name: "Argentina", flag: "🇦🇷" },
      { id: "wal", name: "Wales", flag: "🏴󠁧󠁢󠁷󠁬󠁳󠁿" },
      { id: "sam", name: "Samoa", flag: "🇼🇸" },
      { id: "usa", name: "United States", flag: "🇺🇸" },
      { id: "ton", name: "Tonga", flag: "🇹🇴" },
    ],
  },
];

const RATING: Record<string, number> = {
  nzl: 94,
  fra: 90,
  ita: 74,
  uru: 63,
  spa: 56,
  rsa: 95,
  ire: 91,
  sco: 79,
  jpn: 71,
  por: 61,
  aus: 82,
  eng: 86,
  fij: 77,
  geo: 69,
  rou: 55,
  arg: 83,
  wal: 76,
  sam: 70,
  usa: 65,
  ton: 67,
};

const VENUES = ["accor", "suncorp", "ammi", "adelaide", "optus", "newcastle"];

function rugbyScore(homeId: string, awayId: string, salt: number) {
  const homeR = RATING[homeId] ?? 70;
  const awayR = RATING[awayId] ?? 70;
  const jitter = (salt * 11 + homeId.charCodeAt(0) + awayId.charCodeAt(1)) % 13;
  const home = Math.max(10, Math.round((homeR - 40) * 0.55) + (jitter % 8) + 4);
  const away = Math.max(6, Math.round((awayR - 42) * 0.5) + ((jitter * 3) % 7));
  if (home === away) return { home: home + 3, away };
  return { home, away };
}

const DESK_OFFICIALS = [
  { referee: "Wayne Barnes (England)", ar1: "Christophe Ridley (England)", ar2: "Karl Dickson (England)", tmo: "Tom Foley (England)" },
  { referee: "Angus Gardner (Australia)", ar1: "Jordan Way (Australia)", ar2: "Reuben Keane (Australia)", tmo: "Brett Cronan (Australia)" },
  { referee: "Ben O’Keeffe (New Zealand)", ar1: "James Doleman (New Zealand)", ar2: "Jono Bredin (New Zealand)", tmo: "Glenn Newman (New Zealand)" },
  { referee: "Nika Amashukeli (Georgia)", ar1: "Andrea Piardi (Italy)", ar2: "Craig Evans (Wales)", tmo: "Ian Tempest (England)" },
];

export function asScoringDesk(match: Match, status: "scheduled" | "live" = "scheduled"): Match {
  return {
    ...match,
    status,
    homeScore: status === "live" ? 0 : null,
    awayScore: status === "live" ? 0 : null,
    events: [],
    clockElapsedMs: 0,
    clockRunning: false,
    clockStartedAt: null,
    period: "prematch",
  };
}

export function matchDeskUntouched(match: Match) {
  return (!match.events || match.events.length === 0) && !match.clockRunning && !(match.clockElapsedMs && match.clockElapsedMs > 0);
}

export function createRwcPoolMatches(): Match[] {
  const tbc = { referee: "TBC", ar1: "TBC", ar2: "TBC", tmo: "TBC" };
  const matches: Match[] = [];
  let slot = 0;

  for (const pool of POOLS) {
    const pairings = roundRobinPairings(pool.teams.map((team) => team.id));
    for (const pairing of pairings) {
      const home = pool.teams.find((team) => team.id === pairing.homeId);
      const away = pool.teams.find((team) => team.id === pairing.awayId);
      if (!home || !away) continue;
      const kickoff = new Date(Date.UTC(2027, 9, 1 + (pairing.round - 1) * 4, 8 + (slot % 2) * 2, 0, 0));
      const played = pairing.round <= 3;
      const score = rugbyScore(home.id, away.id, slot);
      const row: Match = {
        id: `rwc-${pool.name.replace(/\s/g, "").toLowerCase()}-r${pairing.round}-${home.id}-${away.id}`,
        competitionId: "rwc-2027",
        round: `${pool.name} · Matchday ${pairing.round}`,
        kickoff: kickoff.toISOString(),
        venueId: VENUES[slot % VENUES.length] ?? "accor",
        homeTeam: home.name,
        homeFlag: home.flag,
        awayTeam: away.name,
        awayFlag: away.flag,
        homeTeamId: home.id,
        awayTeamId: away.id,
        homeScore: played ? score.home : 0,
        awayScore: played ? score.away : 0,
        status: played ? "final" : "scheduled",
        officials: tbc,
        feedsRankings: true,
        rankingCategory: "mens-15s",
        events: [],
        period: played ? "full-time" : "prematch",
        clockElapsedMs: 0,
        clockRunning: false,
        clockStartedAt: null,
      };
      matches.push(played ? row : asScoringDesk(row));
      slot += 1;
    }
  }

  return [
    ...matches,
    asScoringDesk(
      {
        id: "rwc-desk-nzl-fra",
        competitionId: "rwc-2027",
        round: "Scoring desk",
        kickoff: "2026-09-18T08:00:00.000Z",
        venueId: "accor",
        homeTeam: "New Zealand",
        homeFlag: "🇳🇿",
        awayTeam: "France",
        awayFlag: "🇫🇷",
        homeTeamId: "nzl",
        awayTeamId: "fra",
        homeScore: 0,
        awayScore: 0,
        status: "live",
        officials: DESK_OFFICIALS[0] ?? tbc,
        feedsRankings: false,
        rankingCategory: "mens-15s",
      },
      "live"
    ),
    asScoringDesk(
      {
        id: "rwc-desk-eng-aus",
        competitionId: "rwc-2027",
        round: "Scoring desk",
        kickoff: "2026-09-18T10:00:00.000Z",
        venueId: "suncorp",
        homeTeam: "England",
        homeFlag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
        awayTeam: "Australia",
        awayFlag: "🇦🇺",
        homeTeamId: "eng",
        awayTeamId: "aus",
        homeScore: 0,
        awayScore: 0,
        status: "live",
        officials: DESK_OFFICIALS[1] ?? tbc,
        feedsRankings: false,
        rankingCategory: "mens-15s",
      },
      "live"
    ),
    asScoringDesk(
      {
        id: "rwc-desk-rsa-ire",
        competitionId: "rwc-2027",
        round: "Scoring desk",
        kickoff: "2026-09-18T12:00:00.000Z",
        venueId: "ammi",
        homeTeam: "South Africa",
        homeFlag: "🇿🇦",
        awayTeam: "Ireland",
        awayFlag: "🇮🇪",
        homeTeamId: "rsa",
        awayTeamId: "ire",
        homeScore: 0,
        awayScore: 0,
        status: "scheduled",
        officials: DESK_OFFICIALS[2] ?? tbc,
        feedsRankings: false,
        rankingCategory: "mens-15s",
      },
      "scheduled"
    ),
    asScoringDesk(
      {
        id: "rwc-desk-fij-arg",
        competitionId: "rwc-2027",
        round: "Scoring desk",
        kickoff: "2026-09-18T14:00:00.000Z",
        venueId: "adelaide",
        homeTeam: "Fiji",
        homeFlag: "🇫🇯",
        awayTeam: "Argentina",
        awayFlag: "🇦🇷",
        homeTeamId: "fij",
        awayTeamId: "arg",
        homeScore: 0,
        awayScore: 0,
        status: "scheduled",
        officials: DESK_OFFICIALS[3] ?? tbc,
        feedsRankings: false,
        rankingCategory: "mens-15s",
      },
      "scheduled"
    ),
  ];
}
