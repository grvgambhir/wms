"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import type { Match, ScoreEventKind } from "@/lib/types";
import {
  SCORE_LABELS,
  SCORE_POINTS,
  emptyTeamStats,
  halfTimeScore,
  scoringTally,
  winnerLabel,
} from "@/lib/match-card";
import { clockParts } from "@/lib/match-clock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConcussionEntryForm } from "@/components/concussion/case-form";

const field = "h-10 w-full rounded-lg border border-input bg-white px-2.5 text-sm";

const KINDS: ScoreEventKind[] = ["try", "conversion", "penalty", "drop-goal", "penalty-try"];

function StatRow({
  label,
  home,
  away,
  suffix = "",
}: {
  label: string;
  home: number;
  away: number;
  suffix?: string;
}) {
  const total = home + away || 1;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-1.5">
      <p className="text-right tabular-nums font-medium text-navy">
        {home}
        {suffix}
      </p>
      <div className="min-w-[140px] sm:min-w-[220px]">
        <p className="mb-1 text-center text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="bg-navy" style={{ width: `${(home / total) * 100}%` }} />
          <div className="bg-gold" style={{ width: `${(away / total) * 100}%` }} />
        </div>
      </div>
      <p className="tabular-nums font-medium text-navy">
        {away}
        {suffix}
      </p>
    </div>
  );
}

