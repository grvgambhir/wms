"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import type { Match, ScoreEventKind } from "@/lib/types";
import { SCORE_LABELS, SCORE_POINTS, halfTimeScore, scoringTally, winnerLabel } from "@/lib/match-card";
import { clockParts, halfLengthMinutes, periodLabel, resolvePeriod } from "@/lib/match-clock";
import { Button } from "@/components/ui/button";
import { ConcussionEntryForm } from "@/components/concussion/case-form";
import { cn } from "@/lib/utils";

type PendingScore = { kind: ScoreEventKind; team: "home" | "away" };

export function MatchDesk({ match }: { match: Match }) {
  const {
    state,
    addMatchEvent,
    removeMatchEvent,
    kickOffMatch,
    pauseMatchClock,
    startMatchClock,
    callHalfTime,
    startSecondHalf,
    enterMatchResult,
    resetMatchClock,
  } = useStore();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!match.clockRunning) return;
    const id = window.setInterval(() => setTick((value) => value + 1), 200);
    return () => window.clearInterval(id);
  }, [match.clockRunning, match.id]);

  const competition = state.competitions.find((row) => row.id === match.competitionId);
  const halfMinutes = halfLengthMinutes(match, competition);
  const clock = clockParts(match);
  const period = resolvePeriod(match, halfMinutes);
  const events = [...(match.events ?? [])].sort((a, b) => a.minute - b.minute || a.id.localeCompare(b.id));
  const ht = halfTimeScore(events, halfMinutes);
  const homeSquad = state.players.filter((p) => p.teamId === match.homeTeamId).sort((a, b) => a.number - b.number);
  const awaySquad = state.players.filter((p) => p.teamId === match.awayTeamId).sort((a, b) => a.number - b.number);
  const [pending, setPending] = useState<PendingScore | null>(null);
  const [conversion, setConversion] = useState<"home" | "away" | null>(null);

  const pendingSquad = pending?.team === "away" ? awaySquad : homeSquad;
  const clockStarted = Boolean(match.clockRunning || (match.clockElapsedMs ?? 0) > 0);
  const live = period === "first-half" || period === "second-half";
  const canScore = live && clockStarted && match.status !== "final";
  const awaitingKickOff =
    period === "prematch" || (period === "first-half" && !clockStarted && match.status !== "final");
  const overFirst = period === "first-half" && clock.minute >= halfMinutes;
  const overSecond = period === "second-half" && clock.minute >= halfMinutes * 2;
  const homeTally = scoringTally(events, "home");
  const awayTally = scoringTally(events, "away");

  function record(kind: ScoreEventKind, team: "home" | "away", player?: { id?: string; name: string }) {
    const name =
      player?.name ||
      (kind === "penalty-try" ? "Penalty try" : "");
    if (!name) {
      setPending({ kind, team });
      return;
    }
    addMatchEvent(match.id, {
      minute: clock.minute,
      kind,
      team,
      playerId: player?.id,
      playerName: name,
    });
    setPending(null);
    if (kind === "try") setConversion(team);
    else setConversion(null);
    toast.success(`${SCORE_LABELS[kind]} · ${name}`);
  }

  const scorers = useMemo(() => {
    const group = (side: "home" | "away") => {
      const map = new Map<string, { name: string; bits: string[] }>();
      for (const event of events.filter((row) => row.team === side)) {
        const key = event.playerId || event.playerName;
        const current = map.get(key) ?? { name: event.playerName, bits: [] };
        current.bits.push(`${SCORE_LABELS[event.kind]} ${event.minute}'`);
        map.set(key, current);
      }
      return [...map.values()];
    };
    return { home: group("home"), away: group("away") };
  }, [events]);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl bg-navy text-white shadow-lg">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 pt-3">
          <span className={cn("flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] uppercase", live ? "text-red-400" : "text-gold")}>
            {live && <span className="size-2 animate-pulse rounded-full bg-red-500" />}
            {periodLabel(period)}
          </span>
          <p className="text-center font-heading text-3xl font-bold leading-none tabular-nums sm:text-4xl">
            {clock.label}
          </p>
          <span className="truncate text-right text-[11px] font-semibold tracking-[0.18em] text-white/65 uppercase">
            {match.round}
          </span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 pb-5 pt-3">
          <TeamBlock flag={match.homeFlag} name={match.homeTeam} align="left" />
          <div className="text-center">
            <p className="font-heading text-5xl font-bold tabular-nums sm:text-6xl">
              {match.homeScore ?? 0}
              <span className="mx-2 font-bold text-gold">-</span>
              {match.awayScore ?? 0}
            </p>
            <p className="mt-1 text-sm text-white/70">
              HT {ht.home}-{ht.away}
              {period === "full-time" ? ` · ${winnerLabel(match)}` : ""}
            </p>
          </div>
          <TeamBlock flag={match.awayFlag} name={match.awayTeam} align="right" />
        </div>
        {(overFirst || overSecond) && (
          <p className="px-4 pb-2 text-center text-xs font-semibold tracking-wide text-gold uppercase">
            {overFirst
              ? `Regulation ${halfMinutes}:00 complete. Call half time.`
              : "Second half complete. Call full time."}
          </p>
        )}
        <div className="flex flex-wrap gap-2 border-t border-white/10 bg-black/20 px-4 py-3">
          {awaitingKickOff && (
            <Button type="button" variant="brand" data-match-action="kick-off" onClick={() => kickOffMatch(match.id)}>
              Kick off
            </Button>
          )}
          {live && clockStarted && match.clockRunning && (
            <Button
              type="button"
              variant="outline"
              data-match-action="pause"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20"
              onClick={() => pauseMatchClock(match.id)}
            >
              Pause clock
            </Button>
          )}
          {live && clockStarted && !match.clockRunning && (
            <Button type="button" variant="brand" data-match-action="resume" onClick={() => startMatchClock(match.id)}>
              Resume clock
            </Button>
          )}
          {period === "first-half" && clockStarted && (
            <Button
              type="button"
              variant="outline"
              data-match-action="half-time"
              className={cn(
                "border-white/30 bg-white/10 text-white hover:bg-white/20",
                overFirst && "border-gold bg-gold/20 text-gold"
              )}
              onClick={() => callHalfTime(match.id)}
            >
              Half time
            </Button>
          )}
          {period === "half-time" && (
            <Button type="button" variant="brand" data-match-action="second-half" onClick={() => startSecondHalf(match.id, halfMinutes)}>
              Kick off 2nd half
            </Button>
          )}
          {period === "second-half" && (
            <Button
              type="button"
              variant="outline"
              data-match-action="full-time"
              className={cn(
                "border-white/30 bg-white/10 text-white hover:bg-white/20",
                overSecond && "border-gold bg-gold/20 text-gold"
              )}
              onClick={() => {
                const banner = enterMatchResult(match.id, match.homeScore ?? 0, match.awayScore ?? 0);
                toast.success(banner ?? "Full time recorded.");
              }}
            >
              Full time
            </Button>
          )}
          {period !== "prematch" && period !== "full-time" && (
            <Button
              type="button"
              variant="outline"
              className="ml-auto border-white/20 bg-transparent text-white/80 hover:bg-white/10"
              onClick={() => {
                resetMatchClock(match.id);
                setPending(null);
                setConversion(null);
              }}
            >
              Reset clock
            </Button>
          )}
        </div>
      </section>

      {period === "full-time" && (
        <p className="rounded-lg border bg-muted/50 px-4 py-3 text-sm text-navy">
          Full time {match.homeScore}-{match.awayScore}. {winnerLabel(match)}.
        </p>
      )}

      {conversion && canScore && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
          <p className="font-medium text-navy">
            Conversion for {conversion === "home" ? match.homeTeam : match.awayTeam}?
          </p>
          <Button type="button" size="sm" variant="brand" onClick={() => record("conversion", conversion)}>
            Pick kicker
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setConversion(null)}>
            Missed
          </Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <ScorePad
          side="home"
          label={`${match.homeFlag} ${match.homeTeam}`}
          disabled={!canScore}
          onScore={(kind) => record(kind, "home")}
        />
        <ScorePad
          side="away"
          label={`${match.awayFlag} ${match.awayTeam}`}
          disabled={!canScore}
          onScore={(kind) => record(kind, "away")}
        />
      </div>
      {!canScore && period !== "full-time" && (
        <p className="text-sm text-muted-foreground">
          {awaitingKickOff
            ? "Kick off to start the clock and open scoring."
            : period === "half-time"
              ? "Half time. Kick off the second half to continue scoring."
              : "Clock is stopped. Resume to keep scoring, or call the next period."}
        </p>
      )}

      {pending && (
        <section className="rounded-xl border p-4">
          <p className="mb-3 text-sm font-medium text-navy">
            {SCORE_LABELS[pending.kind]} ({SCORE_POINTS[pending.kind]}) ·{" "}
            {pending.team === "home" ? match.homeTeam : match.awayTeam} · {clock.minute}&apos;
          </p>
          {pendingSquad.length === 0 ? (
            <Button
              type="button"
              variant="brand"
              onClick={() => record(pending.kind, pending.team, { name: SCORE_LABELS[pending.kind] })}
            >
              Record without squad list
            </Button>
          ) : (
            <div className="grid gap-1 sm:grid-cols-2" data-score-picker>
              {pendingSquad.map((player) => (
                <button
                  key={player.id}
                  type="button"
                  className="rounded-lg border px-3 py-2 text-left text-sm hover:border-navy hover:bg-muted/60"
                  onClick={() => record(pending.kind, pending.team, player)}
                >
                  <span className="mr-2 tabular-nums text-muted-foreground">{player.number}</span>
                  {player.name}
                </button>
              ))}
            </div>
          )}
          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => setPending(null)}>
            Cancel
          </Button>
        </section>
      )}

      <section>
        <h3 className="mb-2 font-heading text-lg font-semibold text-navy">Scoring timeline</h3>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scores yet. Tap Try, Con, Pen, DG or PT above.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            {events.map((event) => (
              <div
                key={event.id}
                className="grid grid-cols-[1fr_4.5rem_1fr] items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0"
              >
                <p className={cn("min-w-0 text-right", event.team !== "home" && "text-transparent")}>
                  {event.team === "home" && (
                    <>
                      <span className="font-medium text-navy">{event.playerName}</span>
                      <span className="ml-1 text-xs text-muted-foreground">
                        {SCORE_LABELS[event.kind]} · {event.points}
                      </span>
                    </>
                  )}
                </p>
                <p className="text-center text-xs font-semibold tabular-nums text-muted-foreground">{event.minute}&apos;</p>
                <div className="flex min-w-0 items-center justify-between gap-2">
                  {event.team === "away" ? (
                    <p>
                      <span className="font-medium text-navy">{event.playerName}</span>
                      <span className="ml-1 text-xs text-muted-foreground">
                        {SCORE_LABELS[event.kind]} · {event.points}
                      </span>
                    </p>
                  ) : (
                    <span />
                  )}
                  {match.status !== "final" && (
                    <button
                      type="button"
                      className="shrink-0 text-[11px] text-muted-foreground hover:text-red-600"
                      onClick={() => removeMatchEvent(match.id, event.id)}
                    >
                      Undo
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <ScorerList flag={match.homeFlag} team={match.homeTeam} rows={scorers.home} />
        <ScorerList flag={match.awayFlag} team={match.awayTeam} rows={scorers.away} />
      </div>

      <section className="rounded-lg border p-4">
        <h3 className="mb-3 font-heading text-lg font-semibold text-navy">Score breakdown</h3>
        <StatLine label="Tries" home={homeTally.tries} away={awayTally.tries} />
        <StatLine label="Conversions" home={homeTally.conversions} away={awayTally.conversions} />
        <StatLine label="Penalties" home={homeTally.penalties} away={awayTally.penalties} />
        <StatLine label="Drop goals" home={homeTally.dropGoals} away={awayTally.dropGoals} />
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="font-heading text-lg font-semibold text-navy">Concussion / HIA</h3>
          <p className="text-sm text-muted-foreground">
            Tag a player at the current timer minute. The case appears in Concussion Management with match details.
          </p>
        </div>
        {state.cases.filter((row) => row.matchId === match.id).length > 0 && (
          <div className="overflow-hidden rounded-lg border">
            {state.cases
              .filter((row) => row.matchId === match.id)
              .map((row) => (
                <Link
                  key={row.id}
                  href={`/concussion/${row.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm last:border-b-0 hover:bg-muted/60"
                >
                  <span className="font-medium text-navy">
                    {row.teamFlag} {row.player}
                    {row.minute != null ? ` · ${row.minute}'` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {row.diagnosis} · {row.currentHia}
                  </span>
                </Link>
              ))}
          </div>
        )}
        <ConcussionEntryForm matchId={match.id} defaultMinute={clock.minute} />
      </section>
    </div>
  );
}

function TeamBlock({ flag, name, align }: { flag: string; name: string; align: "left" | "right" }) {
  return (
    <div className={cn("min-w-0", align === "right" && "text-right")}>
      <p className="text-3xl">{flag}</p>
      <p className="font-heading text-lg font-semibold leading-tight sm:text-xl">{name}</p>
    </div>
  );
}

function ScorePad({
  side,
  label,
  disabled,
  onScore,
}: {
  side: "home" | "away";
  label: string;
  disabled: boolean;
  onScore: (kind: ScoreEventKind) => void;
}) {
  const pad =
    "rounded-lg bg-navy px-2 py-3 text-white disabled:cursor-not-allowed disabled:opacity-40 hover:enabled:brightness-110";
  return (
    <section className="rounded-xl border p-3">
      <p className="mb-3 text-center text-sm font-semibold text-navy">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          data-score-kind="try"
          data-score-side={side}
          disabled={disabled}
          onClick={() => onScore("try")}
          className={cn(pad, "col-span-2 py-4")}
        >
          <span className="block text-base font-semibold">Try</span>
          <span className="text-xs text-gold">5 pts</span>
        </button>
        <button type="button" data-score-kind="conversion" data-score-side={side} disabled={disabled} onClick={() => onScore("conversion")} className={pad}>
          <span className="block text-sm font-semibold">Conversion</span>
          <span className="text-[11px] text-gold">2 pts</span>
        </button>
        <button type="button" data-score-kind="penalty" data-score-side={side} disabled={disabled} onClick={() => onScore("penalty")} className={pad}>
          <span className="block text-sm font-semibold">Penalty</span>
          <span className="text-[11px] text-gold">3 pts</span>
        </button>
        <button type="button" data-score-kind="drop-goal" data-score-side={side} disabled={disabled} onClick={() => onScore("drop-goal")} className={pad}>
          <span className="block text-sm font-semibold">Drop goal</span>
          <span className="text-[11px] text-gold">3 pts</span>
        </button>
        <button type="button" data-score-kind="penalty-try" data-score-side={side} disabled={disabled} onClick={() => onScore("penalty-try")} className={pad}>
          <span className="block text-sm font-semibold">Penalty try</span>
          <span className="text-[11px] text-gold">7 pts</span>
        </button>
      </div>
    </section>
  );
}

function ScorerList({
  flag,
  team,
  rows,
}: {
  flag: string;
  team: string;
  rows: { name: string; bits: string[] }[];
}) {
  return (
    <section className="rounded-lg border p-4">
      <h3 className="mb-2 font-heading font-semibold text-navy">
        {flag} {team}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No points yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {rows.map((row) => (
            <li key={row.name}>
              <span className="font-medium">{row.name}</span>
              <span className="text-muted-foreground"> - {row.bits.join(", ")}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatLine({ label, home, away }: { label: string; home: number; away: number }) {
  const total = home + away || 1;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-1.5">
      <p className="text-right tabular-nums font-medium text-navy">{home}</p>
      <div className="min-w-[140px] sm:min-w-[220px]">
        <p className="mb-1 text-center text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="bg-navy" style={{ width: `${(home / total) * 100}%` }} />
          <div className="bg-gold" style={{ width: `${(away / total) * 100}%` }} />
        </div>
      </div>
      <p className="tabular-nums font-medium text-navy">{away}</p>
    </div>
  );
}

export function MatchFacts({ match }: { match: Match }) {
  const { state } = useStore();
  const competition = state.competitions.find((row) => row.id === match.competitionId);
  const venue = state.venues.find((row) => row.id === match.venueId);
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-muted-foreground">Venue</dt>
        <dd>{venue ? `${venue.name}, ${venue.city}` : "TBC"}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Competition</dt>
        <dd>
          <Link href={`/tournaments/${match.competitionId}`} className="text-navy hover:underline">
            {competition?.name}
          </Link>
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Referee</dt>
        <dd>{match.officials.referee}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">TMO</dt>
        <dd>{match.officials.tmo}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Assistant 1</dt>
        <dd>{match.officials.ar1}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Assistant 2</dt>
        <dd>{match.officials.ar2}</dd>
      </div>
    </dl>
  );
}
