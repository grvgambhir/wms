import type { ConcussionCase, HiaStageRecord, RtpStageRecord } from "./types";

const RTP_NAMES = [
  "Symptom-limited activity",
  "Light aerobic exercise",
  "Rugby-specific exercise",
  "Non-contact training",
  "Full contact practice",
  "Return to play",
];

function addMinutes(iso: string, minutes: number) {
  return new Date(Date.parse(iso) + minutes * 60 * 1000).toISOString();
}

function addDays(iso: string, days: number) {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type ConcussionDraft = {
  player: string;
  playerId?: string;
  position: string;
  unionId: string;
  unionName: string;
  teamName?: string;
  teamFlag?: string;
  matchId: string | null;
  matchLabel: string;
  competitionId?: string;
  minute?: number;
  notes?: string;
  source?: "manual" | "match";
};

export function buildConcussionCase(id: string, draft: ConcussionDraft, occurredAt = new Date().toISOString()): ConcussionCase {
  const hia: HiaStageRecord[] = [
    {
      stage: "HIA1",
      label: "Pitch-side",
      due: addMinutes(occurredAt, 10),
      completedAt: null,
      outcome: "pending",
      notes: draft.notes?.trim() || "HIA1 opened. Player to be assessed pitch-side.",
    },
    {
      stage: "HIA2",
      label: "Post-match",
      due: addMinutes(occurredAt, 180),
      completedAt: null,
      outcome: "pending",
      notes: "",
    },
    {
      stage: "HIA3",
      label: "36-48 hour",
      due: addMinutes(occurredAt, 48 * 60),
      completedAt: null,
      outcome: "pending",
      notes: "",
    },
  ];
  const rtp: RtpStageRecord[] = RTP_NAMES.map((name, index) => ({
    stage: index + 1,
    name,
    due: addDays(occurredAt, index + 1),
    status: "not-started",
    clearedAt: null,
  }));
  return {
    id,
    player: draft.player,
    playerId: draft.playerId,
    position: draft.position,
    unionId: draft.unionId,
    unionName: draft.unionName,
    teamName: draft.teamName,
    teamFlag: draft.teamFlag,
    matchId: draft.matchId,
    matchLabel: draft.matchLabel,
    competitionId: draft.competitionId,
    minute: draft.minute,
    notes: draft.notes,
    source: draft.source ?? "manual",
    occurredAt,
    currentHia: "HIA1",
    diagnosis: "suspected",
    rtpOverall: "not-started",
    hia,
    rtp,
    confidential: true,
  };
}