export function MatchScorecard({ match, compact = false }: { match: Match; compact?: boolean }) {
  const { state, addMatchEvent, removeMatchEvent, startMatchClock, pauseMatchClock, resetMatchClock } = useStore();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!match.clockRunning) return;
    const id = window.setInterval(() => setTick((value) => value + 1), 250);
    return () => window.clearInterval(id);
  }, [match.clockRunning, match.id]);
  const clock = clockParts(match);
  const events = [...(match.events ?? [])].sort((a, b) => a.minute - b.minute || a.id.localeCompare(b.id));
  const ht = halfTimeScore(events, match.round.toLowerCase().includes("hong kong") || match.round.toLowerCase().includes("cup") ? 7 : 40);
  const homeSquad = state.players.filter((p) => p.teamId === match.homeTeamId).sort((a, b) => a.number - b.number);
  const awaySquad = state.players.filter((p) => p.teamId === match.awayTeamId).sort((a, b) => a.number - b.number);
  const homeStats = match.stats?.home ?? emptyTeamStats();
  const awayStats = match.stats?.away ?? emptyTeamStats();
  const homeTally = scoringTally(events, "home");
  const awayTally = scoringTally(events, "away");
  const result = winnerLabel(match);
  const [minute, setMinute] = useState("");
  const [team, setTeam] = useState<"home" | "away">("home");
  const [kind, setKind] = useState<ScoreEventKind>("try");
  const [playerId, setPlayerId] = useState("");
  const [playerName, setPlayerName] = useState("");

  const squad = team === "home" ? homeSquad : awaySquad;

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

  function onAdd(e: FormEvent) {
    e.preventDefault();
    const min = Number(minute.trim() === "" ? clock.minute : minute);
    if (!Number.isFinite(min) || min < 0) {
      toast.error("Enter a match minute, or start the timer.");
      return;
    }
    const picked = squad.find((p) => p.id === playerId);
    const name = playerName.trim() || picked?.name;
    if (!name) {
      toast.error("Name the scorer.");
      return;
    }
    addMatchEvent(match.id, {
      minute: min,
      kind,
      team,
      playerId: picked?.id,
      playerName: name,
    });
    setMinute("");
    setPlayerName("");
    toast.success(`${SCORE_LABELS[kind]} recorded.`);
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl bg-navy text-white">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 pt-3 text-[11px] font-semibold tracking-[0.16em] uppercase">
          <span className={match.status === "live" ? "text-red-400" : "text-gold"}>
            {match.status === "final" ? "Full time" : match.status === "live" ? "Live" : "Not started"}
          </span>
          <p
            data-scorecard-clock
            className="text-center font-heading text-lg font-bold leading-none tracking-normal tabular-nums text-white sm:text-xl"
          >
            {clock.label}
          </p>
          <span className="truncate text-right text-white/70">{match.round}</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 pb-5">
          <div className="min-w-0 text-left">
            <p className="text-2xl">{match.homeFlag}</p>
            {match.homeTeamId ? (
              <Link href={`/tournaments/teams/${match.homeTeamId}`} className="font-heading text-lg font-semibold hover:underline">
                {match.homeTeam}
              </Link>
            ) : (
              <p className="font-heading text-lg font-semibold">{match.homeTeam}</p>
            )}
          </div>
          <div className="text-center">
            <p data-scorecard-score className="font-heading text-4xl tabular-nums">
              {match.homeScore ?? "-"} <span className="text-gold">-</span> {match.awayScore ?? "-"}
            </p>
            <p className="mt-1 text-sm text-gold">{result}</p>
            {events.length > 0 && (
              <p className="mt-0.5 text-xs text-white/55">HT {ht.home}-{ht.away}</p>
            )}
          </div>
          <div className="min-w-0 text-right">
            <p className="text-2xl">{match.awayFlag}</p>
            {match.awayTeamId ? (
              <Link href={`/tournaments/teams/${match.awayTeamId}`} className="font-heading text-lg font-semibold hover:underline">
                {match.awayTeam}
              </Link>
            ) : (
              <p className="font-heading text-lg font-semibold">{match.awayTeam}</p>
            )}
          </div>
        </div>
      </div>

      {!compact && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3">
          <p className="mr-auto text-sm font-medium text-navy">
            Match timer <span className="tabular-nums">{clock.label}</span>
            {match.clockRunning ? <span className="ml-2 text-xs font-semibold text-emerald-700">Running</span> : null}
          </p>
          <Button type="button" size="sm" variant="brand" onClick={() => startMatchClock(match.id)} disabled={match.clockRunning}>
            {match.clockRunning ? "Running" : match.clockElapsedMs ? "Resume" : "Start"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => pauseMatchClock(match.id)} disabled={!match.clockRunning}>
            Pause
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => resetMatchClock(match.id)}>
            Reset
          </Button>
        </div>
      )}

      <section>
        <h3 className="mb-2 font-heading text-lg font-semibold text-navy">Scoring timeline</h3>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scoring plays recorded yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            {events.map((event) => (
              <div
                key={event.id}
                className="grid grid-cols-[1fr_4.5rem_1fr] items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0"
              >
                <div className="min-w-0 text-right">
                  {event.team === "home" && (
                    <p>
                      <span className="font-medium text-navy">{event.playerName}</span>
                      <span className="ml-1 text-xs text-muted-foreground">
                        {SCORE_LABELS[event.kind]} · {event.points} pts
                      </span>
                    </p>
                  )}
                </div>
                <p className="text-center text-xs font-semibold tabular-nums text-muted-foreground">{event.minute}&apos;</p>
                <div className="flex min-w-0 items-center justify-between gap-2">
                  {event.team === "away" ? (
                    <p>
                      <span className="font-medium text-navy">{event.playerName}</span>
                      <span className="ml-1 text-xs text-muted-foreground">
                        {SCORE_LABELS[event.kind]} · {event.points} pts
                      </span>
                    </p>
                  ) : (
                    <span />
                  )}
                  {!compact && (
                    <button
                      type="button"
                      className="shrink-0 text-[11px] text-muted-foreground hover:text-red-600"
                      onClick={() => removeMatchEvent(match.id, event.id)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-lg border p-4">
          <h3 className="mb-2 font-heading font-semibold text-navy">
            {match.homeFlag} {match.homeTeam} scorers
          </h3>
          {scorers.home.length === 0 ? (
            <p className="text-sm text-muted-foreground">No points yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {scorers.home.map((row) => (
                <li key={row.name}>
                  <span className="font-medium">{row.name}</span>
                  <span className="text-muted-foreground"> - {row.bits.join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-lg border p-4">
          <h3 className="mb-2 font-heading font-semibold text-navy">
            {match.awayFlag} {match.awayTeam} scorers
          </h3>
          {scorers.away.length === 0 ? (
            <p className="text-sm text-muted-foreground">No points yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {scorers.away.map((row) => (
                <li key={row.name}>
                  <span className="font-medium">{row.name}</span>
                  <span className="text-muted-foreground"> - {row.bits.join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-lg border p-4">
        <h3 className="mb-3 font-heading text-lg font-semibold text-navy">Match stats</h3>
        <StatRow label="Tries" home={homeTally.tries} away={awayTally.tries} />
        <StatRow label="Conversions" home={homeTally.conversions} away={awayTally.conversions} />
        <StatRow label="Penalties" home={homeTally.penalties} away={awayTally.penalties} />
        <StatRow label="Drop goals" home={homeTally.dropGoals} away={awayTally.dropGoals} />
        <StatRow label="Possession" home={homeStats.possession} away={awayStats.possession} suffix="%" />
        <StatRow label="Territory" home={homeStats.territory} away={awayStats.territory} suffix="%" />
        <StatRow label="Metres" home={homeStats.metres} away={awayStats.metres} />
        <StatRow label="Carries" home={homeStats.carries} away={awayStats.carries} />
        <StatRow label="Tackles" home={homeStats.tackles} away={awayStats.tackles} />
        <StatRow label="Missed tackles" home={homeStats.missedTackles} away={awayStats.missedTackles} />
        <StatRow
          label="Scrums won"
          home={homeStats.scrumsWon}
          away={awayStats.scrumsWon}
        />
        <StatRow label="Lineouts won" home={homeStats.lineoutsWon} away={awayStats.lineoutsWon} />
        <StatRow label="Turnovers" home={homeStats.turnovers} away={awayStats.turnovers} />
        <StatRow label="Penalties conceded" home={homeStats.penaltiesConceded} away={awayStats.penaltiesConceded} />
        <StatRow label="Yellow cards" home={homeStats.yellowCards} away={awayStats.yellowCards} />
        <StatRow label="Red cards" home={homeStats.redCards} away={awayStats.redCards} />
      </section>

      {!compact && (
        <form onSubmit={onAdd} className="grid gap-3 rounded-lg border bg-muted/40 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <p className="sm:col-span-2 lg:col-span-5 text-sm font-medium text-navy">Add scoring play</p>
          <div>
            <Label htmlFor="minute">Minute</Label>
            <Input id="minute" inputMode="numeric" value={minute} onChange={(e) => setMinute(e.target.value)} placeholder={String(clock.minute)} />
          </div>
          <div>
            <Label>Team</Label>
            <select className={field} value={team} onChange={(e) => { setTeam(e.target.value as "home" | "away"); setPlayerId(""); }}>
              <option value="home">{match.homeTeam}</option>
              <option value="away">{match.awayTeam}</option>
            </select>
          </div>
          <div>
            <Label>Score</Label>
            <select className={field} value={kind} onChange={(e) => setKind(e.target.value as ScoreEventKind)}>
              {KINDS.map((row) => (
                <option key={row} value={row}>
                  {SCORE_LABELS[row]} ({SCORE_POINTS[row]})
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Player</Label>
            <select className={field} value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
              <option value="">Named below…</option>
              {squad.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.number}. {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="scorer">Name</Label>
            <Input id="scorer" value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="If not in squad" />
          </div>
          <div className="sm:col-span-2 lg:col-span-5">
            <Button type="submit" variant="brand">
              Add to scorecard
            </Button>
          </div>
        </form>
      )}

      {!compact && (
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
                    <span className="text-xs text-muted-foreground">{row.diagnosis} · {row.currentHia}</span>
                  </Link>
                ))}
            </div>
          )}
          <ConcussionEntryForm matchId={match.id} defaultMinute={clock.minute} />
        </section>
      )}
    </div>
  );
}
