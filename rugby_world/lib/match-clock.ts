import type { Competition, Match, MatchPeriod } from "./types";

export function halfLengthMinutes(match: Match, competition?: Competition) {
  if (competition?.format === "7s") return 7;
  if (/7s|sevens/i.test(match.round)) return 7;
  return 40;
}

export function clockParts(match: Match, now = Date.now()) {
  let ms = match.clockElapsedMs ?? 0;
  if (match.clockRunning && match.clockStartedAt) {
    ms += Math.max(0, now - Date.parse(match.clockStartedAt));
  }
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const minute = Math.floor(totalSec / 60);
  const second = totalSec % 60;
  return {
    ms,
    minute,
    second,
    totalSec,
    label: `${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`,
  };
}

export function resolvePeriod(match: Match, halfMinutes: number): MatchPeriod {
  if (match.period) return match.period;
  if (match.status === "final") return "full-time";
  if (match.status === "scheduled") return "prematch";
  const { minute } = clockParts(match);
  if (minute >= halfMinutes && !match.clockRunning) return "half-time";
  if (minute >= halfMinutes) return "second-half";
  return "first-half";
}

export function periodLabel(period: MatchPeriod) {
  if (period === "prematch") return "Pre match";
  if (period === "first-half") return "1st half";
  if (period === "half-time") return "Half time";
  if (period === "second-half") return "2nd half";
  return "Full time";
}
