import type { Competition, Match, OpsModule, Pool, Venue } from "./types";
import { isKnockoutMatch } from "./bracket";

export const MANAGER_TABS: { slug: string; label: string }[] = [
  { slug: "", label: "Overview" },
  { slug: "roster", label: "Roster" },
  { slug: "groups", label: "Groups" },
  { slug: "fixtures", label: "Fixtures" },
  { slug: "officials", label: "Officials" },
  { slug: "results", label: "Results" },
  { slug: "venues", label: "Venues" },
  { slug: "medical", label: "Medical" },
  { slug: "broadcast", label: "Broadcast" },
  { slug: "ops", label: "Event ops" },
];

export const COMPETITION_STRUCTURES = [
  "Round robin",
  "Pools then knockout",
  "Pools then ranking finals",
  "Knockout only",
  "Pool plus knockout",
] as const;

export function normalizeStructure(value: string) {
  if (!value) return "";
  if ((COMPETITION_STRUCTURES as readonly string[]).includes(value)) return value;
  if (/ranking finals/i.test(value)) return "Pools then ranking finals";
  if (/pool plus knockout/i.test(value)) return "Pool plus knockout";
  if (/round[- ]robin/i.test(value) && !/quarter|semi|final/i.test(value)) return "Round robin";
  if (/no knockout/i.test(value)) return "Round robin";
  if (/pool/i.test(value) && /knockout/i.test(value)) return "Pools then knockout";
  if (/knockout/i.test(value)) return "Knockout only";
  return value;
}

export function structureChoices(current?: string) {
  const normalized = current ? normalizeStructure(current) : "";
  const list: string[] = [...COMPETITION_STRUCTURES];
  if (normalized && !list.includes(normalized)) list.push(normalized);
  return list;
}

export function structureNeedsGroups(structure?: string) {
  return normalizeStructure(structure ?? "") !== "Knockout only";
}

export function structureNeedsRoundRobin(structure?: string) {
  return normalizeStructure(structure ?? "") !== "Knockout only";
}

export function structureNeedsKnockout(structure?: string) {
  return normalizeStructure(structure ?? "") !== "Round robin";
}

export function matchOfficialsReady(match: Match) {
  const referee = match.officials.referee?.trim();
  return Boolean(referee && referee !== "TBC");
}

export type SetupStepId = "teams" | "groups" | "fixtures" | "brackets" | "officials";
export type SetupStepStatus = "done" | "current" | "upcoming" | "skipped";

export type SetupStep = {
  id: SetupStepId;
  label: string;
  hint: string;
  href: string;
  cta: string;
  status: SetupStepStatus;
};

export function buildSetupJourney(input: {
  competitionId: string;
  structure?: string;
  teamCount: number;
  pools?: Pool[];
  matches: Match[];
  modules?: string[] | null;
}): SetupStep[] {
  const base = `/tournaments/${input.competitionId}`;
  const allowed = (slug: string) => !input.modules || input.modules.includes(slug);
  const groups = input.pools ?? [];
  const grouped = groups.some((pool) => pool.standings.length >= 2);
  const league = input.matches.filter((match) => !isKnockoutMatch(match) && match.round !== "Scoring desk");
  const knockouts = input.matches.filter(isKnockoutMatch);
  const officialsDone = input.matches.length > 0 && input.matches.every(matchOfficialsReady);

  const draft: Omit<SetupStep, "status">[] = [
    {
      id: "teams",
      label: "Teams",
      hint: "Add the sides that will play",
      href: `${base}/roster`,
      cta: "Add teams",
    },
    {
      id: "groups",
      label: "Groups",
      hint: "Create pools and place teams",
      href: `${base}/groups`,
      cta: "Create groups",
    },
    {
      id: "fixtures",
      label: "Round robin",
      hint: "Auto-build pool fixtures",
      href: `${base}/fixtures`,
      cta: "Build round-robin fixtures",
    },
    {
      id: "brackets",
      label: "Bracket",
      hint: "Knockout rounds appear next",
      href: `${base}/fixtures`,
      cta: "Build the knockout bracket",
    },
    {
      id: "officials",
      label: "Officials",
      hint: "Appoint a panel for each match",
      href: `${base}/officials`,
      cta: "Appoint match officials",
    },
  ];

  const include: Record<SetupStepId, boolean> = {
    teams: allowed("roster"),
    groups: allowed("groups") && structureNeedsGroups(input.structure),
    fixtures: allowed("fixtures") && structureNeedsRoundRobin(input.structure),
    brackets: allowed("fixtures") && structureNeedsKnockout(input.structure),
    officials: allowed("officials"),
  };

  const complete: Record<SetupStepId, boolean> = {
    teams: input.teamCount >= 2,
    groups: grouped,
    fixtures: league.length > 0,
    brackets: knockouts.length > 0,
    officials: officialsDone,
  };

  let currentSet = false;
  return draft.map((step) => {
    if (!include[step.id]) return { ...step, status: "skipped" as const };
    if (complete[step.id]) return { ...step, status: "done" as const };
    if (!currentSet) {
      currentSet = true;
      return { ...step, status: "current" as const };
    }
    return { ...step, status: "upcoming" as const };
  });
}

export function currentSetupStep(steps: SetupStep[]) {
  return steps.find((step) => step.status === "current");
}

export const OPS_FIELD_COPY: Record<
  OpsModule,
  { title: string; description: string; titleLabel: string; metaLabel: string }
> = {
  officials: {
    title: "Officials",
    description: "Tournament referee manager, match panel, citing and laws briefings.",
    titleLabel: "Appointment",
    metaLabel: "Panel / notes",
  },
  medical: {
    title: "Medical",
    description: "Independent medical lead, HIA bunkers, pitch-side cover and hospital SLAs.",
    titleLabel: "Post / plan",
    metaLabel: "Cover / notes",
  },
  broadcast: {
    title: "Broadcast",
    description: "Host broadcaster, world feed production and territorial rights windows.",
    titleLabel: "Package",
    metaLabel: "Partner / window",
  },
  media: {
    title: "Media",
    description: "Accreditation windows, mixed zone, press conferences and content rights.",
    titleLabel: "Operation",
    metaLabel: "Protocol / notes",
  },
  accreditation: {
    title: "Accreditation",
    description: "Pass categories for teams, media, broadcast, hospitality and workforce.",
    titleLabel: "Category",
    metaLabel: "Quota / rules",
  },
  hospitality: {
    title: "Hospitality",
    description: "Official hospitality inventory, suites, lounges and sponsor villages.",
    titleLabel: "Product",
    metaLabel: "Venue / covers",
  },
  accommodation: {
    title: "Accommodation",
    description: "Hotel blocks for teams, officials, media and workforce.",
    titleLabel: "Hotel / block",
    metaLabel: "City / allocation",
  },
  transport: {
    title: "Transport",
    description: "Airport arrivals, team loops, officials cars and broadcast compounds.",
    titleLabel: "Route / plan",
    metaLabel: "Mode / window",
  },
  workforce: {
    title: "Workforce",
    description: "Volunteers, security, pitch operations and specialist contractors.",
    titleLabel: "Role / programme",
    metaLabel: "Headcount / vendor",
  },
};

export function venuesForCompetition(venues: Venue[], competition: Competition) {
  return venues.filter(
    (venue) =>
      venue.competitions.includes(competition.shortName) ||
      venue.competitions.includes(competition.name) ||
      venue.competitions.includes(competition.id)
  );
}
